import Link from "next/link";
import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { resolveLocationPage, type ResolvedLocationPage } from "@/lib/locations";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

const OPEN_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_REQUESTER"] as const;
const OPEN_TICKETS_PREVIEW = 4;

const EMPTY_PAGE: ResolvedLocationPage = { bannerImageUrl: null, bannerText: null, floorPlanUrl: null, widgetConfig: {} };

function QuickLink({ href, label, primary = false }: { href: string; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-center rounded-xl border px-4 py-4 text-center text-[13.5px] font-semibold transition-colors ${
        primary
          ? "border-transparent bg-accent text-accent-fg hover:bg-accent-hover"
          : "border-border bg-surface text-fg hover:bg-surface-2"
      }`}
    >
      {label}
    </Link>
  );
}

export default async function PortalPage() {
  const user = await requireAuth();

  const [location, openTickets, resolvedPage] = await Promise.all([
    user.locationId ? prisma.location.findUnique({ where: { id: user.locationId } }) : null,
    prisma.ticket.findMany({
      where: { requesterId: user.id, status: { in: [...OPEN_STATUSES] } },
      orderBy: { createdAt: "desc" },
      include: { board: true },
    }),
    user.locationId ? resolveLocationPage(user.locationId) : Promise.resolve(EMPTY_PAGE),
  ]);

  const previewTickets = openTickets.slice(0, OPEN_TICKETS_PREVIEW);

  return (
    <div className="flex flex-col gap-6">
      {/* Location banner — resolves up the parent chain when this location has
          no page config of its own (see lib/locations.ts). */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-2">
        {resolvedPage.bannerImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolvedPage.bannerImageUrl}
            alt=""
            className="h-36 w-full object-cover sm:h-44"
          />
        ) : (
          <div className="h-28 w-full bg-gradient-to-br from-accent/20 to-violet/10 sm:h-32" />
        )}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/55 via-black/5 to-transparent p-5 sm:p-6">
          <h1 className="text-[24px] font-bold tracking-tight text-white drop-shadow sm:text-[28px]">
            Welcome, {user.name}
          </h1>
          <p className="mt-1 text-[14px] text-white/90 drop-shadow">
            {resolvedPage.bannerText ?? location?.name ?? "Company Portal"}
          </p>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickLink href="/portal/tickets/new" label="Submit a ticket" primary />
        <QuickLink href="/portal/tickets" label="My tickets" />
        <QuickLink href="/portal/kb" label="Knowledge base" />
        {resolvedPage.floorPlanUrl && <QuickLink href={resolvedPage.floorPlanUrl} label="Floor plan" />}
      </div>

      {/* Company News / Upcoming Events — placeholders until Phase 5/6 (News)
          and Phase 7/8 (Calendar) land; both will key off the same
          Location/Department/Role targeting and reuse lib/locations.ts's
          resolver shape. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-[13.5px] font-semibold text-fg">Company news</h2>
          </CardHeader>
          <p className="px-5 py-8 text-center text-[13.5px] text-fg-muted">
            No news posted yet. Check back soon.
          </p>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="text-[13.5px] font-semibold text-fg">Upcoming events</h2>
          </CardHeader>
          <p className="px-5 py-8 text-center text-[13.5px] text-fg-muted">
            Nothing scheduled yet.
          </p>
        </Card>
      </div>

      {/* Open tickets — demoted below portal-identity content; this used to
          be the dominant element on this page. */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-[13.5px] font-semibold text-fg">Open tickets ({openTickets.length})</h2>
          <Link href="/portal/tickets">
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </Link>
        </CardHeader>
        {previewTickets.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13.5px] text-fg-muted">No open tickets.</p>
        ) : (
          <ul className="divide-y divide-grid">
            {previewTickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/portal/tickets/${t.id}`}
                  className="flex flex-col gap-2 px-5 py-3.5 hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-fg">
                      TKT-{t.id} — {t.title}
                    </div>
                    <div className="mt-0.5 text-[12px] text-fg-subtle">{t.board.name}</div>
                  </div>
                  <StatusBadge status={t.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
