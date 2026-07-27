"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { recordDecision } from "@/lib/approvals";
import { syncApprovalNotifications } from "@/lib/approval-notifications";
import type { FormActionState } from "@/components/ui/action-form";

// No session exists on this route — the unguessable magicLinkToken in the
// URL is the authorization (same trust model as /csat/[id]). The actor
// recorded is whoever the token was actually issued to: the delegate if one
// was substituted at stage-entry time, else the original approver.
export async function decideViaToken(
  token: string,
  decision: "APPROVED" | "REJECTED",
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const approver = await prisma.stageApprover.findUnique({
    where: { magicLinkToken: token },
    select: { id: true, userId: true, delegatedToId: true, stageInstance: { select: { approvalRequestId: true } } },
  });
  if (!approver) return { error: "This link is no longer valid." };

  const actorId = approver.delegatedToId ?? approver.userId;
  const comment = String(formData.get("comment") ?? "").trim() || null;

  const result = await recordDecision(actorId, approver.id, decision, comment);
  if ("error" in result) return result;

  await syncApprovalNotifications(approver.stageInstance.approvalRequestId);

  revalidatePath(`/approve/${token}`);
  return null;
}
