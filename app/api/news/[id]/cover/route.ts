import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";
import { readAttachmentFile, newsCoverStorageKey } from "@/lib/storage";

// Gated by auth, same as the location banner route — every viewer is
// already an authenticated employee by the time a news post reaches them.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth();

  const { id } = await params;
  const post = await prisma.newsPost.findUnique({ where: { id } });
  if (!post?.coverImageMimeType) return new Response("Not found", { status: 404 });

  const data = await readAttachmentFile(newsCoverStorageKey(id));
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": post.coverImageMimeType,
      "Cache-Control": "private, max-age=60",
    },
  });
}
