"use server";

import { Permission, Prisma, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireRole } from "@/lib/rbac";
import type { DeleteActionState } from "@/components/ui/delete-button";
import type { FormActionState } from "@/components/ui/action-form";

const VALID_ROLES = Object.values(Role);

// Returns { error } instead of throwing for guarded/expected failures — a
// thrown Error's message gets redacted by Next.js in production builds
// (components/ui/delete-button.tsx explains why), which would otherwise land
// the user on the generic app/error.tsx screen instead of an inline message
// next to their still-filled-in form.
export async function createUser(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const actingUser = await requirePermission(Permission.MANAGE_USERS, Role.SUPER_ADMIN);

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "");
  const password = String(formData.get("password") ?? "");
  const managerId = String(formData.get("managerId") ?? "").trim() || null;
  const locationId = String(formData.get("locationId") ?? "").trim() || null;
  const departmentId = String(formData.get("departmentId") ?? "").trim() || null;

  if (!name || !email || !password) {
    return { error: "Name, email, and password are required" };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }
  if (!VALID_ROLES.includes(role as Role)) {
    throw new Error("Invalid role");
  }
  // MANAGE_USERS is additive on top of a role, not admin-equivalent — an
  // EMPLOYEE/DEPARTMENT_MANAGER granted it can manage non-admin accounts,
  // but minting a brand-new SUPER_ADMIN account (and logging in as it) is a
  // real SUPER_ADMIN's call alone, same reasoning as the
  // last-active-admin guard below.
  if (role === Role.SUPER_ADMIN && actingUser.role !== Role.SUPER_ADMIN) {
    return { error: "Only an admin can create another admin." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let user;
  try {
    user = await prisma.user.create({
      data: { name, email, title, role: role as Role, passwordHash, managerId, locationId, departmentId },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "A user with that email already exists" };
    }
    throw error;
  }

  redirect(`/admin/users/${user.id}`);
}

export async function updateUser(id: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const actingUser = await requirePermission(Permission.MANAGE_USERS, Role.SUPER_ADMIN);

  const name = String(formData.get("name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "");
  const isActive = formData.get("isActive") === "on";
  const newPassword = String(formData.get("password") ?? "");
  const managerId = String(formData.get("managerId") ?? "").trim() || null;
  const locationId = String(formData.get("locationId") ?? "").trim() || null;
  const departmentId = String(formData.get("departmentId") ?? "").trim() || null;

  if (!name) {
    return { error: "Name is required" };
  }
  if (!VALID_ROLES.includes(role as Role)) {
    throw new Error("Invalid role");
  }
  if (newPassword && newPassword.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }
  if (managerId === id) {
    return { error: "A user cannot be their own manager" };
  }

  const currentUser = await prisma.user.findUnique({ where: { id } });
  if (!currentUser) {
    throw new Error("User not found");
  }

  // Same reasoning as createUser above: MANAGE_USERS is additive, not
  // admin-equivalent. Block both directions of escalation — granting the
  // admin role, and touching an account that already holds it (edits,
  // deactivation, or a role change away from it) — unless the acting user is
  // a real ADMIN themselves.
  if ((role === Role.SUPER_ADMIN || currentUser.role === Role.SUPER_ADMIN) && actingUser.role !== Role.SUPER_ADMIN) {
    return { error: "Only an admin can grant or modify the admin role." };
  }

  // If this edit would take the user out of "active ADMIN" status (role
  // changed away from ADMIN, or deactivated) and they currently ARE an
  // active admin, make sure at least one other active admin remains —
  // otherwise the account could lock every admin out of staff management.
  const wasActiveAdmin = currentUser.role === Role.SUPER_ADMIN && currentUser.isActive;
  const staysActiveAdmin = role === Role.SUPER_ADMIN && isActive;
  if (wasActiveAdmin && !staysActiveAdmin) {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: Role.SUPER_ADMIN, isActive: true, id: { not: id } },
    });
    if (otherActiveAdmins === 0) {
      return { error: "Cannot remove the last active admin" };
    }
  }

  const data: Prisma.UserUpdateInput = {
    name,
    title,
    role: role as Role,
    isActive,
    manager: managerId ? { connect: { id: managerId } } : { disconnect: true },
    location: locationId ? { connect: { id: locationId } } : { disconnect: true },
    department: departmentId ? { connect: { id: departmentId } } : { disconnect: true },
  };

  if (newPassword) {
    data.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  await prisma.user.update({ where: { id }, data });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
  return null;
}

// Returns { error } instead of throwing for expected/guarded failures — a
// thrown Error's message gets redacted by Next.js in production builds
// (components/ui/delete-button.tsx explains why), which would otherwise turn
// these into a blank crash screen instead of a useful message.
export async function deleteUser(id: string, _prevState: DeleteActionState, _formData: FormData): Promise<DeleteActionState> {
  const actingUser = await requirePermission(Permission.MANAGE_USERS, Role.SUPER_ADMIN);

  const currentUser = await prisma.user.findUnique({ where: { id } });
  if (!currentUser) {
    return { error: "User not found" };
  }

  // Same escalation guard as create/update above — a MANAGE_USERS grant
  // doesn't extend to touching an existing admin's account.
  if (currentUser.role === Role.SUPER_ADMIN && actingUser.role !== Role.SUPER_ADMIN) {
    return { error: "Only an admin can delete an admin account." };
  }

  if (currentUser.role === Role.SUPER_ADMIN && currentUser.isActive) {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: Role.SUPER_ADMIN, isActive: true, id: { not: id } },
    });
    if (otherActiveAdmins === 0) {
      return { error: "Cannot remove the last active admin" };
    }
  }

  try {
    await prisma.user.delete({ where: { id } });
  } catch (error) {
    // Required (non-nullable) FKs like TimeLog.userId, Expense.userId,
    // KbArticle.createdById, and CannedResponse.createdById have no
    // onDelete behavior, so Prisma throws P2003 if any exist for this user.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return {
        error: "Cannot delete a user with existing time logs, expenses, or authored content — deactivate the account instead.",
      };
    }
    throw error;
  }

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

