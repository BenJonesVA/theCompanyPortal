import {
  Prisma,
  ApprovalRequestType,
  ApprovalStageMode,
  ApproverSourceType,
  type ApprovalRequest,
  type ApprovalStageTemplate,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Display labels — shared by the admin template builder and every portal
// approvals page so the two never drift.
export const REQUEST_TYPE_LABELS: Record<ApprovalRequestType, string> = {
  [ApprovalRequestType.PURCHASE_QUOTE]: "Purchase quote",
  [ApprovalRequestType.EXPENSE_AUTHORIZATION]: "Expense authorization",
  [ApprovalRequestType.ACCESS_REQUEST]: "Access request",
  [ApprovalRequestType.HARDWARE_PROVISIONING]: "Hardware provisioning",
  [ApprovalRequestType.POLICY_EXCEPTION]: "Policy exception",
  [ApprovalRequestType.OTHER]: "Other",
};

export const STAGE_MODE_LABELS: Record<ApprovalStageMode, string> = {
  [ApprovalStageMode.ALL]: "All approvers must approve",
  [ApprovalStageMode.ANY]: "Any one approver decides",
  [ApprovalStageMode.N_OF_M]: "A minimum number must approve",
};

export const APPROVER_SOURCE_LABELS: Record<ApproverSourceType, string> = {
  [ApproverSourceType.SPECIFIC_USER]: "A specific person",
  [ApproverSourceType.ROLE]: "Anyone with this role",
  [ApproverSourceType.PERMISSION_GROUP]: "Members of this permission group",
  [ApproverSourceType.REQUESTER_MANAGER]: "Requester's manager (chain)",
  [ApproverSourceType.DEPARTMENT_MANAGER]: "Requester's department manager",
  [ApproverSourceType.LOCATION_ADMIN]: "Requester's location admin",
};

// Accepted by every helper below so the same resolution/state-machine code
// runs identically whether called standalone (pre-creation validation) or
// inside a `prisma.$transaction` (the actual materialization/decision path).
type Db = typeof prisma | Prisma.TransactionClient;

/**
 * True if any PENDING ApprovalRequest currently references this workflow
 * template. While one does, the template's stage list is frozen (see the
 * stage-template actions) — this is what makes lazy per-stage approver
 * resolution (below) safe: a stage template's approverSourceType can only
 * ever be read at two points that are guaranteed consistent, since nothing
 * can edit it in between while a request is in flight.
 */
export async function hasInFlightRequests(workflowTemplateId: string): Promise<boolean> {
  const count = await prisma.approvalRequest.count({ where: { workflowTemplateId, status: "PENDING" } });
  return count > 0;
}

/**
 * Resolves one stage template's approverSourceType to concrete, currently-
 * active User ids for a specific requester — REQUESTER_MANAGER walks
 * User.managerId managerLevelsUp hops; DEPARTMENT_MANAGER reads the
 * requester's Department.managerId; LOCATION_ADMIN looks up a
 * LOCATION_ADMIN-role user scoped to the requester's Location via
 * LocationMember; PERMISSION_GROUP/ROLE fan out to every matching active
 * User. Per ARCHITECTURE.md section A.
 *
 * The requester is always filtered out of the result — self-approval would
 * make a stage meaningless — which can legitimately empty a stage (e.g. the
 * requester IS the resolved department manager). Callers treat an empty
 * result identically to any other source that failed to resolve anyone.
 */
async function resolveApproverUserIds(
  db: Db,
  stage: Pick<ApprovalStageTemplate, "approverSourceType" | "approverUserId" | "approverPermissionGroupId" | "approverRole" | "managerLevelsUp">,
  requesterId: string
): Promise<string[]> {
  let ids: string[] = [];

  switch (stage.approverSourceType) {
    case ApproverSourceType.SPECIFIC_USER: {
      if (!stage.approverUserId) break;
      const u = await db.user.findUnique({ where: { id: stage.approverUserId }, select: { id: true, isActive: true } });
      if (u?.isActive) ids = [u.id];
      break;
    }
    case ApproverSourceType.ROLE: {
      if (!stage.approverRole) break;
      const users = await db.user.findMany({ where: { role: stage.approverRole, isActive: true }, select: { id: true } });
      ids = users.map((u) => u.id);
      break;
    }
    case ApproverSourceType.PERMISSION_GROUP: {
      if (!stage.approverPermissionGroupId) break;
      const members = await db.userPermissionGroup.findMany({
        where: { groupId: stage.approverPermissionGroupId },
        select: { userId: true },
      });
      if (members.length === 0) break;
      const users = await db.user.findMany({
        where: { id: { in: members.map((m) => m.userId) }, isActive: true },
        select: { id: true },
      });
      ids = users.map((u) => u.id);
      break;
    }
    case ApproverSourceType.REQUESTER_MANAGER: {
      let currentId: string | null = requesterId;
      const levels = stage.managerLevelsUp ?? 1;
      for (let i = 0; i < levels && currentId; i++) {
        const u: { managerId: string | null } | null = await db.user.findUnique({
          where: { id: currentId },
          select: { managerId: true },
        });
        currentId = u?.managerId ?? null;
      }
      if (currentId) {
        const u = await db.user.findUnique({ where: { id: currentId }, select: { id: true, isActive: true } });
        if (u?.isActive) ids = [u.id];
      }
      break;
    }
    case ApproverSourceType.DEPARTMENT_MANAGER: {
      const requester = await db.user.findUnique({ where: { id: requesterId }, select: { departmentId: true } });
      if (!requester?.departmentId) break;
      const dept = await db.department.findUnique({ where: { id: requester.departmentId }, select: { managerId: true } });
      if (!dept?.managerId) break;
      const u = await db.user.findUnique({ where: { id: dept.managerId }, select: { id: true, isActive: true } });
      if (u?.isActive) ids = [u.id];
      break;
    }
    case ApproverSourceType.LOCATION_ADMIN: {
      const requester = await db.user.findUnique({ where: { id: requesterId }, select: { locationId: true } });
      if (!requester?.locationId) break;
      const memberRows = await db.locationMember.findMany({
        where: { locationId: requester.locationId },
        select: { userId: true },
      });
      if (memberRows.length === 0) break;
      const users = await db.user.findMany({
        where: { id: { in: memberRows.map((m) => m.userId) }, role: "LOCATION_ADMIN", isActive: true },
        select: { id: true },
      });
      ids = users.map((u) => u.id);
      break;
    }
  }

  return [...new Set(ids)].filter((id) => id !== requesterId);
}

/**
 * An approver's active ApprovalDelegate, if any — a template-specific
 * delegate wins over a blanket (workflowTemplateId: null) one. Checked at
 * the moment a stage is entered (not at request-creation time), so a
 * delegate set up *after* submission but before this stage is reached is
 * still honored — the entire point of out-of-office delegation.
 */
async function resolveDelegateFor(db: Db, delegatorId: string, workflowTemplateId: string, now: Date): Promise<string | null> {
  const specific = await db.approvalDelegate.findFirst({
    where: { delegatorId, isActive: true, startsAt: { lte: now }, endsAt: { gte: now }, workflowTemplateId },
  });
  if (specific) return specific.delegateId;

  const blanket = await db.approvalDelegate.findFirst({
    where: { delegatorId, isActive: true, startsAt: { lte: now }, endsAt: { gte: now }, workflowTemplateId: null },
  });
  return blanket?.delegateId ?? null;
}

/**
 * Enters stage `fromOrder` of `request`, cascading forward through any
 * stage that resolves to zero approvers (marking each SKIPPED with an
 * audit row) until it finds one with at least one resolved approver — which
 * it materializes as StageApprover rows and stops on — or runs off the end
 * of the chain, in which case the whole request is APPROVED (every
 * remaining stage was skipped). Must run inside the same transaction as
 * whatever triggered it (request creation or a stage completing).
 */
async function enterStageChain(tx: Db, request: Pick<ApprovalRequest, "id" | "workflowTemplateId">, fromOrder: number, requesterId: string, now: Date): Promise<void> {
  let order = fromOrder;

  for (;;) {
    const stageInstance = await tx.approvalStageInstance.findUnique({
      where: { approvalRequestId_order: { approvalRequestId: request.id, order } },
      include: { stageTemplate: true },
    });

    if (!stageInstance) {
      await tx.approvalRequest.update({ where: { id: request.id }, data: { status: "APPROVED", decidedAt: now } });
      await tx.approvalAuditLog.create({
        data: {
          approvalRequestId: request.id,
          actorId: null,
          action: "REQUEST_APPROVED",
          comment: "All remaining stages were skipped (no approver resolved).",
        },
      });
      return;
    }

    const approverIds = stageInstance.stageTemplate
      ? await resolveApproverUserIds(tx, stageInstance.stageTemplate, requesterId)
      : [];

    if (approverIds.length === 0) {
      await tx.approvalStageInstance.update({
        where: { id: stageInstance.id },
        data: { status: "SKIPPED", startedAt: now, completedAt: now },
      });
      await tx.approvalAuditLog.create({
        data: {
          approvalRequestId: request.id,
          actorId: null,
          action: "STAGE_SKIPPED",
          comment: `Stage "${stageInstance.name}" skipped — no approver could be resolved.`,
        },
      });
      order += 1;
      continue;
    }

    for (const userId of approverIds) {
      const delegatedToId = await resolveDelegateFor(tx, userId, request.workflowTemplateId, now);
      await tx.stageApprover.create({ data: { stageInstanceId: stageInstance.id, userId, delegatedToId } });
      if (delegatedToId) {
        const [original, delegate] = await Promise.all([
          tx.user.findUnique({ where: { id: userId }, select: { name: true } }),
          tx.user.findUnique({ where: { id: delegatedToId }, select: { name: true } }),
        ]);
        await tx.approvalAuditLog.create({
          data: {
            approvalRequestId: request.id,
            actorId: null,
            action: "DELEGATED",
            comment: `Stage "${stageInstance.name}": ${original?.name ?? userId} delegated to ${delegate?.name ?? delegatedToId}.`,
          },
        });
      }
    }
    await tx.approvalStageInstance.update({
      where: { id: stageInstance.id },
      data: { status: "IN_PROGRESS", startedAt: now },
    });
    await tx.approvalRequest.update({ where: { id: request.id }, data: { currentStageOrder: order } });
    return;
  }
}

/**
 * Re-evaluates a stage's completion condition against its StageApprover
 * decisions so far:
 * - ALL: any rejection rejects the stage; every approver approved approves it.
 * - ANY: the first decision in either direction settles it.
 * - N_OF_M: `requiredApprovals` approvals approves it; rejected once it's
 *   mathematically impossible to still reach that count (the doc only
 *   defines the approval side — this is the simplest defensible symmetric
 *   rule for the reject side).
 * A qualifying rejection short-circuits the whole request to REJECTED. A
 * qualifying approval advances into the next stage via enterStageChain
 * (which itself may cascade through skips to completion).
 */
async function evaluateStage(tx: Db, stageInstanceId: string, requesterId: string, now: Date): Promise<void> {
  const stageInstance = await tx.approvalStageInstance.findUnique({
    where: { id: stageInstanceId },
    include: { approvers: true, approvalRequest: true },
  });
  if (!stageInstance) return;

  const decided = stageInstance.approvers.filter((a) => a.decision !== null);
  const approvals = decided.filter((a) => a.decision === "APPROVED").length;
  const rejections = decided.filter((a) => a.decision === "REJECTED").length;
  const total = stageInstance.approvers.length;

  let outcome: "APPROVED" | "REJECTED" | null = null;
  switch (stageInstance.mode) {
    case ApprovalStageMode.ALL:
      if (rejections > 0) outcome = "REJECTED";
      else if (approvals === total) outcome = "APPROVED";
      break;
    case ApprovalStageMode.ANY:
      if (approvals > 0) outcome = "APPROVED";
      else if (rejections > 0) outcome = "REJECTED";
      break;
    case ApprovalStageMode.N_OF_M: {
      // A stage template with no requiredApprovals set falls back to
      // requiring everyone — a missing value defaulting to 0 would
      // auto-approve the instant the stage is entered.
      const required = stageInstance.requiredApprovals ?? total;
      if (approvals >= required) outcome = "APPROVED";
      else if (total - rejections < required) outcome = "REJECTED";
      break;
    }
  }

  if (outcome === null) return;

  await tx.approvalStageInstance.update({ where: { id: stageInstance.id }, data: { status: outcome, completedAt: now } });

  if (outcome === "REJECTED") {
    await tx.approvalRequest.update({
      where: { id: stageInstance.approvalRequestId },
      data: { status: "REJECTED", decidedAt: now },
    });
    await tx.approvalAuditLog.create({
      data: {
        approvalRequestId: stageInstance.approvalRequestId,
        actorId: null,
        action: "REQUEST_REJECTED",
        comment: `Stage "${stageInstance.name}" rejected.`,
      },
    });
    return;
  }

  await tx.approvalAuditLog.create({
    data: {
      approvalRequestId: stageInstance.approvalRequestId,
      actorId: null,
      action: "STAGE_APPROVED",
      comment: `Stage "${stageInstance.name}" approved.`,
    },
  });
  await enterStageChain(tx, stageInstance.approvalRequest, stageInstance.order + 1, requesterId, now);
}

export type SubmitApprovalRequestFields = {
  title: string;
  description: string | null;
  amount: number | null;
};

/**
 * Validates that the template's first stage resolves to at least one
 * approver *before* creating anything — the one point in the chain where a
 * misconfigured "no approver found" can be reported as a clean form error
 * instead of silently skip-cascading (which is the right behavior for
 * stage 2+, reached only after a human already acted on stage 1, but would
 * be silent and surprising as the very first thing that happens on
 * submission).
 */
export async function submitApprovalRequest(
  requesterId: string,
  workflowTemplateId: string,
  fields: SubmitApprovalRequestFields
): Promise<{ error: string } | { requestId: string }> {
  const template = await prisma.approvalWorkflowTemplate.findUnique({
    where: { id: workflowTemplateId },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  if (!template || !template.isActive) return { error: "This workflow is not available." };
  if (template.stages.length === 0) return { error: "This workflow has no stages configured yet." };

  const firstStageApprovers = await resolveApproverUserIds(prisma, template.stages[0], requesterId);
  if (firstStageApprovers.length === 0) {
    return {
      error: `No approver could be resolved for the first stage ("${template.stages[0].name}"). Check the workflow template's configuration.`,
    };
  }

  const now = new Date();
  const requestId = await prisma.$transaction(async (tx) => {
    const created = await tx.approvalRequest.create({
      data: {
        workflowTemplateId: template.id,
        requesterId,
        title: fields.title,
        description: fields.description,
        requestType: template.requestType,
        amount: fields.amount,
        status: "PENDING",
        currentStageOrder: 1,
      },
    });

    for (const stage of template.stages) {
      await tx.approvalStageInstance.create({
        data: {
          approvalRequestId: created.id,
          stageTemplateId: stage.id,
          order: stage.order,
          name: stage.name,
          mode: stage.mode,
          requiredApprovals: stage.requiredApprovals,
          status: "PENDING",
        },
      });
    }

    await tx.approvalAuditLog.create({
      data: { approvalRequestId: created.id, actorId: requesterId, action: "REQUEST_SUBMITTED" },
    });

    await enterStageChain(tx, created, 1, requesterId, now);

    return created.id;
  });

  return { requestId };
}

/**
 * Records one approver's decision. Authorization requires the actor to be
 * either the row's original approver or its delegate (see
 * ApprovalDelegate) — either way, `ApprovalAuditLog.actorId` always
 * records the actual clicking user, since StageApprover itself has no
 * separate "decided by" column. The `decision: null` guard in the update
 * (rather than a separate read-then-write) closes the race where two
 * approvers on an ALL stage decide simultaneously, or a double-click
 * resubmits the same form: only the first write to land wins, and the
 * loser gets a clean "already decided" error instead of double-running
 * stage completion and double-advancing the chain.
 */
export async function recordDecision(
  actorId: string,
  stageApproverId: string,
  decision: "APPROVED" | "REJECTED",
  comment: string | null
): Promise<{ error: string } | { ok: true }> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const approver = await tx.stageApprover.findUnique({
      where: { id: stageApproverId },
      include: { stageInstance: { include: { approvalRequest: true } } },
    });
    if (!approver) return { error: "This approval item no longer exists." };
    if (approver.userId !== actorId && approver.delegatedToId !== actorId) {
      return { error: "You are not authorized to decide this approval." };
    }
    // The stage instance's own status is the authoritative "still open for
    // decisions" signal — comparing order numbers against currentStageOrder
    // instead would miss the terminal-stage case (currentStageOrder is only
    // ever bumped when *entering* a new stage, so it never advances past
    // the last stage of a chain, leaving a closed final stage looking
    // "current" forever).
    if (approver.stageInstance.status !== "IN_PROGRESS") {
      return { error: "This stage is no longer active." };
    }

    const { count } = await tx.stageApprover.updateMany({
      where: { id: stageApproverId, decision: null },
      data: { decision, comment, decidedAt: now },
    });
    if (count === 0) return { error: "This item was already decided." };

    await tx.approvalAuditLog.create({
      data: {
        approvalRequestId: approver.stageInstance.approvalRequestId,
        actorId,
        action: decision === "APPROVED" ? "STAGE_APPROVER_APPROVED" : "STAGE_APPROVER_REJECTED",
        comment,
      },
    });

    await evaluateStage(tx, approver.stageInstance.id, approver.stageInstance.approvalRequest.requesterId, now);
    return { ok: true };
  });
}

