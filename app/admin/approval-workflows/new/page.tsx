import { Permission, Role, ApprovalRequestType } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { REQUEST_TYPE_LABELS } from "@/lib/approvals";
import { createWorkflowTemplate } from "../actions";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function NewApprovalWorkflowPage() {
  await requirePermission(Permission.MANAGE_APPROVAL_WORKFLOWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[24px] font-bold tracking-tight text-fg">New approval workflow</h1>
      <p className="mt-[3px] text-[13.5px] text-fg-muted">
        You'll add stages (Direct Manager → Department VP → ...) after creating this.
      </p>

      <Card className="mt-6 p-6">
        <ActionForm action={createWorkflowTemplate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg-muted">Name</label>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Purchase > $10,000"
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Request type</label>
            <select
              name="requestType"
              defaultValue={ApprovalRequestType.OTHER}
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
              placeholder="e.g. 10000"
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
            <p className="mt-1 text-[11.5px] text-fg-subtle">
              Informational only for now — requesters see it when choosing a workflow, but it isn't enforced automatically.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input type="checkbox" name="isActive" defaultChecked className="accent-accent" />
            Active (selectable when submitting a new request)
          </label>

          <div className="flex justify-end gap-3">
            <a href="/admin/approval-workflows">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </a>
            <Button type="submit" variant="primary">
              Create workflow
            </Button>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
