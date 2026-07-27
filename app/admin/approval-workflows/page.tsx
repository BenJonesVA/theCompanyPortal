import Link from "next/link";
import { Permission, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { REQUEST_TYPE_LABELS } from "@/lib/approvals";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function ApprovalWorkflowsAdminPage() {
  await requirePermission(Permission.MANAGE_APPROVAL_WORKFLOWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const templates = await prisma.approvalWorkflowTemplate.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { stages: true, requests: true } } },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-fg">Approval Workflows</h1>
          <p className="mt-[3px] text-[13.5px] text-fg-muted">
            Reusable multi-stage approval chains — purchase quotes, expense authorizations, access requests, and more.
          </p>
        </div>
        <Link href="/admin/approval-workflows/new">
          <Button variant="primary">
            <span className="text-[15px] leading-none">+</span>New workflow
          </Button>
        </Link>
      </div>

      <Card>
        {templates.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13.5px] text-fg-muted">No approval workflows yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Request type</th>
                <th className="px-4 py-2.5">Stages</th>
                <th className="px-4 py-2.5">Requests</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-grid last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/admin/approval-workflows/${t.id}/edit`} className="font-medium text-fg hover:text-accent">
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{REQUEST_TYPE_LABELS[t.requestType]}</td>
                  <td className="px-4 py-3 text-fg-muted">{t._count.stages}</td>
                  <td className="px-4 py-3 text-fg-muted">{t._count.requests}</td>
                  <td className="px-4 py-3 text-fg-muted">{t.isActive ? "Active" : "Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
