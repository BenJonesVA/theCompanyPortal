import { Permission, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { DeleteButton } from "@/components/ui/delete-button";
import { createDepartment, updateDepartment, deleteDepartment } from "./actions";

const inputClass =
  "rounded-lg border border-border-strong bg-surface px-3 py-[7px] text-[13.5px] text-fg focus:outline-none focus:ring-2 focus:ring-focus";

export default async function DepartmentsAdminPage() {
  await requirePermission(Permission.MANAGE_DEPARTMENTS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const [departments, users] = await Promise.all([
    prisma.department.findMany({
      orderBy: { name: "asc" },
      include: { manager: { select: { id: true, name: true } }, _count: { select: { employees: true, boards: true } } },
    }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-fg">Departments</h1>
        <p className="mt-[3px] text-[13.5px] text-fg-muted">
          Org units (Engineering, HR, Finance, ...) and their managers — distinct from the ticket
          Boards employees file into.
        </p>
      </div>

      <Card className="p-4">
        <ActionForm action={createDepartment} className="flex flex-wrap items-end gap-2">
          <label className="block flex-1">
            <span className="mb-1.5 block text-[11.5px] font-medium text-fg-subtle">Name</span>
            <input type="text" name="name" required className={`w-full min-w-[160px] ${inputClass}`} />
          </label>
          <label className="block flex-1">
            <span className="mb-1.5 block text-[11.5px] font-medium text-fg-subtle">Manager</span>
            <select name="managerId" defaultValue="" className={`w-full ${inputClass}`}>
              <option value="">— None —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="primary" size="sm">
            Add department
          </Button>
        </ActionForm>
      </Card>

      <div className="flex flex-col gap-2">
        {departments.map((department) => (
          <Card key={department.id} className="flex flex-wrap items-end gap-2 p-3">
            <ActionForm
              action={updateDepartment.bind(null, department.id)}
              className="flex flex-1 flex-wrap items-end gap-2"
            >
              <label className="block flex-1">
                <span className="mb-1.5 block text-[11px] font-medium text-fg-subtle">Name</span>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={department.name}
                  className={`w-full min-w-[140px] ${inputClass}`}
                />
              </label>
              <label className="block flex-1">
                <span className="mb-1.5 block text-[11px] font-medium text-fg-subtle">Manager</span>
                <select name="managerId" defaultValue={department.managerId ?? ""} className={`w-full ${inputClass}`}>
                  <option value="">— None —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-fg-muted">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={department.isActive}
                  className="rounded border-border-strong accent-accent"
                />
                Active
              </label>
              <span className="text-[11.5px] text-fg-subtle">
                {department._count.employees} employee{department._count.employees === 1 ? "" : "s"} ·{" "}
                {department._count.boards} board{department._count.boards === 1 ? "" : "s"}
              </span>
              <Button type="submit" variant="primary" size="sm">
                Save
              </Button>
            </ActionForm>
            <DeleteButton action={deleteDepartment.bind(null, department.id)} label="Delete" />
          </Card>
        ))}
        {departments.length === 0 ? (
          <Card className="p-8 text-center text-fg-subtle">No departments yet.</Card>
        ) : null}
      </div>
    </div>
  );
}
