import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";
import { getMyPendingApprovals, REQUEST_TYPE_LABELS } from "@/lib/approvals";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "APPROVED"
      ? "bg-green-bg text-green"
      : status === "REJECTED"
        ? "bg-red-bg text-red"
        : status === "CANCELLED"
          ? "bg-slate-bg text-slate"
          : "bg-amber-bg text-amber";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default async function PortalApprovalsPage() {
  const user = await requireAuth();

  const [pending, myRequests] = await Promise.all([
    getMyPendingApprovals(user.id),
    prisma.approvalRequest.findMany({
      where: { requesterId: user.id },
      orderBy: { createdAt: "desc" },
      include: { workflowTemplate: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-fg">Approvals</h1>
          <p className="mt-[3px] text-[13.5px] text-fg-muted">Requests awaiting your decision, and requests you've submitted.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/portal/approvals/delegates">
            <Button variant="secondary">Delegates</Button>
          </Link>
          <Link href="/portal/approvals/new">
            <Button variant="primary">
              <span className="text-[15px] leading-none">+</span>New request
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">Awaiting your decision ({pending.length})</h2>
        </CardHeader>
        {pending.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13.5px] text-fg-muted">Nothing pending.</p>
        ) : (
          <ul className="divide-y divide-grid">
            {pending.map((approver) => (
              <li key={approver.id}>
                <Link
                  href={`/portal/approvals/${approver.stageInstance.approvalRequestId}`}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-fg">{approver.stageInstance.approvalRequest.title}</div>
                    <div className="mt-0.5 text-[12px] text-fg-subtle">
                      From {approver.stageInstance.approvalRequest.requester.name} · Stage: {approver.stageInstance.name}
                      {approver.delegatedToId === user.id && approver.userId !== user.id && " (delegated to you)"}
                    </div>
                  </div>
                  <Button variant="secondary" size="sm">
                    Review
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">Your requests ({myRequests.length})</h2>
        </CardHeader>
        {myRequests.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13.5px] text-fg-muted">You haven't submitted any requests yet.</p>
        ) : (
          <ul className="divide-y divide-grid">
            {myRequests.map((request) => (
              <li key={request.id}>
                <Link href={`/portal/approvals/${request.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-fg">{request.title}</div>
                    <div className="mt-0.5 text-[12px] text-fg-subtle">
                      {request.workflowTemplate.name} · {REQUEST_TYPE_LABELS[request.requestType]}
                    </div>
                  </div>
                  <StatusPill status={request.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
