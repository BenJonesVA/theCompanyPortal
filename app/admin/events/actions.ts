"use server";

import { Permission, Role, CalendarEventCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import type { FormActionState } from "@/components/ui/action-form";
import type { DeleteActionState } from "@/components/ui/delete-button";

type EventFields = {
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  category: CalendarEventCategory;
  targetDepartmentId: string | null;
  targetLocationId: string | null;
};

// Validated up front, before any database write — same rationale as
// app/admin/news/actions.ts's readFields.
function readFields(formData: FormData): { error: string } | { fields: EventFields } {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const category = (String(formData.get("category") ?? "").trim() || "OFFICE_EVENT") as CalendarEventCategory;
  const targetDepartmentId = String(formData.get("targetDepartmentId") ?? "").trim() || null;
  const targetLocationId = String(formData.get("targetLocationId") ?? "").trim() || null;

  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();
  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();
  const startsAt = startsAtRaw ? new Date(startsAtRaw) : null;
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;

  if (!title) {
    return { error: "Title is required." };
  }
  if (!startsAt || Number.isNaN(startsAt.getTime()) || !endsAt || Number.isNaN(endsAt.getTime())) {
    return { error: "Start and end date/time are required." };
  }
  if (endsAt <= startsAt) {
    return { error: "End time must be after the start time." };
  }

  return { fields: { title, description, startsAt, endsAt, category, targetDepartmentId, targetLocationId } };
}

export async function createCalendarEvent(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const user = await requirePermission(Permission.MANAGE_EVENTS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const parsed = readFields(formData);
  if ("error" in parsed) return parsed;

  const event = await prisma.calendarEvent.create({
    data: { ...parsed.fields, createdById: user.id },
  });

  revalidatePath("/admin/events");
  redirect(`/admin/events/${event.id}/edit`);
}

export async function updateCalendarEvent(
  eventId: string,
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  await requirePermission(Permission.MANAGE_EVENTS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const parsed = readFields(formData);
  if ("error" in parsed) return parsed;

  const existing = await prisma.calendarEvent.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!existing) return { error: "This event no longer exists." };

  await prisma.calendarEvent.update({ where: { id: eventId }, data: parsed.fields });

  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}/edit`);
  return null;
}

export async function deleteCalendarEvent(
  eventId: string,
  _prevState: DeleteActionState,
  _formData: FormData
): Promise<DeleteActionState> {
  await requirePermission(Permission.MANAGE_EVENTS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  await prisma.calendarEvent.delete({ where: { id: eventId } });

  revalidatePath("/admin/events");
  redirect("/admin/events");
}
