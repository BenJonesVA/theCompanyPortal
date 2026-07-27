import { notFound } from "next/navigation";
import Link from "next/link";
import { Permission, Role, ApprovalRequestType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { REQUEST_TYPE_LABELS, STAGE_MODE_LABELS, APPROVER_SOURCE_LABELS, hasInFlightRequests } from "@/lib/approvals";
import { ROLE_LABELS } from "@/lib/permissions";
import { updateWorkflowTemplate, deleteWorkflowTemplate, deleteStageTemplate } from "../../actions";
import { ActionForm } from "@/components/ui/action-form";
import { DeleteButton } from "@/components/ui/delete-button";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

function approverSummary(stage: {
  approverSourceType: string;
  approverUser: { name: string } | null;
  approverPermissionGroup: { name: string } | null;
  approverRole: Role | null;
  managerLevelsUp: number | null;
}): string {
  switch (stage.approverSourceType) {
    case "SPECIFIC_USER":
      return stage.approverUser?.name ?? "(person no longer exists)";
    case "PERMISSION_GROUP":
      return stage.approverPermissionGroup?.name ?? "(group no longer exists)";
    case "ROLE":
      return stage.approverRole ? ROLE_LABELS[stage.approverRole] : "—";
    case "REQUESTER_MANAGER": {
      const levels = stage.managerLevelsUp ?? 1;
      return levels === 1 ? "Direct manager" : `Manager, ${levels} levels up`;
    }
    default:
      return APPROVER_SOURCE_LABELS[stage.approverSourceType as keyof typeof APPROVER_SOURCE_LABELS];
  }
}

export default async function EditApprovalWorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(Permission.MANAGE_APPROVAL_WORKFLOWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);
  const { id } = await params;

  const [template, locked] = await Promise.all([
    prisma.approvalWorkflowTemplate.findUnique({
      where: { id },
      include: {
        stages: {
          orderBy: { order: "asc" },
          include: { approverUser: { select: { name: true } }, approverPermissionGroup: { select: { name: true } } },
        },
      },
    }),
    hasInFlightRequests(id),
  ]);

  if (!template) notFound();

  const submit = updateWorkflowTemplate.bind(null, template.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-bold tracking-tight text-fg">Edit approval workflow</h1>
        <DeleteButton action={deleteWorkflowTemplate.bind(null, template.id)} label="Delete workflow" />
      </div>

      {locked && (
        <p className="rounded-md bg-amber-bg px-3 py-2 text-[13px] text-amber">
          This workflow has requests in progress — its stages are locked until they resolve.
        </p>
      )}

      <Card className="p-6">
        <ActionForm action={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg-muted">Name</label>
            <input
              type="text"
              name="name"
              required
              defaultValue={template.name}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Request type</label>
            <select
              name="requestType"
              defaultValue={template.requestType}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            >
              {Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Description</label>
            <textarea
              name="description"
              rows={3}
              defaultValue={template.description ?? ""}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Amount threshold (optional)</label>
            <input
              type="number"
              name="amountThreshold"
              step="0.01"
              min="0"
              defaultValue={template.amountThreshold?.toString() ?? ""}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input type="checkbox" name="isActive" defaultChecked={template.isActive} className="accent-accent" />
            Active (selectable when submitting a new request)
          </label>

          <div className="flex justify-end">
            <Button type="submit" variant="primary">
              Save changes
            </Button>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-[13.5px] font-semibold text-fg">Stages ({template.stages.length})</h2>
          {!locked && (
            <Link href={`/admin/approval-workflows/${template.id}/stages/new`}>
              <Button variant="secondary" size="sm">
                + Add stage
              </Button>
            </Link>
          )}
        </CardHeader>
        {template.stages.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13.5px] text-fg-muted">
            No stages yet — a request can't be submitted against this workflow until it has at least one.
          </p>
        ) : (
          <ul className="divide-y divide-grid">
            {template.stages.map((stage) => (
              <li key={stage.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-fg">
                    {stage.order}. {stage.name}
                  </div>
                  <div className="mt-0.5 text-[12px] text-fg-subtle">
                    {STAGE_MODE_LABELS[stage.mode]}
                    {stage.mode === "N_OF_M" && ` (${stage.requiredApprovals} required)`} · {approverSummary(stage)}
                  </div>
                </div>
                {!locked && (
                  <div className="flex flex-none items-center gap-2">
                    <Link href={`/admin/approval-workflows/${template.id}/stages/${stage.id}/edit`}>
                      <Button variant="secondary" size="sm">
                        Edit
                      </Button>
                    </Link>
                    <form action={deleteStageTemplate.bind(null, template.id, stage.id)}>
                      <Button type="submit" variant="danger" size="sm">
                        Delete
                      </Button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