export async function cancelApprovalRequest(userId: string, requestId: string): Promise<{ error: string } | { ok: true }> {
  const request = await prisma.approvalRequest.findUnique({ where: { id: requestId }, select: { requesterId: true, status: true } });
  if (!request) return { error: "Request not found." };
  if (request.requesterId !== userId) return { error: "You can only cancel your own requests." };
  if (request.status !== "PENDING") return { error: "Only pending requests can be cancelled." };

  await prisma.$transaction([
    prisma.approvalRequest.update({ where: { id: requestId }, data: { status: "CANCELLED", decidedAt: new Date() } }),
    prisma.approvalAuditLog.create({ data: { approvalRequestId: requestId, actorId: userId, action: "REQUEST_CANCELLED" } }),
  ]);

  return { ok: true };
}

/**
 * Every StageApprover row currently awaiting `userId`'s decision — either
 * as the original approver or as someone else's active delegate. Filtering
 * on the stage instance being IN_PROGRESS (rather than also checking
 * `stageInstance.order === approvalRequest.currentStageOrder`, as an
 * upfront-resolved design would need to) is sufficient on its own here:
 * under lazy resolution, StageApprover rows for a not-yet-reached stage
 * simply don't exist yet, so there's no future-stage row to accidentally
 * surface early.
 */
export async function getMyPendingApprovals(userId: string) {
  return prisma.stageApprover.findMany({
    where: {
      decision: null,
      OR: [{ userId }, { delegatedToId: userId }],
      stageInstance: { status: "IN_PROGRESS" },
    },
    include: {
      stageInstance: {
        include: { approvalRequest: { include: { requester: { select: { name: true } } } } },
      },
    },
    orderBy: { id: "asc" },
  });
}
