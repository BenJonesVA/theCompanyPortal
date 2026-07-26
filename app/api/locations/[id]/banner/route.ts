import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";
import { readAttachmentFile, bannerStorageKey } from "@/lib/storage";

// Gated by auth (not public like the branding logo) — a location banner may
// show internal-only content, and every viewer is already an authenticated
// employee by the time they'd see one rendered.
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
