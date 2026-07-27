"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/rbac";
import { submitApprovalRequest, recordDecision, cancelApprovalRequest } from "@/lib/approvals";
import type { FormActionState } from "@/components/ui/action-form";
import type { DeleteActionState } from "@/components/ui/delete-button";

export async function submitRequest(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const user = await requireAuth();

  const workflowTemplateId = String(formData.get("workflowTemplateId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const amountRaw = String(formData.get("amount") ?? "").trim();

  if (!workflowTemplateId) return { error: "Choose a workflow." };
  if (!title) return { error: "Title is required." };

  let amount: number | null = null;
  if (amountRaw) {
    amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount < 0) return { error: "Amount must be a non-negative number." };
  }

  const result = await submitApprovalRequest(user.id, workflowTemplateId, { title, description, amount });
  if ("error" in result) return result;

  revalidatePath("/portal/approvals");
  redirect(`/portal/approvals/${result.requestId}`);
}

export async function decide(
  stageApproverId: string,
  decision: "APPROVED" | "REJECTED",
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const user = await requireAuth();
  const comment = String(formData.get("comment") ?? "").trim() || null;

  const result = await recordDecision(user.id, stageApproverId, decision, comment);
  if ("error" in result) return result;

  revalidatePath("/portal/approvals");
  return null;
}

export async function cancelRequest(requestId: string, _prevState: DeleteActionState, _formData: FormData): Promise<DeleteActionState> {
  const user = await requireAuth();

  const result = await cancelApprovalRequest(user.id, requestId);
  if ("error" in result) return result;

  revalidatePath("/portal/approvals");
  revalidatePath(`/portal/approvals/${requestId}`);
  return null;
}
