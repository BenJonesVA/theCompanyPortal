import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";
import { createDelegate, endDelegate } from "./actions";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

export default async function ApprovalDelegatesPage() {
  const user = await requireAuth();

  const [users, templates, delegates, coveringFor] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true, id: { not: user.id } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.approvalWorkflowTemplate.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.approvalDelegate.findMany({
      where: { delegatorId: user.id },
      orderBy: { startsAt: "desc" },
      include: { delegate: { select: { name: true } } },
    }),
    // The reverse direction: delegations where the current user is the one
    // covering for someone else. Nothing else in the app surfaces this from
    // the delegate's own point of view — the hub's pending list shows
    // individual delegated items, but not "who am I covering for" as a
    // standing fact independent of whether they currently have anything
    // pending.
    prisma.approvalDelegate.findMany({
      where: { delegateId: user.id, isActive: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      include: { delegator: { select: { name: true } } },
    }),
  ]);

  // workflowTemplateId has no relation field in the schema (a plain nullable
  // column, same shape as StageApprover.delegatedToId) — look up names
  // separately rather than via `include`.
  const templateNameById = new Map(templates.map((t) => [t.id, t.name]));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-fg">Approval delegates</h1>
        <p className="mt-[3px] text-[13.5px] text-fg-muted">
          While you're out, a delegate can decide approvals routed to you — for a specific workflow, or for everything.
        </p>
      </div>

      {coveringFor.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-[13.5px] font-semibold text-fg">You're currently covering for</h2>
          </CardHeader>
          <ul className="divide-y divide-grid">
            {coveringFor.map((d) => (
              <li key={d.id} className="px-5 py-3.5">
                <div className="text-[13.5px] font-semibold text-fg">{d.delegator.name}</div>
                <div className="mt-0.5 text-[12px] text-fg-subtle">
                  {d.workflowTemplateId ? (templateNameById.get(d.workflowTemplateId) ?? "Unknown workflow") : "All workflows"} ·{" "}
                  until {d.endsAt.toLocaleDateString()}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-6">
        <ActionForm action={createDelegate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg-muted">Delegate to</label>
            <select name="delegateId" required defaultValue="" className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg">
              <option value="" disabled>
                Choose a person…
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Workflow (optional)</label>
            <select name="workflowTemplateId" defaultValue="" className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg">
              <option value="">All workflows</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg-muted">Starts</label>
              <input type="datetime-local" name="startsAt" required className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-muted">Ends</label>
              <input type="datetime-local" name="endsAt" required className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg" />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary">
              Add delegate
            </Button>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">Your delegates</h2>
        </CardHeader>
        {delegates.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13.5px] text-fg-muted">No delegates configured.</p>
        ) : (
          <ul className="divide-y divide-grid">
            {delegates.map((d) => {
              const isCurrentlyActive = d.isActive && d.startsAt <= new Date() && d.endsAt >= new Date();
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold text-fg">
                      {d.delegate.name}
                      {isCurrentlyActive && <span className="ml-2 text-[11px] font-normal text-green">Active now</span>}
                    </div>
                    <div className="mt-0.5 text-[12px] text-fg-subtle">
                      {d.workflowTemplateId ? (templateNameById.get(d.workflowTemplateId) ?? "Unknown workflow") : "All workflows"} ·{" "}
                      {d.startsAt.toLocaleDateString()} – {d.endsAt.toLocaleDateString()}
                      {!d.isActive && " · Ended"}
                    </div>
                  </div>
                  {d.isActive && (
                    <form action={endDelegate.bind(null, d.id)}>
                      <Button type="submit" variant="secondary" size="sm">
                        End now
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
