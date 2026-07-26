import type { Role, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadLocationAncestryResolver } from "@/lib/locations";

export type NewsAudienceUser = {
  locationId?: string | null;
  departmentId?: string | null;
  role: Role;
};

/**
 * The targeting half of visibility — all three independent, nullable-
 * condition axes (see the NewsPost model comment in schema.prisma). Takes
 * the already-resolved ancestor-id chain rather than a locationId so it
 * stays synchronous: callers await `loadLocationAncestryResolver()` once
 * and reuse it, instead of this helper re-awaiting per call.
 */
function targetingWhere(user: NewsAudienceUser, locationIds: string[]): Prisma.NewsPostWhereInput {
  // Normalized to `null` explicitly (never left `undefined`) — Prisma drops
  // an `undefined`-valued key from a where object entirely, which inside an
  // OR branch here would silently turn into "matches everything" instead
  // of "matches no department/nothing set".
  const departmentId = user.departmentId ?? null;
  return {
    AND: [
      { OR: [{ targetDepartmentId: null }, { targetDepartmentId: departmentId }] },
      { OR: [{ targetLocationId: null }, { targetLocationId: { in: locationIds } }] },
      { OR: [{ targetRole: null }, { targetRole: user.role }] },
    ],
  };
}

/**
 * Every NewsPost visible to `user` right now: PUBLISHED with a publishedAt
 * that isn't in the future, matching all three targeting axes.
 * targetLocationId also reaches every location *below* it in the hierarchy
 * (a post targeted at the user's Regional Hub or Corporate HQ is visible
 * too), resolved via lib/locations.ts's ancestor-chain walk — a user with
 * no locationId only sees posts with no location targeting at all, since
 * there's no chain to walk.
 */
export async function listVisibleNewsPosts(user: NewsAudienceUser, now: Date = new Date()) {
  const locationIds = user.locationId ? (await loadLocationAncestryResolver())(user.locationId) : [];

  return prisma.newsPost.findMany({
    where: { status: "PUBLISHED", publishedAt: { lte: now }, ...targetingWhere(user, locationIds) },
    orderBy: { publishedAt: "desc" },
    include: { author: { select: { name: true } } },
  });
}

/**
 * Single-post visibility check for a detail page reached by id — same
 * rules as `listVisibleNewsPosts`, scoped to one row. Returns null (not
 * just "not visible") for a post that doesn't exist OR isn't visible to
 * this user, so callers can treat both identically as 404 without leaking
 * which one it was.
 */
export async function getVisibleNewsPost(user: NewsAudienceUser, postId: string, now: Date = new Date()) {
  const locationIds = user.locationId ? (await loadLocationAncestryResolver())(user.locationId) : [];

  return prisma.newsPost.findFirst({
    where: { id: postId, status: "PUBLISHED", publishedAt: { lte: now }, ...targetingWhere(user, locationIds) },
    include: { author: { select: { name: true } } },
  });
}
