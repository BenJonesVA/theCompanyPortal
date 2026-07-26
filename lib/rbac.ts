import { redirect } from "next/navigation";
import type { Permission, Role } from "@prisma/client";
import { auth } from "@/auth";

// Server-only authorization helpers. Middleware only does a coarse
// authenticated/role gate — every Server Component and Server Action that
// touches role-gated data must call one of these itself.

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session.user;
}

export async function requireRole(...roles: Role[]) {
  const user = await requireAuth();
  if (!user.role || !roles.includes(user.role)) {
    redirect("/unauthorized");
  }
  return user;
}

// Additive permission check: passes if the user's role is one of `roles`
// (identical to requireRole — this never restricts SUPER_ADMIN/
// DEPARTMENT_MANAGER below what they already have), OR the user holds
// `permission` via a PermissionGroup. Use this instead of requireRole
// wherever a permission group should be able to grant the capability to a
// role that wouldn't otherwise have it (e.g. letting an EMPLOYEE manage
// boards without promoting them to DEPARTMENT_MANAGER).
export async function requirePermission(permission: Permission, ...roles: Role[]) {
  const user = await requireAuth();
  if (user.role && roles.includes(user.role)) return user;
  if (user.permissions?.includes(permission)) return user;
  redirect("/unauthorized");
}
