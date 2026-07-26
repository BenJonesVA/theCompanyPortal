import Link from "next/link";
import { requireAuth } from "@/lib/rbac";
import { listVisibleNewsPosts } from "@/lib/news";
import { markdownSnippet } from "@/lib/format";
import { Card } from "@/components/ui/card";

export default async function PortalNewsPage() {
  const user = await requireAuth();
  const posts = await listVisibleNewsPosts(user);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-fg">Company News</h1>
        <p className="mt-[3px] text-[13.5px] text-fg-muted">News and announcements relevant to you.</p>
      </div>

      <Card>
        {posts.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13.5px] text-fg-muted">No news posted yet.</p>
        ) : (
          <ul className="divide-y divide-grid">
            {posts.map((post) => (
              <li key={post.id}>
                <Link href={`/portal/news/${post.id}`} className="flex gap-4 px-5 py-4 hover:bg-surface-2">
                  {post.coverImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.coverImageUrl}
                      alt=""
                      className="h-14 w-20 flex-none rounded-md object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-fg">{post.title}</div>
                    <div className="mt-1 line-clamp-2 text-[13px] text-fg-muted">
                      {markdownSnippet(post.body, 180)}
                    </div>
                    <div className="mt-1.5 text-[12px] text-fg-subtle">
                      {post.author.name}
                      {post.publishedAt &&
                        ` · ${post.publishedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
