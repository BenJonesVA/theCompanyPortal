import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { REQUEST_TYPE_LABELS, STAGE_MODE_LABELS } from "@/lib/approvals";
import { decideViaToken } from "./actions";
import { ApprovalDecisionForm } from "@/components/ui/approval-decision-form";
import { Card } from "@/components/ui/card";

export default async function MagicLinkApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const approver = await prisma.stageApprover.findUnique({
    where: { magicLinkToken: token },
    include: {
      stageInstance: {
        include: { approvalRequest: { include: { requester: { select: { name: true } } } } },
      },
    },
  });
  if (!approver) notFound();

  const request = approver.stageInstance.approvalRequest;
  const stage = approver.stageInstance;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 py-12">
      <Card className="w-full max-w-md rounded-2xl p-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">{request.title}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {REQUEST_TYPE_LABELS[request.requestType]} · From {request.requester.name}
            {request.amount ? ` · $${request.amount.toString()}` : ""}
          </p>
          <p className="mt-1 text-sm text-fg-subtle">
            Stage: {stage.name} ({STAGE_MODE_LABELS[stage.mode]})
          </p>
        </div>

        {request.description && <p className="mt-4 whitespace-pre-wrap text-sm text-fg">{request.description}</p>}

        <div className="mt-6">
          {approver.decision ? (
            <p className="text-sm text-fg-muted">
              You already {approver.decision === "APPROVED" ? "approved" : "rejected"} this
              {approver.decidedAt ? ` on ${approver.decidedAt.toLocaleString()}` : ""}.
            </p>
          ) : stage.status !== "IN_PROGRESS" ? (
            <p className="text-sm text-fg-muted">This stage is no longer active — no decision is needed from you.</p>
          ) : (
            <ApprovalDecisionForm
              approveAction={decideViaToken.bind(null, token, "APPROVED")}
              rejectAction={decideViaToken.bind(null, token, "REJECTED")}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
