import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadLocationAncestryResolver } from "@/lib/locations";

export type NewsAudienceUser = {
  locationId: string | null;
  departmentId: string | null;
  role: Role;
};

/**
 * Every NewsPost visible to `user` right now: PUBLISHED with a publishedAt
 * that isn't in the future, matching on all three independent,
 * nullable-condition targeting axes — same "unset = matches everyone on
 * that axis" shape as AutomationRule's conditions (see the NewsPost model
 * comment in schema.prisma). targetLocationId also reaches every location
 * *below* it in the hierarchy (a post targeted at the user's Regional Hub
 * or Corporate HQ is visible too), resolved via lib/locations.ts's
 * ancestor-chain walk — a user with no locationId only sees posts with no
 * location targeting at all, since there's no chain to walk.
 */
export async function listVisibleNewsPosts(user: NewsAudienceUser, now: Date = new Date()) {
  const locationIds = user.locationId ? (await loadLocationAncestryResolver())(user.locationId) : [];

  return prisma.newsPost.findMany({
    where: {
      status: "PUBLISHED",
      publishedAt: { lte: now },
      AND: [
        { OR: [{ targetDepartmentId: null }, { targetDepartmentId: user.departmentId }] },
        { OR: [{ targetLocationId: null }, { targetLocationId: { in: locationIds } }] },
        { OR: [{ targetRole: null }, { targetRole: user.role }] },
      ],
    },
    orderBy: { publishedAt: "desc" },
    include: { author: { select: { name: true } } },
  });
}
