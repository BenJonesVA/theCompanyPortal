import { Permission, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { createUser } from "../actions";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const ROLE_OPTIONS = [Role.SUPER_ADMIN, Role.LOCATION_ADMIN, Role.DEPARTMENT_MANAGER, Role.EMPLOYEE] as const;

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>;
}) {
  await requirePermission(Permission.MANAGE_USERS, Role.SUPER_ADMIN);
  const { locationId: preselectedLocationId } = await searchParams;

  const [locations, departments, users] = await Promise.all([
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-[24px] font-bold tracking-tight text-fg">New user</h1>

      <Card className="mt-6 p-6">
        <ActionForm action={createUser} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg-muted">Name</label>
            <input
              name="name"
              required
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Email</label>
            <input
              name="email"
              type="email"
              required
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Title (optional)</label>
            <input
              name="title"
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Role</label>
            <select
              name="role"
              defaultValue={Role.EMPLOYEE}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Manager (optional)</label>
            <select
              name="managerId"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            >
              <option value="">— None —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Location (optional)</label>
            <select
              name="locationId"
              defaultValue={preselectedLocationId ?? ""}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            >
              <option value="">— None —</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Department (optional)</label>
            <select
              name="departmentId"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            >
              <option value="">— None —</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Password</label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
            <p className="mt-1 text-xs text-fg-subtle">At least 8 characters.</p>
          </div>

          <div className="flex justify-end gap-3">
            <a href="/admin/users">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </a>
            <Button type="submit" variant="primary">
              Create user
            </Button>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