// Replaces the user's full group membership set with whatever's checked —
// simpler and safer than diffing add/remove, and this form always submits
// the complete set of checkboxes anyway.
export async function setUserPermissionGroups(userId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  await requireRole(Role.SUPER_ADMIN);

  const groupIds = formData.getAll("groupIds").map(String);

  await prisma.$transaction([
    prisma.userPermissionGroup.deleteMany({ where: { userId } }),
    ...(groupIds.length > 0
      ? [
          prisma.userPermissionGroup.createMany({
            data: groupIds.map((groupId) => ({ userId, groupId })),
          }),
        ]
      : []),
  ]);

  revalidatePath(`/admin/users/${userId}`);
  return null;
}

// Replaces the user's full location membership set (app/tickets/page.tsx's
// list query and app/tickets/[id]/page.tsx's assignee picker both read
// LocationMember for RBAC scoping) — same full-replace-on-submit approach as
// setUserPermissionGroups, and the same MANAGE_USERS gate as the rest of
// this file (not the stricter SUPER_ADMIN-only requireRole used for
// permission groups — location scoping only ever narrows what a user can
// see, it can't escalate privilege the way a permission group grant can).
export async function setUserLocationMemberships(userId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  await requirePermission(Permission.MANAGE_USERS, Role.SUPER_ADMIN);

  const locationIds = formData.getAll("locationIds").map(String);

  await prisma.$transaction([
    prisma.locationMember.deleteMany({ where: { userId } }),
    ...(locationIds.length > 0
      ? [
          prisma.locationMember.createMany({
            data: locationIds.map((locationId) => ({ userId, locationId })),
          }),
        ]
      : []),
  ]);

  revalidatePath(`/admin/users/${userId}`);
  return null;
}
