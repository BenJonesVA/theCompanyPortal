"use server";

import { Permission, Role, ApprovalRequestType, ApprovalStageMode, ApproverSourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { hasInFlightRequests } from "@/lib/approvals";
import type { FormActionState } from "@/components/ui/action-form";
import type { DeleteActionState } from "@/components/ui/delete-button";

// Locked while any PENDING request references this template — see
// lib/approvals.ts's hasInFlightRequests doc comment for why this is what
// makes lazy per-stage approver resolution safe.
const LOCKED_ERROR = "This template has requests in progress — its stages are locked until they resolve.";

type TemplateFields = {
  name: string;
  requestType: ApprovalRequestType;
  description: string | null;
  amountThreshold: number | null;
  isActive: boolean;
};

function readTemplateFields(formData: FormData): { error: string } | { fields: TemplateFields } {
  const name = String(formData.get("name") ?? "").trim();
  const requestType = String(formData.get("requestType") ?? "").trim() as ApprovalRequestType;
  const description = String(formData.get("description") ?? "").trim() || null;
  const amountThresholdRaw = String(formData.get("amountThreshold") ?? "").trim();
  const isActive = formData.get("isActive") === "on";

  if (!name) return { error: "Name is required." };
  if (!Object.values(ApprovalRequestType).includes(requestType)) return { error: "Choose a request type." };

  let amountThreshold: number | null = null;
  if (amountThresholdRaw) {
    amountThreshold = Number(amountThresholdRaw);
    if (!Number.isFinite(amountThreshold) || amountThreshold < 0) {
      return { error: "Amount threshold must be a non-negative number." };
    }
  }

  return { fields: { name, requestType, description, amountThreshold, isActive } };
}

export async function createWorkflowTemplate(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  await requirePermission(Permission.MANAGE_APPROVAL_WORKFLOWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const parsed = readTemplateFields(formData);
  if ("error" in parsed) return parsed;

  const template = await prisma.approvalWorkflowTemplate.create({ data: parsed.fields });

  revalidatePath("/admin/approval-workflows");
  redirect(`/admin/approval-workflows/${template.id}/edit`);
}

export async function updateWorkflowTemplate(templateId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  await requirePermission(Permission.MANAGE_APPROVAL_WORKFLOWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const parsed = readTemplateFields(formData);
  if ("error" in parsed) return parsed;

  await prisma.approvalWorkflowTemplate.update({ where: { id: templateId }, data: parsed.fields });

  revalidatePath("/admin/approval-workflows");
  revalidatePath(`/admin/approval-workflows/${templateId}/edit`);
  return null;
}

export async function deleteWorkflowTemplate(templateId: string, _prevState: DeleteActionState, _formData: FormData): Promise<DeleteActionState> {
  await requirePermission(Permission.MANAGE_APPROVAL_WORKFLOWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  if (await hasInFlightRequests(templateId)) {
    return { error: LOCKED_ERROR };
  }

  await prisma.approvalWorkflowTemplate.delete({ where: { id: templateId } });

  revalidatePath("/admin/approval-workflows");
  redirect("/admin/approval-workflows");
}

type StageFields = {
  name: string;
  mode: ApprovalStageMode;
  requiredApprovals: number | null;
  approverSourceType: ApproverSourceType;
  approverUserId: string | null;
  approverPermissionGroupId: string | null;
  approverRole: Role | null;
  managerLevelsUp: number | null;
};

function readStageFields(formData: FormData): { error: string } | { fields: StageFields } {
  const name = String(formData.get("name") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim() as ApprovalStageMode;
  const approverSourceType = String(formData.get("approverSourceType") ?? "").trim() as ApproverSourceType;

  if (!name) return { error: "Stage name is required." };
  if (!Object.values(ApprovalStageMode).includes(mode)) return { error: "Choose an approval mode." };
  if (!Object.values(ApproverSourceType).includes(approverSourceType)) return { error: "Choose an approver source." };

  let requiredApprovals: number | null = null;
  if (mode === ApprovalStageMode.N_OF_M) {
    requiredApprovals = Number(formData.get("requiredApprovals"));
    if (!Number.isInteger(requiredApprovals) || requiredApprovals < 1) {
      return { error: "Required approvals must be a whole number of at least 1 for this mode." };
    }
  }

  const approverUserId = String(formData.get("approverUserId") ?? "").trim() || null;
  const approverPermissionGroupId = String(formData.get("approverPermissionGroupId") ?? "").trim() || null;
  const approverRoleRaw = String(formData.get("approverRole") ?? "").trim();
  const approverRole = approverRoleRaw ? (approverRoleRaw as Role) : null;
  let managerLevelsUp: number | null = null;

  if (approverSourceType === ApproverSourceType.SPECIFIC_USER && !approverUserId) {
    return { error: "Choose a specific person for this stage." };
  }
  if (approverSourceType === ApproverSourceType.PERMISSION_GROUP && !approverPermissionGroupId) {
    return { error: "Choose a permission group for this stage." };
  }
  if (approverSourceType === ApproverSourceType.ROLE && !approverRole) {
    return { error: "Choose a role for this stage." };
  }
  if (approverSourceType === ApproverSourceType.REQUESTER_MANAGER) {
    managerLevelsUp = Number(formData.get("managerLevelsUp") ?? "1");
    if (!Number.isInteger(managerLevelsUp) || managerLevelsUp < 1) {
      return { error: "Manager levels up must be a whole number of at least 1." };
    }
  }

  return {
    fields: { name, mode, requiredApprovals, approverSourceType, approverUserId, approverPermissionGroupId, approverRole, managerLevelsUp },
  };
}

export async function createStageTemplate(workflowTemplateId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  await requirePermission(Permission.MANAGE_APPROVAL_WORKFLOWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  if (await hasInFlightRequests(workflowTemplateId)) {
    return { error: LOCKED_ERROR };
  }

  const parsed = readStageFields(formData);
  if ("error" in parsed) return parsed;

  const maxOrder = await prisma.approvalStageTemplate.aggregate({
    where: { workflowTemplateId },
    _max: { order: true },
  });

  await prisma.approvalStageTemplate.create({
    data: { workflowTemplateId, order: (maxOrder._max.order ?? 0) + 1, ...parsed.fields },
  });

  revalidatePath(`/admin/approval-workflows/${workflowTemplateId}/edit`);
  redirect(`/admin/approval-workflows/${workflowTemplateId}/edit`);
}

export async function updateStageTemplate(
  workflowTemplateId: string,
  stageId: string,
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  await requirePermission(Permission.MANAGE_APPROVAL_WORKFLOWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  if (await hasInFlightRequests(workflowTemplateId)) {
    return { error: LOCKED_ERROR };
  }

  const parsed = readStageFields(formData);
  if ("error" in parsed) return parsed;

  await prisma.approvalStageTemplate.update({ where: { id: stageId }, data: parsed.fields });

  revalidatePath(`/admin/approval-workflows/${workflowTemplateId}/edit`);
  return null;
}

export async function deleteStageTemplate(workflowTemplateId: string, stageId: string) {
  await requirePermission(Permission.MANAGE_APPROVAL_WORKFLOWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  if (await hasInFlightRequests(workflowTemplateId)) {
    return;
  }

  await prisma.approvalStageTemplate.delete({ where: { id: stageId } });

  revalidatePath(`/admin/approval-workflows/${workflowTemplateId}/edit`);
}
