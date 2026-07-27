import { notFound } from "next/navigation";
import { Permission, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { updateNewsPost, deleteNewsPost, deleteNewsPostCover } from "../../actions";
import { ActionForm } from "@/components/ui/action-form";
import { DeleteButton } from "@/components/ui/delete-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MAX_NEWS_COVER_MB } from "@/lib/storage";
import { ROLE_LABELS } from "@/lib/permissions";

const ROLE_OPTIONS: Role[] = [Role.SUPER_ADMIN, Role.LOCATION_ADMIN, Role.DEPARTMENT_MANAGER, Role.EMPLOYEE];

export default async function EditNewsPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(Permission.MANAGE_NEWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);
  const { id } = await params;

  const [post, departments, locations] = await Promise.all([
    prisma.newsPost.findUnique({ where: { id } }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  if (!post) notFound();

  const submit = updateNewsPost.bind(null, post.id);
  const removeCover = deleteNewsPostCover.bind(null, post.id);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-bold tracking-tight text-fg">Edit news post</h1>
        <DeleteButton action={deleteNewsPost.bind(null, post.id)} label="Delete post" />
      </div>

      <Card className="mt-6 p-6">
        <ActionForm action={submit} encType="multipart/form-data" className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg-muted">Title</label>
            <input
              type="text"
              name="title"
              required
              defaultValue={post.title}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Body</label>
            <MarkdownEditor name="body" defaultValue={post.body} />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">
              Cover image (PNG, JPEG, or WebP — max {MAX_NEWS_COVER_MB}MB)
            </label>
            {post.coverImageMimeType && (
              <div className="mt-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/portal/news/${post.id}/cover?v=${post.updatedAt.getTime()}`}
                  alt="Current cover"
                  className="h-16 w-28 rounded-lg border border-border-strong object-cover"
                />
              </div>
            )}
            <input
              type="file"
              name="coverImage"
              accept="image/png,image/jpeg,image/webp"
              className="mt-2 block w-full text-[13px] text-fg-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-[6px] file:text-[13px] file:font-semibold file:text-fg hover:file:bg-surface-3"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg-muted">Department</label>
              <select
                name="targetDepartmentId"
                defaultValue={post.targetDepartmentId ?? ""}
                className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
              >
                <option value="">Everyone</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-muted">Location</label>
              <select
                name="targetLocationId"
                defaultValue={post.targetLocationId ?? ""}
                className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
              >
                <option value="">Everywhere</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11.5px] text-fg-subtle">Reaches every location beneath it too.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-muted">Visible only to this role</label>
              <select
                name="targetRole"
                defaultValue={post.targetRole ?? ""}
                className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
              >
                <option value="">Any role</option>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11.5px] text-fg-subtle">Exact match only — not "and above".</p>
            </div>
          </div>

          <fieldset className="flex items-center gap-4">
            <legend className="mb-1 block text-sm font-medium text-fg-muted">Status</legend>
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="radio"
                name="status"
                value="DRAFT"
                defaultChecked={post.status === "DRAFT"}
                className="accent-accent"
              />
              Draft
            </label>
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="radio"
                name="status"
                value="PUBLISHED"
                defaultChecked={post.status === "PUBLISHED"}
                className="accent-accent"
              />
              Published
            </label>
            {post.publishedAt && (
              <span className="text-[12px] text-fg-subtle">
                First published {post.publishedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
          </fieldset>

          <div className="flex justify-end gap-3">
            <a href="/admin/news">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </a>
            <Button type="submit" variant="primary">
              Save changes
            </Button>
          </div>
        </ActionForm>
        {post.coverImageMimeType && (
          <form action={removeCover} className="mt-4 flex justify-end border-t border-border pt-4">
            <Button type="submit" variant="ghost" size="sm">
              Remove cover image
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
