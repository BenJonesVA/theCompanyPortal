import { notFound } from "next/navigation";
import { Permission, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";
import { REQUEST_TYPE_LABELS, STAGE_MODE_LABELS } from "@/lib/approvals";
import { decide, cancelRequest } from "../actions";
import { ApprovalDecisionForm } from "@/components/ui/approval-decision-form";
import { DeleteButton } from "@/components/ui/delete-button";
import { Card, CardHeader } from "@/components/ui/card";

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "APPROVED"
      ? "bg-green-bg text-green"
      : status === "REJECTED"
        ? "bg-red-bg text-red"
        : status === "CANCELLED" || status === "SKIPPED"
          ? "bg-slate-bg text-slate"
          : "bg-amber-bg text-amber";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function ApprovalRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const { id } = await params;

  const request = await prisma.approvalRequest.findUnique({
    where: { id },
    include: {
      requester: { select: { name: true } },
      workflowTemplate: { select: { name: true } },
      stageInstances: {
        orderBy: { order: "asc" },
        include: { approvers: { include: { user: { select: { name: true } } } } },
      },
      auditLogs: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
    },
  });
  if (!request) notFound();

  const isRequester = request.requesterId === user.id;
  const isApprover = request.stageInstances.some((si) => si.approvers.some((a) => a.userId === user.id || a.delegatedToId === user.id));
  const isOverseer =
    user.role === Role.SUPER_ADMIN || user.role === Role.DEPARTMENT_MANAGER || (user.permissions?.includes(Permission.MANAGE_APPROVAL_WORKFLOWS) ?? false);
  if (!isRequester && !isApprover && !isOverseer) notFound();

  // StageApprover.delegatedToId has no relation field in the schema (see
  // ARCHITECTURE.md — it's a plain column, not a foreign-key relation), so
  // delegate names need their own lookup rather than an `include`.
  const delegateIds = [...new Set(request.stageInstances.flatMap((si) => si.approvers.map((a) => a.delegatedToId).filter((x): x is string => !!x)))];
  const delegateNames = new Map(
    (await prisma.user.findMany({ where: { id: { in: delegateIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name])
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-fg">{request.title}</h1>
          <p className="mt-[3px] text-[13.5px] text-fg-muted">
            {request.workflowTemplate.name} · {REQUEST_TYPE_LABELS[request.requestType]} · From {request.requester.name}
            {request.amount ? ` · $${request.amount.toString()}` : ""}
          </p>
        </div>
        <div className="flex flex-none flex-col items-end gap-2">
          <StatusPill status={request.status} />
          {isRequester && request.status === "PENDING" && (
            <DeleteButton action={cancelRequest.bind(null, request.id)} label="Cancel request" />
          )}
        </div>
      </div>

      {request.description && (
        <Card className="p-4">
          <p className="whitespace-pre-wrap text-[13.5px] text-fg">{request.description}</p>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">Stages</h2>
        </CardHeader>
        <ul className="divide-y divide-grid">
          {request.stageInstances.map((stage) => {
            const myPendingApprover = stage.approvers.find(
              (a) => a.decision === null && (a.userId === user.id || a.delegatedToId === user.id)
            );
            const canDecide = stage.status === "IN_PROGRESS" && myPendingApprover !== undefined;

            return (
              <li key={stage.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[13.5px] font-semibold text-fg">
                    {stage.order}. {stage.name}
                  </div>
                  <StatusPill status={stage.status} />
                </div>
                <div className="mt-0.5 text-[12px] text-fg-subtle">{STAGE_MODE_LABELS[stage.mode]}</div>

                {stage.approvers.length > 0 && (
                  <ul className="mt-2.5 flex flex-col gap-1.5">
                    {stage.approvers.map((approver) => (
                      <li key={approver.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                        <span className="text-fg-muted">
                          {approver.user.name}
                          {approver.delegatedToId && ` (delegated to ${delegateNames.get(approver.delegatedToId) ?? "someone"})`}
                          {approver.comment && <span className="text-fg-subtle"> — "{approver.comment}"</span>}
                        </span>
                        <span className="flex-none">
                          {approver.decision ? (
                            <StatusPill status={approver.decision} />
                          ) : (
                            <span className="text-fg-subtle">Pending</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {canDecide && (
                  <div className="mt-3">
                    <ApprovalDecisionForm
                      approveAction={decide.bind(null, myPendingApprover.id, "APPROVED")}
                      rejectAction={decide.bind(null, myPendingApprover.id, "REJECTED")}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">Audit trail</h2>
        </CardHeader>
        <ul className="divide-y divide-grid">
          {request.auditLogs.map((log) => (
            <li key={log.id} className="px-5 py-2.5 text-[12.5px]">
              <span className="font-medium text-fg">{log.actor?.name ?? "System"}</span>{" "}
              <span className="text-fg-muted">{log.action.replace(/_/g, " ").toLowerCase()}</span>
              {log.comment && <span className="text-fg-subtle"> — "{log.comment}"</span>}
              <span className="ml-2 text-fg-subtle">{formatDateTime(log.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
