import { RsvpStatus } from "@prisma/client";
import { requireAuth } from "@/lib/rbac";
import { listVisibleCalendarEvents, CALENDAR_CATEGORY_LABELS } from "@/lib/calendar";
import { rsvpToEvent } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

function formatRange(startsAt: Date, endsAt: Date): string {
  const start = startsAt.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const sameDay = startsAt.toDateString() === endsAt.toDateString();
  const end = endsAt.toLocaleString(
    "en-US",
    sameDay ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
  );
  return `${start} – ${end}`;
}

const RSVP_OPTIONS: { status: RsvpStatus; label: string }[] = [
  { status: "GOING", label: "Going" },
  { status: "MAYBE", label: "Maybe" },
  { status: "NOT_GOING", label: "Not going" },
];

export default async function PortalEventsPage() {
  const user = await requireAuth();
  const events = await listVisibleCalendarEvents(user);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-fg">Upcoming events</h1>
        <p className="mt-[3px] text-[13.5px] text-fg-muted">
          Holidays, office events, and maintenance windows for your department and location.
        </p>
      </div>

      <Card>
        {events.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13.5px] text-fg-muted">Nothing scheduled yet.</p>
        ) : (
          <ul className="divide-y divide-grid">
            {events.map((event) => {
              const myStatus = event.rsvps.find((r) => r.userId === user.id)?.status ?? null;
              const goingCount = event.rsvps.filter((r) => r.status === "GOING").length;

              return (
                <li key={event.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold text-fg">{event.title}</div>
                      <div className="mt-0.5 text-[12px] text-fg-subtle">
                        {formatRange(event.startsAt, event.endsAt)} · {CALENDAR_CATEGORY_LABELS[event.category]}
                      </div>
                    </div>
                    {goingCount > 0 && (
                      <span className="flex-none whitespace-nowrap text-[11.5px] text-fg-subtle">
                        {goingCount} going
                      </span>
                    )}
                  </div>
                  {event.description && (
                    <p className="mt-2 text-[13px] text-fg-muted">{event.description}</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    {RSVP_OPTIONS.map((option) => (
                      <form key={option.status} action={rsvpToEvent.bind(null, event.id, option.status)}>
                        <Button
                          type="submit"
                          variant={myStatus === option.status ? "primary" : "secondary"}
                          size="sm"
                        >
                          {option.label}
                        </Button>
                      </form>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
