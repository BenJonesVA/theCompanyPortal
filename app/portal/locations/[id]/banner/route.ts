import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";
import { readAttachmentFile, bannerStorageKey } from "@/lib/storage";

// Nested under /portal (not /api/locations) so this stays reachable for
// EMPLOYEE-role sessions confined by middleware.ts to that path — same
// reasoning as app/portal/attachments/[id]/route.ts. Elevated roles aren't
// blocked from /portal paths either, so the admin location-detail page's
// own banner preview works unchanged through this same route.
//
// Gated by auth only (not public like the branding logo) — a location
// banner isn't targeted/restricted content, every authenticated employee
// can see any location's banner.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth();

  const { id } = await params;
  const config = await prisma.locationPageConfig.findUnique({ where: { locationId: id } });
  if (!config?.bannerImageMimeType) return new Response("Not found", { status: 404 });

  const data = await readAttachmentFile(bannerStorageKey(id));
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": config.bannerImageMimeType,
      "Cache-Control": "private, max-age=60",
    },
  });
}
