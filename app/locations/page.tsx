import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TicketStatus, Role } from "@prisma/client";
import { requireAuth } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const ACTIVE_TICKET_STATUSES = [
  TicketStatus.OPEN,
  TicketStatus.IN_PROGRESS,
  TicketStatus.WAITING_ON_REQUESTER,
];

export default async function LocationsPage() {
  const user = await requireAuth();
  const canManage = user.role === Role.SUPER_ADMIN || user.role === Role.DEPARTMENT_MANAGER;

  const locations = await prisma.location.findMany({
    orderBy: { name: "asc" },
    include: {
      parent: { select: { name: true } },
      _count: {
        select: {
          employees: true,
          tickets: { where: { status: { in: ACTIVE_TICKET_STATUSES } } },
        },
      },
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-bold tracking-tight text-fg">Locations</h1>
        {canManage && (
          <Link href="/locations/new">
            <Button variant="primary">
              <span className="text-[15px] leading-none">+</span>New location
            </Button>
          </Link>
        )}
      </div>

      <Card className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Parent</th>
              <th className="px-4 py-2.5">Employees</th>
              <th className="px-4 py-2.5">Active tickets</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((location) => (
              <tr key={location.id} className="border-b border-grid last:border-0 hover:bg-surface-2">
                <td className="px-4 py-row-py">
                  <Link href={`/locations/${location.id}`} className="font-medium text-fg hover:text-accent">
                    {location.name}
                  </Link>
                </td>
                <td className="px-4 py-row-py text-fg-muted">{location.type.replace(/_/g, " ")}</td>
                <td className="px-4 py-row-py text-fg-muted">{location.parent?.name ?? "—"}</td>
                <td className="px-4 py-row-py text-fg-muted">{location._count.employees}</td>
                <td className="px-4 py-row-py text-fg-muted">{location._count.tickets}</td>
                <td className="px-4 py-row-py">
                  <span
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      location.isActive ? "text-green bg-green-bg" : "text-slate bg-slate-bg"
                    }`}
                  >
                    <span className={`h-[7px] w-[7px] rounded-full ${location.isActive ? "bg-green" : "bg-slate"}`} />
                    {location.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
            {locations.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-fg-subtle">
                  No locations yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
