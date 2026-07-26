import { notFound } from "next/navigation";
import { Permission, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { deleteUser, updateUser, setUserPermissionGroups, setUserLocationMemberships } from "../actions";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DeleteButton } from "@/components/ui/delete-button";

const ROLE_OPTIONS = [Role.SUPER_ADMIN, Role.LOCATION_ADMIN, Role.DEPARTMENT_MANAGER, Role.EMPLOYEE] as const;

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requirePermission(Permission.MANAGE_USERS, Role.SUPER_ADMIN);
  // Group *assignment* stays SUPER_ADMIN-only regardless of a granted
  // MANAGE_USERS permission (setUserPermissionGroups enforces this too) —
  // otherwise a permissioned non-admin could hand themselves or anyone else
  // more access than a SUPER_ADMIN chose to grant.
  const viewerIsAdmin = viewer.role === Role.SUPER_ADMIN;

  const { id } = await params;

  const [user, allGroups, allLocations, allDepartments, allUsers] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: { permissionGroups: { select: { groupId: true } }, locationMemberships: { select: { locationId: true } } },
    }),
    viewerIsAdmin ? prisma.permissionGroup.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { isActive: true, id: { not: id } }, orderBy: { name: "asc" } }),
  ]);

  if (!user) {
    notFound();
  }

  const memberGroupIds = new Set(user.permissionGroups.map((m) => m.groupId));
  const memberLocationIds = new Set(user.locationMemberships.map((m) => m.locationId));
  const updateUserForId = updateUser.bind(null, user.id);
  const deleteUserForId = deleteUser.bind(null, user.id);
  const setGroupsForUser = setUserPermissionGroups.bind(null, user.id);
  const setLocationsForUser = setUserLocationMemberships.bind(null, user.id);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-[24px] font-bold tracking-tight text-fg">{user.name}</h1>
      <p className="mt-[3px] text-[13.5px] text-fg-muted">{user.email}</p>

      <Card className="mt-6 p-6">
        <ActionForm action={updateUserForId} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg-muted">Email</label>
            <p className="mt-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-fg-muted">
              {user.email}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Name</label>
            <input
              name="name"
              required
              defaultValue={user.name}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Title (optional)</label>
            <input
              name="title"
              defaultValue={user.title ?? ""}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Role</label>
            <select
              name="role"
              defaultValue={user.role}
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
              defaultValue={user.managerId ?? ""}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            >
              <option value="">— None —</option>
              {allUsers.map((u) => (
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
              defaultValue={user.locationId ?? ""}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            >
              <option value="">— None —</option>
              {allLocations.map((location) => (
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
              defaultValue={user.departmentId ?? ""}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            >
              <option value="">— None —</option>
              {allDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={user.isActive}
              className="rounded border-border-strong accent-accent"
            />
            Active
          </label>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Reset password (optional)</label>
            <input
              name="password"
              type="password"
              minLength={8}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
              placeholder="Leave blank to keep current password"
            />
            <p className="mt-1 text-xs text-fg-subtle">At least 8 characters. Leave blank to leave unchanged.</p>
          </div>

          <div className="flex justify-end gap-3">
            <a href="/admin/users">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </a>
            <Button type="submit" variant="primary">
              Save changes
            </Button>
          </div>
        </ActionForm>
      </Card>

      {viewerIsAdmin && (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="text-[13.5px] font-semibold text-fg">Permission groups</h2>
          </CardHeader>
          {allGroups.length === 0 ? (
            <p className="px-5 py-6 text-sm text-fg-muted">
              No permission groups exist yet. Create one on the{" "}
              <a href="/admin/permission-groups" className="text-accent hover:underline">
                Permission Groups
              </a>{" "}
              page.
            </p>
          ) : (
            <ActionForm action={setGroupsForUser} className="flex flex-col gap-3 p-5">
              <div className="flex flex-col gap-2">
                {allGroups.map((group) => (
                  <label key={group.id} className="flex items-center gap-2.5 text-sm text-fg-muted">
                    <input
                      type="checkbox"
                      name="groupIds"
                      value={group.id}
                      defaultChecked={memberGroupIds.has(group.id)}
                      className="rounded border-border-strong accent-accent"
                    />
                    {group.name}
                  </label>
                ))}
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="primary" size="sm">
                  Save groups
                </Button>
              </div>
            </ActionForm>
          )}
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">Locations</h2>
        </CardHeader>
        <p className="border-b border-border px-5 py-3 text-xs text-fg-subtle">
          Restricts which locations&apos; tickets this user can see and be assigned —
          leave unchecked entirely to leave this user unrestricted (sees every location).
        </p>
        {allLocations.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-muted">
            No locations exist yet.
          </p>
        ) : (
          <ActionForm action={setLocationsForUser} className="flex flex-col gap-3 p-5">
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
              {allLocations.map((location) => (
                <label key={location.id} className="flex items-center gap-2.5 text-sm text-fg-muted">
                  <input
                    type="checkbox"
                    name="locationIds"
                    value={location.id}
                    defaultChecked={memberLocationIds.has(location.id)}
                    className="rounded border-border-strong accent-accent"
                  />
                  {location.name}
                </label>
              ))}
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" size="sm">
                Save locations
              </Button>
            </div>
          </ActionForm>
        )}
      </Card>

      <div className="mt-6 flex justify-end">
        <DeleteButton action={deleteUserForId} label="Delete user" />
      </div>
    </div>
  );
}
