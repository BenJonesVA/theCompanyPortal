import { CalendarEventCategory, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadLocationAncestryResolver } from "@/lib/locations";

// Shared display labels — used by both the admin authoring UI and the
// employee-facing events list so the two never drift.
export const CALENDAR_CATEGORY_LABELS: Record<CalendarEventCategory, string> = {
  [CalendarEventCategory.HOLIDAY]: "Holiday",
  [CalendarEventCategory.DEPARTMENT_EVENT]: "Department event",
  [CalendarEventCategory.OFFICE_EVENT]: "Office event",
  [CalendarEventCategory.MAINTENANCE_WINDOW]: "Maintenance window",
};

export type CalendarAudienceUser = {
  locationId?: string | null;
  departmentId?: string | null;
};

/**
 * The targeting half of visibility — same two independent, nullable-
 * condition axes as lib/news.ts's targetingWhere, minus the role axis
 * (events aren't role-restricted). Takes the already-resolved ancestor-id
 * chain rather than a locationId so it stays synchronous — callers await
 * `loadLocationAncestryResolver()` once and reuse it.
 */
function targetingWhere(user: CalendarAudienceUser, locationIds: string[]): Prisma.CalendarEventWhereInput {
  // Normalized to `null` explicitly (never left `undefined`) — Prisma drops
  // an `undefined`-valued key from a where object entirely, which inside an
  // OR branch here would silently turn into "matches everything".
  const departmentId = user.departmentId ?? null;
  return {
    AND: [
      { OR: [{ targetDepartmentId: null }, { targetDepartmentId: departmentId }] },
      { OR: [{ targetLocationId: null }, { targetLocationId: { in: locationIds } }] },
    ],
  };
}

/**
 * Every CalendarEvent visible to `user` that hasn't ended yet, soonest
 * first. targetLocationId also reaches every location *below* it in the
 * hierarchy (an event targeted at the user's Regional Hub or Corporate HQ is
 * visible too), resolved via lib/locations.ts's ancestor-chain walk — a user
 * with no locationId only sees events with no location targeting at all.
 */
export async function listVisibleCalendarEvents(user: CalendarAudienceUser, now: Date = new Date()) {
  const locationIds = user.locationId ? (await loadLocationAncestryResolver())(user.locationId) : [];

  return prisma.calendarEvent.findMany({
    where: { endsAt: { gte: now }, ...targetingWhere(user, locationIds) },
    orderBy: { startsAt: "asc" },
    include: { rsvps: { select: { userId: true, status: true } } },
  });
}

/**
 * Single-event visibility check reached by id — same rules as
 * `listVisibleCalendarEvents`, scoped to one row. Used to authorize an RSVP
 * so a user can't record attendance on an event never targeted at them.
 * Returns null (not just "not visible") for an event that doesn't exist OR
 * isn't visible to this user, so callers can treat both identically.
 */
export async function getVisibleCalendarEvent(user: CalendarAudienceUser, eventId: string, now: Date = new Date()) {
  const locationIds = user.locationId ? (await loadLocationAncestryResolver())(user.locationId) : [];

  return prisma.calendarEvent.findFirst({
    where: { id: eventId, endsAt: { gte: now }, ...targetingWhere(user, locationIds) },
  });
}
