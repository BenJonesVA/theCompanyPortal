import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { Role } from "@prisma/client";

// No configurable-per-workflow threshold model exists yet (would need a
// schema field) — hardcoded here, same spirit as the fixed dedup markers in
// app/api/cron/sla-breach-check/route.ts. Revisit if a real need for
// per-template tuning shows up.
const REMINDER_AFTER_HOURS = 24;
const ESCALATION_AFTER_HOURS = 72;

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3131";
}

const approverInclude = {
  stageInstance: { include: { approvalRequest: true } },
} as const;

async function sendApproverNotice(
  approver: { id: string; userId: string; delegatedToId: string | null },
  requestId: string,
  requestTitle: string,
  isReminder: boolean
): Promise<void> {
  const recipientId = approver.delegatedToId ?? approver.userId;
  const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { email: true } });

  const reviewUrl = `${appUrl()}/portal/approvals/${requestId}`;
  const subject = isReminder ? `Reminder: approval needed — ${requestTitle}` : `Approval needed: ${requestTitle}`;
  const message = isReminder
    ? `Reminder: "${requestTitle}" is still waiting on your approval.`
    : `"${requestTitle}" needs your approval.`;

  if (recipient?.email) {
    await sendEmail({
      to: recipient.email,
      subject,
      html: `<p>${message}</p><p><a href="${reviewUrl}">Review and decide</a></p>`,
    });
  }

  await prisma.notification.create({
    data: {
      userId: recipientId,
      type: isReminder ? "APPROVAL_DECISION_NEEDED" : "APPROVAL_REQUESTED",
      message,
    },
  });

  await prisma.stageApprover.update({ where: { id: approver.id }, data: { notifiedAt: new Date() } });
}

/**
 * Notifies every StageApprover on requestId's current stage that has never
 * been notified yet (notifiedAt IS NULL). Self-contained and idempotent by
 * design: call it after any successful lib/approvals.ts mutation
 * (submission, decision, magic-link decision) with no need to know which
 * stage was just entered — a brand-new stage's approvers are, by
 * definition, the only ones with notifiedAt still null.
 */
export async function notifyPendingApprovers(requestId: string): Promise<void> {
  const pending = await prisma.stageApprover.findMany({
    where: { decision: null, notifiedAt: null, stageInstance: { approvalRequestId: requestId, status: "IN_PROGRESS" } },
    include: approverInclude,
  });

  for (const approver of pending) {
    await sendApproverNotice(approver, requestId, approver.stageInstance.approvalRequest.title, false);
  }
}

/**
 * Notifies the requester once their request reaches a terminal state.
 * Deduped on (userId, type, message) — a caller invoking
 * syncApprovalNotifications more than once for an already-terminal request
 * (e.g. a decide-then-view-then-decide-again sequence, or any other
 * accidental repeat call) must not re-send the outcome email/notification.
 */
export async function notifyRequestOutcome(requestId: string): Promise<void> {
  const request = await prisma.approvalRequest.findUnique({
    where: { id: requestId },
    include: { requester: { select: { id: true, email: true } } },
  });
  if (!request || (request.status !== "APPROVED" && request.status !== "REJECTED")) return;

  const approved = request.status === "APPROVED";
  const type = approved ? ("APPROVAL_APPROVED" as const) : ("APPROVAL_REJECTED" as const);
  const reviewUrl = `${appUrl()}/portal/approvals/${request.id}`;
  const message = `Your request "${request.title}" was ${approved ? "approved" : "rejected"}.`;

  const alreadyNotified = await prisma.notification.findFirst({ where: { userId: request.requester.id, type, message } });
  if (alreadyNotified) return;

  if (request.requester.email) {
    await sendEmail({
      to: request.requester.email,
      subject: `Request ${approved ? "approved" : "rejected"}: ${request.title}`,
      html: `<p>${message}</p><p><a href="${reviewUrl}">View details</a></p>`,
    });
  }

  await prisma.notification.create({ data: { userId: request.requester.id, type, message } });
}

