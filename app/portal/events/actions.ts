"use server";

import { RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/rbac";
import { getVisibleCalendarEvent } from "@/lib/calendar";

// Authorizes against getVisibleCalendarEvent (not just requireAuth) so a
// user can't record attendance on an event never targeted at them —
// mirrors the visibility-vs-auth distinction lib/news.ts's cover-image route
// draws for hidden/draft posts.
export async function rsvpToEvent(eventId: string, status: RsvpStatus) {
  const user = await requireAuth();

  const event = await getVisibleCalendarEvent(user, eventId);
  if (!event) return;

  await prisma.eventRsvp.upsert({
    where: { eventId_userId: { eventId, userId: user.id } },
    create: { eventId, userId: user.id, status },
    update: { status },
  });

  revalidatePath("/portal/events");
  revalidatePath("/portal");
}
