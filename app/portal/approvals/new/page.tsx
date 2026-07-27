import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";
import { REQUEST_TYPE_LABELS } from "@/lib/approvals";
import { submitRequest } from "../actions";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function NewApprovalRequestPage() {
  await requireAuth();

  const templates = await prisma.approvalWorkflowTemplate.findMany({
    where: { isActive: true, stages: { some: {} } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[24px] font-bold tracking-tight text-fg">New approval request</h1>

      <Card className="mt-6 p-6">
        {templates.length === 0 ? (
          <p className="text-[13.5px] text-fg-muted">
            No approval workflows are available yet — check back once one has been configured.
          </p>
        ) : (
          <ActionForm action={submitRequest} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-fg-muted">Workflow</label>
              <select
                name="workflowTemplateId"
                required
                defaultValue=""
                className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
              >
                <option value="" disabled>
                  Choose a workflow…
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({REQUEST_TYPE_LABELS[t.requestType]}
                    {t.amountThreshold ? `, threshold $${t.amountThreshold.toString()}` : ""})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-muted">Title</label>
              <input
                type="text"
                name="title"
                required
                placeholder="e.g. New laptop for onboarding hire"
                className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-muted">Description</label>
              <textarea
                name="description"
                rows={4}
                className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-muted">Amount (optional)</label>
              <input
                type="number"
                name="amount"
                step="0.01"
                min="0"
                className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
              />
            </div>

            <div className="flex justify-end gap-3">
              <a href="/portal/approvals">
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </a>
              <Button type="submit" variant="primary">
                Submit request
              </Button>
            </div>
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
