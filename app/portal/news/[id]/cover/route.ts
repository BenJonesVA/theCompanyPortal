import { Permission, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";
import { getVisibleNewsPost } from "@/lib/news";
import { readAttachmentFile, newsCoverStorageKey } from "@/lib/storage";

// Nested under /portal (not /api/news) so this stays reachable for
// EMPLOYEE-role sessions confined by middleware.ts to that path — same
// reasoning as app/portal/attachments/[id]/route.ts. Elevated roles aren't
// blocked from /portal paths either, so the admin news-edit page's own
// cover preview works unchanged through this same route.
//
// Same visibility rule as the post itself (lib/news.ts) for an ordinary
// reader — a draft, or a post targeted at a different department/location/
// role, must not leak its cover image just because the id is guessable.
// Anyone who can manage news (same gate as app/admin/news) always sees it
// regardless of status/targeting, since the admin edit page previews a
// post's cover before it's ever published.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const { id } = await params;

  const isManagerRole = user.role === Role.SUPER_ADMIN || user.role === Role.DEPARTMENT_MANAGER;
  const canManageNews = isManagerRole || (user.permissions?.includes(Permission.MANAGE_NEWS) ?? false);

  const post = canManageNews ? await prisma.newsPost.findUnique({ where: { id } }) : await getVisibleNewsPost(user, id);
  if (!post?.coverImageMimeType) return new Response("Not found", { status: 404 });

  const data = await readAttachmentFile(newsCoverStorageKey(id));
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": post.coverImageMimeType,
      "Cache-Control": "private, max-age=60",
    },
  });
}
