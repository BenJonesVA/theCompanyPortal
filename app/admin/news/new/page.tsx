import { Permission, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { createNewsPost } from "../actions";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MAX_NEWS_COVER_MB } from "@/lib/storage";

const ROLE_OPTIONS: Role[] = [Role.SUPER_ADMIN, Role.LOCATION_ADMIN, Role.DEPARTMENT_MANAGER, Role.EMPLOYEE];

export default async function NewNewsPostPage() {
  await requirePermission(Permission.MANAGE_NEWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const [departments, locations] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[24px] font-bold tracking-tight text-fg">New news post</h1>

      <Card className="mt-6 p-6">
        <ActionForm action={createNewsPost} encType="multipart/form-data" className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg-muted">Title</label>
            <input
              type="text"
              name="title"
              required
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Body</label>
            <MarkdownEditor name="body" defaultValue="" />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">
              Cover image (PNG, JPEG, or WebP — max {MAX_NEWS_COVER_MB}MB, optional)
            </label>
            <input
              type="file"
              name="coverImage"
              accept="image/png,image/jpeg,image/webp"
              className="mt-1 block w-full text-[13px] text-fg-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-[6px] file:text-[13px] file:font-semibold file:text-fg hover:file:bg-surface-3"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg-muted">Department</label>
              <select
                name="targetDepartmentId"
                defaultValue=""
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
                defaultValue=""
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
                defaultValue=""
                className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
              >
                <option value="">Any role</option>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11.5px] text-fg-subtle">Exact match only — not "and above".</p>
            </div>
          </div>

          <fieldset className="flex items-center gap-4">
            <legend className="mb-1 block text-sm font-medium text-fg-muted">Status</legend>
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input type="radio" name="status" value="DRAFT" defaultChecked className="accent-accent" />
              Save as draft
            </label>
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input type="radio" name="status" value="PUBLISHED" className="accent-accent" />
              Publish now
            </label>
          </fieldset>

          <div className="flex justify-end gap-3">
            <a href="/admin/news">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </a>
            <Button type="submit" variant="primary">
              Create post
            </Button>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
