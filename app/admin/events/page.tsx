import Link from "next/link";
import { Permission, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { CALENDAR_CATEGORY_LABELS } from "@/lib/calendar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function targetSummary(event: {
  targetDepartment: { name: string } | null;
  targetLocation: { name: string } | null;
}): string {
  const parts: string[] = [];
  if (event.targetDepartment) parts.push(event.targetDepartment.name);
  if (event.targetLocation) parts.push(event.targetLocation.name);
  return parts.length > 0 ? parts.join(" · ") : "Everyone";
}

function formatRange(startsAt: Date, endsAt: Date): string {
  const start = startsAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const sameDay = startsAt.toDateString() === endsAt.toDateString();
  const end = endsAt.toLocaleString(
    "en-US",
    sameDay ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
  );
  return `${start} – ${end}`;
}

export default async function EventsAdminPage() {
  await requirePermission(Permission.MANAGE_EVENTS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const events = await prisma.calendarEvent.findMany({
    orderBy: { startsAt: "desc" },
    include: {
      targetDepartment: { select: { name: true } },
      targetLocation: { select: { name: true } },
      _count: { select: { rsvps: true } },
    },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-fg">Calendar Events</h1>
          <p className="mt-[3px] text-[13.5px] text-fg-muted">
            Holidays, department/office events, and maintenance windows, targeted by department or location.
          </p>
        </div>
        <Link href="/admin/events/new">
          <Button variant="primary">
            <span className="text-[15px] leading-none">+</span>New event
          </Button>
        </Link>
      </div>

      <Card>
        {events.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13.5px] text-fg-muted">No calendar events yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <th className="px-4 py-2.5">Title</th>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Audience</th>
                <th className="px-4 py-2.5">RSVPs</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-grid last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/admin/events/${event.id}/edit`} className="font-medium text-fg hover:text-accent">
                      {event.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{formatRange(event.startsAt, event.endsAt)}</td>
                  <td className="px-4 py-3 text-fg-muted">{CALENDAR_CATEGORY_LABELS[event.category]}</td>
                  <td className="px-4 py-3 text-fg-muted">{targetSummary(event)}</td>
                  <td className="px-4 py-3 text-fg-muted">{event._count.rsvps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
