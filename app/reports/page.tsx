import { Role, Permission, type TicketPriority } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { getSlaStatus, loadSlaPolicyResolver } from "@/lib/sla";
import { formatDuration } from "@/lib/format";
import { CALENDAR_CATEGORY_LABELS } from "@/lib/calendar";
import { ROLE_LABELS } from "@/lib/permissions";
import { Card, CardHeader } from "@/components/ui/card";
import { Bar } from "@/components/ui/bar-chart";
import { ColumnChart } from "@/components/ui/column-chart";
import { Button } from "@/components/ui/button";

const DAY_MS = 86_400_000;
const PERIOD_DAYS = 30;
const TREND_WEEKS = 8;

// Most-severe-first — the order a manager scanning for problems cares about.
const PRIORITY_ORDER: TicketPriority[] = ["EMERGENCY", "HIGH", "MEDIUM", "LOW"];
const PRIORITY_LABELS: Record<TicketPriority, string> = {
  EMERGENCY: "Emergency",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export default async function ReportsPage() {
  await requirePermission(Permission.VIEW_REPORTS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const now = new Date();
  const periodStart = new Date(now.getTime() - PERIOD_DAYS * DAY_MS);
  const trendStart = new Date(now.getTime() - TREND_WEEKS * 7 * DAY_MS);

  const [
    createdInPeriod,
    resolvedInPeriodForAvg,
    ticketsCreatedInPeriod,
    timeLogsInPeriod,
    createdForTrend,
    resolvedForTrend,
    csatSurveysInPeriod,
    approvalRequestsInPeriod,
    escalationsInPeriod,
    eventsInPeriod,
    newsPostsInPeriod,
  ] = await Promise.all([
    prisma.ticket.count({ where: { createdAt: { gte: periodStart } } }),
    prisma.ticket.findMany({
      where: { resolvedAt: { gte: periodStart } },
      select: {
        createdAt: true,
        resolvedAt: true,
        assigneeId: true,
        assignee: { select: { name: true } },
      },
    }),
    prisma.ticket.findMany({
      where: { createdAt: { gte: periodStart } },
      select: {
        locationId: true,
        status: true,
        priority: true,
        createdAt: true,
        resolvedAt: true,
        waitingSince: true,
        totalWaitMinutes: true,
        categoryId: true,
        category: { select: { name: true } },
        comments: { select: { createdAt: true, authorId: true, isInternal: true } },
      },
    }),
    prisma.timeLog.findMany({
      where: { startTime: { gte: periodStart } },
      select: { userId: true, durationMinutes: true, user: { select: { name: true } } },
    }),
    prisma.ticket.findMany({ where: { createdAt: { gte: trendStart } }, select: { createdAt: true } }),
    prisma.ticket.findMany({ where: { resolvedAt: { gte: trendStart } }, select: { resolvedAt: true } }),
    prisma.csatResponse.findMany({
      where: { createdAt: { gte: periodStart } },
      select: { rating: true, respondedAt: true },
    }),
    prisma.approvalRequest.findMany({
      where: { createdAt: { gte: periodStart } },
      select: { status: true, createdAt: true, decidedAt: true, workflowTemplate: { select: { name: true } } },
    }),
    prisma.approvalAuditLog.count({ where: { action: "ESCALATED", createdAt: { gte: periodStart } } }),
    prisma.calendarEvent.findMany({
      where: { startsAt: { gte: periodStart } },
      select: { id: true, title: true, startsAt: true, category: true, rsvps: { select: { status: true } } },
    }),
    prisma.newsPost.findMany({
      where: { status: "PUBLISHED", publishedAt: { gte: periodStart } },
      select: {
        id: true,
        title: true,
        publishedAt: true,
        targetRole: true,
        targetDepartment: { select: { name: true } },
        targetLocation: { select: { name: true } },
      },
    }),
  ]);

  // ── Customer satisfaction (surveys sent in the window) ──
  const csatResponded = csatSurveysInPeriod.filter((c) => c.respondedAt !== null);
  const avgCsatRating =
    csatResponded.length > 0
      ? csatResponded.reduce((sum, c) => sum + (c.rating ?? 0), 0) / csatResponded.length
      : null;
  const csatResponseRate =
    csatSurveysInPeriod.length > 0 ? (csatResponded.length / csatSurveysInPeriod.length) * 100 : null;

  // ── Avg resolution time (tickets resolved in the window, regardless of when created) ──
  // Clamped per-ticket at 0: a ticket can't take negative time to resolve, but
  // seed/clock artifacts (resolvedAt a beat before createdAt) can produce one.
  const avgResolutionMs =
    resolvedInPeriodForAvg.length > 0
      ? resolvedInPeriodForAvg.reduce(
          (sum, t) => sum + Math.max(0, t.resolvedAt!.getTime() - t.createdAt.getTime()),
          0
        ) / resolvedInPeriodForAvg.length
      : null;

  // ── SLA compliance (tickets created in the window) ──
  const resolveSla = await loadSlaPolicyResolver(ticketsCreatedInPeriod.map((t) => t.locationId));
  const priorityStats = PRIORITY_ORDER.map((priority) => {
    const tickets = ticketsCreatedInPeriod.filter((t) => t.priority === priority);
    const onTime = tickets.filter((t) => {
      const policy = resolveSla(t.locationId, priority);
      if (!policy) return false;
      const status = getSlaStatus(t, policy, now);
      return !status.responseBreached && !status.resolutionBreached;
    }).length;
    return {
      priority,
      total: tickets.length,
      onTime,
      rate: tickets.length > 0 ? (onTime / tickets.length) * 100 : null,
    };
  });
  const overallCompliant = priorityStats.reduce((sum, p) => sum + p.onTime, 0);
  const overallRate =
    ticketsCreatedInPeriod.length > 0 ? (overallCompliant / ticketsCreatedInPeriod.length) * 100 : null;

  // ── Effort logged per user ──
  const utilByUser = new Map<string, { name: string; minutes: number }>();
  for (const log of timeLogsInPeriod) {
    const entry = utilByUser.get(log.userId) ?? { name: log.user.name, minutes: 0 };
    entry.minutes += log.durationMinutes;
    utilByUser.set(log.userId, entry);
  }
  const utilization = Array.from(utilByUser.values()).sort((a, b) => b.minutes - a.minutes);
  const maxUtilMinutes = Math.max(1, ...utilization.map((u) => u.minutes));

  // ── Per-agent leaderboard (tickets resolved/closed + minutes logged in the window) ──
  const resolvedCountByUser = new Map<string, { name: string; count: number }>();
  for (const t of resolvedInPeriodForAvg) {
    if (!t.assigneeId) continue;
    const entry = resolvedCountByUser.get(t.assigneeId) ?? { name: t.assignee?.name ?? "Unknown", count: 0 };
    entry.count += 1;
    resolvedCountByUser.set(t.assigneeId, entry);
  }
  const leaderboardUserIds = new Set([...resolvedCountByUser.keys(), ...utilByUser.keys()]);
  const leaderboard = Array.from(leaderboardUserIds)
    .map((userId) => {
      const resolved = resolvedCountByUser.get(userId);
      const util = utilByUser.get(userId);
      return {
        userId,
        name: resolved?.name ?? util?.name ?? "Unknown",
        resolvedCount: resolved?.count ?? 0,
        minutes: util?.minutes ?? 0,
      };
    })
    .sort((a, b) => b.resolvedCount - a.resolvedCount || b.minutes - a.minutes);

  // ── Ticket volume by category (tickets created in the window) ──
  const categoryCounts = new Map<string, { name: string; count: number }>();
  for (const t of ticketsCreatedInPeriod) {
    const key = t.categoryId ?? "uncategorized";
    const name = t.category?.name ?? "Uncategorized";
    const entry = categoryCounts.get(key) ?? { name, count: 0 };
    entry.count += 1;
    categoryCounts.set(key, entry);
  }
  const categoryBreakdown = Array.from(categoryCounts.entries())
    .map(([categoryId, v]) => ({ categoryId, ...v }))
    .sort((a, b) => b.count - a.count);

  // ── Weekly created-vs-resolved trend ──
  const weekBuckets = Array.from({ length: TREND_WEEKS }, (_, i) => {
    const end = new Date(now.getTime() - i * 7 * DAY_MS);
    const start = new Date(end.getTime() - 7 * DAY_MS);
    return { start, end };
  }).reverse();
  const bucketCounts = (dates: Date[]) =>
    weekBuckets.map(({ start, end }) => dates.filter((d) => d >= start && d < end).length);
  const createdCounts = bucketCounts(createdForTrend.map((t) => t.createdAt));
  const resolvedCounts = bucketCounts(
    resolvedForTrend.map((t) => t.resolvedAt).filter((d): d is Date => d !== null)
  );
  const trendData = weekBuckets.map(({ start }, i) => ({
    label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    series: [
      { value: createdCounts[i], color: "bg-blue" },
      { value: resolvedCounts[i], color: "bg-green" },
    ],
  }));

  const stats = [
    { label: "Tickets created", value: String(createdInPeriod) },
    { label: "Tickets resolved", value: String(resolvedInPeriodForAvg.length) },
    { label: "Avg. resolution time", value: avgResolutionMs !== null ? formatDuration(avgResolutionMs) : "—" },
    { label: "SLA compliance", value: overallRate !== null ? `${overallRate.toFixed(0)}%` : "—" },
  ];

  // ── Approval throughput (requests created in the window) ──
  const approvalCounts = { submitted: approvalRequestsInPeriod.length, approved: 0, rejected: 0, cancelled: 0, pending: 0 };
  for (const r of approvalRequestsInPeriod) {
    if (r.status === "APPROVED") approvalCounts.approved++;
    else if (r.status === "REJECTED") approvalCounts.rejected++;
    else if (r.status === "CANCELLED") approvalCounts.cancelled++;
    else approvalCounts.pending++;
  }
  const decidedApprovals = approvalRequestsInPeriod.filter((r) => r.decidedAt !== null);
  const avgDecisionMs =
    decidedApprovals.length > 0
      ? decidedApprovals.reduce((sum, r) => sum + Math.max(0, r.decidedAt!.getTime() - r.createdAt.getTime()), 0) /
        decidedApprovals.length
      : null;
  const approvalsByTemplate = new Map<string, number>();
  for (const r of approvalRequestsInPeriod) {
    approvalsByTemplate.set(r.workflowTemplate.name, (approvalsByTemplate.get(r.workflowTemplate.name) ?? 0) + 1);
  }
  const approvalTemplateBreakdown = Array.from(approvalsByTemplate.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // ── Event RSVP engagement (events starting in the window) ──
  const rsvpTotals = { going: 0, maybe: 0, notGoing: 0 };
  for (const e of eventsInPeriod) {
    for (const r of e.rsvps) {
      if (r.status === "GOING") rsvpTotals.going++;
      else if (r.status === "MAYBE") rsvpTotals.maybe++;
      else rsvpTotals.notGoing++;
    }
  }
  const eventBreakdown = eventsInPeriod
    .map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.startsAt,
      category: e.category,
      going: e.rsvps.filter((r) => r.status === "GOING").length,
      maybe: e.rsvps.filter((r) => r.status === "MAYBE").length,
      notGoing: e.rsvps.filter((r) => r.status === "NOT_GOING").length,
    }))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  // ── News reach (posts published in the window) — targeting summary only:
  // there's no per-user read-tracking model in the schema, so this reports
  // who a post was *aimed at*, not who actually opened it. Don't overclaim.
  const newsBreakdown = newsPostsInPeriod.map((p) => ({
    id: p.id,
    title: p.title,
    publishedAt: p.publishedAt!,
    targeting:
      [p.targetDepartment?.name, p.targetLocation?.name, p.targetRole ? ROLE_LABELS[p.targetRole] : null]
        .filter(Boolean)
        .join(", ") || "Everyone",
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-fg">Reports</h1>
          <p className="mt-[3px] text-[13.5px] text-fg-muted">Last {PERIOD_DAYS} days, unless noted.</p>
        </div>
        <a href="/reports/export">
          <Button variant="secondary">Export CSV</Button>
        </a>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="text-[11.5px] font-medium text-fg-muted">{stat.label}</div>
            <div className="mt-[10px] text-[28px] font-bold leading-none tracking-tight text-fg">
              {stat.value}
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13.5px] font-semibold text-fg">Ticket volume — last {TREND_WEEKS} weeks</h2>
          <div className="flex items-center gap-3 text-[11.5px] text-fg-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue" /> Created
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green" /> Resolved
            </span>
          </div>
        </div>
        <div className="mt-4">
          <ColumnChart data={trendData} />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">SLA compliance by priority</h2>
        </CardHeader>
        <div className="flex flex-col gap-4 p-5">
          {priorityStats.map((p) => (
            <Bar
              key={p.priority}
              label={PRIORITY_LABELS[p.priority]}
              max={100}
              segments={[
                {
                  value: p.rate ?? 0,
                  color: p.rate === null ? "bg-surface-3" : p.rate >= 90 ? "bg-green" : p.rate >= 75 ? "bg-amber" : "bg-red",
                },
              ]}
              displayValue={p.total > 0 ? `${p.onTime}/${p.total} on time (${p.rate!.toFixed(0)}%)` : "No tickets"}
            />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">Effort logged</h2>
        </CardHeader>
        {utilization.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-muted">No time logged in this window.</p>
        ) : (
          <div className="flex flex-col gap-4 p-5">
            {utilization.map((u) => (
              <Bar
                key={u.name}
                label={u.name}
                max={maxUtilMinutes}
                segments={[{ value: u.minutes, color: "bg-accent" }]}
                displayValue={`${(u.minutes / 60).toFixed(1)}h`}
              />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">Agent leaderboard</h2>
        </CardHeader>
        {leaderboard.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-muted">No resolved tickets or time logged in this window.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <th className="px-5 py-2.5">Agent</th>
                <th className="px-5 py-2.5">Resolved / closed</th>
                <th className="px-5 py-2.5">Hours logged</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((agent) => (
                <tr key={agent.userId} className="border-b border-grid last:border-0">
                  <td className="px-5 py-3 font-medium text-fg">{agent.name}</td>
                  <td className="px-5 py-3 font-mono text-fg-muted">{agent.resolvedCount}</td>
                  <td className="px-5 py-3 font-mono text-fg-muted">{(agent.minutes / 60).toFixed(1)}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">Ticket volume by category</h2>
        </CardHeader>
        {categoryBreakdown.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-muted">No tickets created in this window.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <th className="px-5 py-2.5">Category</th>
                <th className="px-5 py-2.5">Tickets created</th>
              </tr>
            </thead>
            <tbody>
              {categoryBreakdown.map((c) => (
                <tr key={c.categoryId} className="border-b border-grid last:border-0">
                  <td className="px-5 py-3 font-medium text-fg">{c.name}</td>
                  <td className="px-5 py-3 font-mono text-fg-muted">{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">Employee satisfaction</h2>
        </CardHeader>
        {csatSurveysInPeriod.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-muted">No CSAT surveys sent in this window.</p>
        ) : (
          <div className="grid grid-cols-3 gap-4 p-5">
            <div>
              <div className="text-[11.5px] font-medium text-fg-muted">Avg. rating</div>
              <div className="mt-1 text-[22px] font-bold text-fg">
                {avgCsatRating !== null ? `${avgCsatRating.toFixed(1)}/5` : "—"}
              </div>
            </div>
            <div>
              <div className="text-[11.5px] font-medium text-fg-muted">Response rate</div>
              <div className="mt-1 text-[22px] font-bold text-fg">
                {csatResponseRate !== null ? `${csatResponseRate.toFixed(0)}%` : "—"}
              </div>
            </div>
            <div>
              <div className="text-[11.5px] font-medium text-fg-muted">Surveys sent</div>
              <div className="mt-1 text-[22px] font-bold text-fg">{csatSurveysInPeriod.length}</div>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">Approval throughput</h2>
        </CardHeader>
        {approvalCounts.submitted === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-muted">No approval requests submitted in this window.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 p-5 sm:grid-cols-6">
              {[
                { label: "Submitted", value: approvalCounts.submitted },
                { label: "Approved", value: approvalCounts.approved },
                { label: "Rejected", value: approvalCounts.rejected },
                { label: "Cancelled", value: approvalCounts.cancelled },
                { label: "Still pending", value: approvalCounts.pending },
                { label: "Escalated", value: escalationsInPeriod },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-[11.5px] font-medium text-fg-muted">{s.label}</div>
                  <div className="mt-1 text-[20px] font-bold text-fg">{s.value}</div>
                </div>
              ))}
            </div>
            <div className="px-5 pb-2 text-[12.5px] text-fg-muted">
              Avg. time to decision: <span className="font-semibold text-fg">{avgDecisionMs !== null ? formatDuration(avgDecisionMs) : "—"}</span>
            </div>
            {approvalTemplateBreakdown.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                    <th className="px-5 py-2.5">Workflow</th>
                    <th className="px-5 py-2.5">Requests submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {approvalTemplateBreakdown.map((t) => (
                    <tr key={t.name} className="border-b border-grid last:border-0">
                      <td className="px-5 py-3 font-medium text-fg">{t.name}</td>
                      <td className="px-5 py-3 font-mono text-fg-muted">{t.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">Event RSVP engagement</h2>
        </CardHeader>
        {eventBreakdown.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-muted">No events starting in this window.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 p-5">
              <div>
                <div className="text-[11.5px] font-medium text-fg-muted">Going</div>
                <div className="mt-1 text-[20px] font-bold text-green">{rsvpTotals.going}</div>
              </div>
              <div>
                <div className="text-[11.5px] font-medium text-fg-muted">Maybe</div>
                <div className="mt-1 text-[20px] font-bold text-amber">{rsvpTotals.maybe}</div>
              </div>
              <div>
                <div className="text-[11.5px] font-medium text-fg-muted">Not going</div>
                <div className="mt-1 text-[20px] font-bold text-fg-muted">{rsvpTotals.notGoing}</div>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  <th className="px-5 py-2.5">Event</th>
                  <th className="px-5 py-2.5">Category</th>
                  <th className="px-5 py-2.5">Going</th>
                  <th className="px-5 py-2.5">Maybe</th>
                  <th className="px-5 py-2.5">Not going</th>
                </tr>
              </thead>
              <tbody>
                {eventBreakdown.map((e) => (
                  <tr key={e.id} className="border-b border-grid last:border-0">
                    <td className="px-5 py-3 font-medium text-fg">{e.title}</td>
                    <td className="px-5 py-3 text-fg-muted">{CALENDAR_CATEGORY_LABELS[e.category]}</td>
                    <td className="px-5 py-3 font-mono text-fg-muted">{e.going}</td>
                    <td className="px-5 py-3 font-mono text-fg-muted">{e.maybe}</td>
                    <td className="px-5 py-3 font-mono text-fg-muted">{e.notGoing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">News reach</h2>
          <p className="mt-0.5 text-[11.5px] text-fg-subtle">
            Who each post was targeted at — there's no read-tracking, so this isn't an open/view rate.
          </p>
        </CardHeader>
        {newsBreakdown.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-muted">No posts published in this window.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <th className="px-5 py-2.5">Post</th>
                <th className="px-5 py-2.5">Published</th>
                <th className="px-5 py-2.5">Targeted at</th>
              </tr>
            </thead>
            <tbody>
              {newsBreakdown.map((p) => (
                <tr key={p.id} className="border-b border-grid last:border-0">
                  <td className="px-5 py-3 font-medium text-fg">{p.title}</td>
                  <td className="px-5 py-3 text-fg-muted">{p.publishedAt.toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-fg-muted">{p.targeting}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
