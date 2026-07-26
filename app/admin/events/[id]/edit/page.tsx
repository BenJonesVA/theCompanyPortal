import { notFound } from "next/navigation";
import { Permission, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { CALENDAR_CATEGORY_LABELS } from "@/lib/calendar";
import { updateCalendarEvent, deleteCalendarEvent } from "../../actions";
import { ActionForm } from "@/components/ui/action-form";
import { DeleteButton } from "@/components/ui/delete-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in the *local* timezone —
// toISOString() would shift to UTC and silently mis-render the stored time.
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function EditCalendarEventPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(Permission.MANAGE_EVENTS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);
  const { id } = await params;

  const [event, departments, locations] = await Promise.all([
    prisma.calendarEvent.findUnique({ where: { id } }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  if (!event) notFound();

  const submit = updateCalendarEvent.bind(null, event.id);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-bold tracking-tight text-fg">Edit calendar event</h1>
        <DeleteButton action={deleteCalendarEvent.bind(null, event.id)} label="Delete event" />
      </div>

      <Card className="mt-6 p-6">
        <ActionForm action={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg-muted">Title</label>
            <input
              type="text"
              name="title"
              required
              defaultValue={event.title}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Description</label>
            <textarea
              name="description"
              rows={4}
              defaultValue={event.description ?? ""}
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
                defaultValue={toLocalInputValue(event.startsAt)}
                className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-muted">Ends</label>
              <input
                type="datetime-local"
                name="endsAt"
                required
                defaultValue={toLocalInputValue(event.endsAt)}
                className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Category</label>
            <select
              name="category"
              defaultValue={event.category}
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
                defaultValue={event.targetDepartmentId ?? ""}
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
                defaultValue={event.targetLocationId ?? ""}
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
              Save changes
            </Button>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