/** Call after any successful submit/decide/magic-link-decide — covers both notification concerns for that requestId. */
export async function syncApprovalNotifications(requestId: string): Promise<void> {
  await notifyPendingApprovers(requestId);
  await notifyRequestOutcome(requestId);
}

/**
 * Scheduled sweep (app/api/cron/approval-sweep/route.ts): sends reminders
 * for StageApprover rows notified more than REMINDER_AFTER_HOURS ago and
 * still undecided, and escalates ApprovalStageInstances that have sat
 * IN_PROGRESS for more than ESCALATION_AFTER_HOURS. Also re-runs the
 * never-notified query as a self-heal in case a direct notify call above
 * was interrupted mid-request.
 */
export async function runApprovalReminderSweep(now: Date = new Date()) {
  const reminderCutoff = new Date(now.getTime() - REMINDER_AFTER_HOURS * 3_600_000);
  const escalationCutoff = new Date(now.getTime() - ESCALATION_AFTER_HOURS * 3_600_000);

  const neverNotified = await prisma.stageApprover.findMany({
    where: { decision: null, notifiedAt: null, stageInstance: { status: "IN_PROGRESS" } },
    include: approverInclude,
  });
  for (const approver of neverNotified) {
    await sendApproverNotice(approver, approver.stageInstance.approvalRequestId, approver.stageInstance.approvalRequest.title, false);
  }

  const stale = await prisma.stageApprover.findMany({
    where: { decision: null, notifiedAt: { lt: reminderCutoff }, stageInstance: { status: "IN_PROGRESS" } },
    include: approverInclude,
  });
  for (const approver of stale) {
    await sendApproverNotice(approver, approver.stageInstance.approvalRequestId, approver.stageInstance.approvalRequest.title, true);
  }

  const stuckStages = await prisma.approvalStageInstance.findMany({
    where: { status: "IN_PROGRESS", startedAt: { lt: escalationCutoff } },
    include: { approvalRequest: { include: { requester: { select: { id: true, email: true } } } } },
  });

  let escalated = 0;
  for (const stage of stuckStages) {
    // Dedup via the audit trail rather than a new column: an ESCALATED row
    // written since this stage started means it was already escalated.
    const alreadyEscalated = await prisma.approvalAuditLog.findFirst({
      where: { approvalRequestId: stage.approvalRequestId, action: "ESCALATED", createdAt: { gte: stage.startedAt! } },
    });
    if (alreadyEscalated) continue;

    const request = stage.approvalRequest;
    const comment = `Stage "${stage.name}" has been pending for over ${ESCALATION_AFTER_HOURS}h.`;

    await prisma.approvalAuditLog.create({
      data: { approvalRequestId: stage.approvalRequestId, actorId: null, action: "ESCALATED", comment },
    });

    const overseers = await prisma.user.findMany({
      where: { role: { in: [Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER] }, isActive: true },
      select: { id: true, email: true },
    });
    const reviewUrl = `${appUrl()}/portal/approvals/${request.id}`;
    const message = `"${request.title}" is stuck at stage "${stage.name}" — ${comment}`;
    const recipients = [request.requester, ...overseers].filter((u, i, arr) => arr.findIndex((x) => x.id === u.id) === i);
    const emails = recipients.map((u) => u.email).filter((e): e is string => !!e);

    if (emails.length > 0) {
      await sendEmail({ to: emails, subject: `Approval stuck: ${request.title}`, html: `<p>${message}</p><p><a href="${reviewUrl}">View request</a></p>` });
    }
    await prisma.notification.createMany({
      data: recipients.map((u) => ({ userId: u.id, type: "APPROVAL_ESCALATED" as const, message })),
    });

    escalated++;
  }

  return { notified: neverNotified.length, reminded: stale.length, escalated };
}
