"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/rbac";
import type { FormActionState } from "@/components/ui/action-form";

export async function createDelegate(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const user = await requireAuth();

  const delegateId = String(formData.get("delegateId") ?? "").trim();
  const workflowTemplateId = String(formData.get("workflowTemplateId") ?? "").trim() || null;
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();
  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();

  if (!delegateId) return { error: "Choose who to delegate to." };
  if (delegateId === user.id) return { error: "You can't delegate to yourself." };

  const startsAt = startsAtRaw ? new Date(startsAtRaw) : null;
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime()) || !endsAt || Number.isNaN(endsAt.getTime())) {
    return { error: "Start and end dates are required." };
  }
  if (endsAt <= startsAt) return { error: "End date must be after the start date." };

  await prisma.approvalDelegate.create({
    data: { delegatorId: user.id, delegateId, workflowTemplateId, startsAt, endsAt, isActive: true },
  });

  revalidatePath("/portal/approvals/delegates");
  return null;
}

export async function endDelegate(delegateRowId: string) {
  const user = await requireAuth();

  await prisma.approvalDelegate.updateMany({
    where: { id: delegateRowId, delegatorId: user.id },
    data: { isActive: false },
  });

  revalidatePath("/portal/approvals/delegates");
}
