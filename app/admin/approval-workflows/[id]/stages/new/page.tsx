import { notFound } from "next/navigation";
import { Permission, Role, ApprovalStageMode, ApproverSourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { hasInFlightRequests } from "@/lib/approvals";
import { createStageTemplate } from "../../../actions";
import { ActionForm } from "@/components/ui/action-form";
import { ApprovalStageFields } from "@/components/ui/approval-stage-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function NewStageTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(Permission.MANAGE_APPROVAL_WORKFLOWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);
  const { id } = await params;

  const [template, locked, users, permissionGroups] = await Promise.all([
    prisma.approvalWorkflowTemplate.findUnique({ where: { id }, select: { id: true, name: true } }),
    hasInFlightRequests(id),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.permissionGroup.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!template) notFound();
  if (locked) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="rounded-md bg-amber-bg px-3 py-2 text-[13px] text-amber">
          This workflow has requests in progress — its stages are locked until they resolve.
        </p>
      </div>
    );
  }

  const submit = createStageTemplate.bind(null, template.id);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[24px] font-bold tracking-tight text-fg">Add stage to "{template.name}"</h1>

      <Card className="mt-6 p-6">
        <ActionForm action={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg-muted">Stage name</label>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Direct Manager"
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <ApprovalStageFields
            users={users}
            permissionGroups={permissionGroups}
            initial={{
              mode: ApprovalStageMode.ALL,
              requiredApprovals: 1,
              approverSourceType: ApproverSourceType.REQUESTER_MANAGER,
              approverUserId: null,
              approverPermissionGroupId: null,
              approverRole: null,
              managerLevelsUp: 1,
            }}
          />

          <div className="flex justify-end gap-3">
            <a href={`/admin/approval-workflows/${template.id}/edit`}>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </a>
            <Button type="submit" variant="primary">
              Add stage
            </Button>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
