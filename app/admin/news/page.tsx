import Link from "next/link";
import { Permission, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { ROLE_LABELS } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function StatusPill({ status }: { status: "DRAFT" | "PUBLISHED" }) {
  return status === "PUBLISHED" ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-green-bg px-2.5 py-0.5 text-xs font-semibold text-green">
      <span className="h-[7px] w-[7px] rounded-full bg-green" />
      Published
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-bg px-2.5 py-0.5 text-xs font-semibold text-slate">
      <span className="h-[7px] w-[7px] rounded-full bg-slate" />
      Draft
    </span>
  );
}

function targetSummary(post: {
  targetDepartment: { name: string } | null;
  targetLocation: { name: string } | null;
  targetRole: Role | null;
}): string {
  const parts: string[] = [];
  if (post.targetDepartment) parts.push(post.targetDepartment.name);
  if (post.targetLocation) parts.push(post.targetLocation.name);
  if (post.targetRole) parts.push(`Role: ${ROLE_LABELS[post.targetRole]}`);
  return parts.length > 0 ? parts.join(" · ") : "Everyone";
}

export default async function NewsAdminPage() {
  await requirePermission(Permission.MANAGE_NEWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const posts = await prisma.newsPost.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      author: { select: { name: true } },
      targetDepartment: { select: { name: true } },
      targetLocation: { select: { name: true } },
    },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-fg">Company News</h1>
          <p className="mt-[3px] text-[13.5px] text-fg-muted">
            Posts shown on the portal home, targeted by department, location, or role.
          </p>
        </div>
        <Link href="/admin/news/new">
          <Button variant="primary">
            <span className="text-[15px] leading-none">+</span>New post
          </Button>
        </Link>
      </div>

      <Card>
        {posts.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13.5px] text-fg-muted">No news posts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <th className="px-4 py-2.5">Title</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Audience</th>
                <th className="px-4 py-2.5">Author</th>
                <th className="px-4 py-2.5">Updated</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id} className="border-b border-grid last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/admin/news/${post.id}/edit`} className="font-medium text-fg hover:text-accent">
                      {post.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={post.status} />
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{targetSummary(post)}</td>
                  <td className="px-4 py-3 text-fg-muted">{post.author.name}</td>
                  <td className="px-4 py-3 text-fg-muted">
                    {post.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
