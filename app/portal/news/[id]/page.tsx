import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/rbac";
import { getVisibleNewsPost } from "@/lib/news";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { Card } from "@/components/ui/card";

export default async function PortalNewsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const { id } = await params;

  // getVisibleNewsPost returns null for a post that doesn't exist AND for
  // one that exists but isn't targeted at this user — both 404 identically
  // rather than distinguishing "not found" from "not allowed", so guessing
  // another department's post id doesn't confirm it exists.
  const post = await getVisibleNewsPost(user, id);
  if (!post) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Card className="overflow-hidden">
        {post.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.coverImageUrl} alt="" className="h-48 w-full object-cover sm:h-64" />
        )}
        <div className="p-6">
          <h1 className="text-[22px] font-bold tracking-tight text-fg">{post.title}</h1>
          <p className="mt-1.5 text-[13px] text-fg-subtle">
            {post.author.name}
            {post.publishedAt &&
              ` · ${post.publishedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`}
          </p>
          <MarkdownContent markdown={post.body} className="mt-5 text-[14.5px]" />
        </div>
      </Card>
    </div>
  );
}
