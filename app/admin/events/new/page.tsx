import { Permission, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { CALENDAR_CATEGORY_LABELS } from "@/lib/calendar";
import { createCalendarEvent } from "../actions";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function NewCalendarEventPage() {
  await requirePermission(Permission.MANAGE_EVENTS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const [departments, locations] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[24px] font-bold tracking-tight text-fg">New calendar event</h1>

      <Card className="mt-6 p-6">
        <ActionForm action={createCalendarEvent} className="space-y-4">
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
            <label className="block text-sm font-medium text-fg-muted">Description</label>
            <textarea
              name="description"
              rows={4}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg-muted">Starts</label>
              <input
                type="datetime-local"
                name="startsAt"
                required
                className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-muted">Ends</label>
              <input
                type="datetime-local"
                name="endsAt"
                required
                className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Category</label>
            <select
              name="category"
              defaultValue="OFFICE_EVENT"
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            >
              {Object.entries(CALENDAR_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
          </div>

          <div className="flex justify-end gap-3">
            <a href="/admin/events">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </a>
            <Button type="submit" variant="primary">
              Create event
            </Button>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
