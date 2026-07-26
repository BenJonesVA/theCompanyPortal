"use server";

import { Permission, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import type { DeleteActionState } from "@/components/ui/delete-button";
import type { FormActionState } from "@/components/ui/action-form";

export async function createDepartment(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  await requirePermission(Permission.MANAGE_DEPARTMENTS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const managerId = String(formData.get("managerId") ?? "").trim() || null;

  if (!name) {
    return { error: "Department name is required" };
  }

  try {
    await prisma.department.create({ data: { name, description, managerId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "A department with that name already exists" };
    }
    throw error;
  }

  revalidatePath("/admin/departments");
  return null;
}

export async function updateDepartment(id: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  await requirePermission(Permission.MANAGE_DEPARTMENTS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const managerId = String(formData.get("managerId") ?? "").trim() || null;
  const isActive = formData.get("isActive") === "on";

  if (!name) {
    return { error: "Department name is required" };
  }

  await prisma.department.update({
    where: { id },
    data: { name, description, managerId, isActive },
  });

  revalidatePath("/admin/departments");
  return null;
}

// Returns { error } instead of throwing for the expected/guarded failure —
// a thrown Error's message gets redacted by Next.js in production builds
// (components/ui/delete-button.tsx explains why), which would otherwise turn
// this into a blank crash screen instead of the message below.
export async function deleteDepartment(id: string, _prevState: DeleteActionState, _formData: FormData): Promise<DeleteActionState> {
  await requirePermission(Permission.MANAGE_DEPARTMENTS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  try {
    await prisma.department.delete({ where: { id } });
  } catch (error) {
    // Board.departmentId and User.departmentId are optional FKs with
    // onDelete: SetNull, so a delete here always succeeds — this catch is
    // just the same defensive shape every other delete action in this app
    // uses, in case a future required reference is added.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { error: "Cannot delete this department while other records still reference it." };
    }
    throw error;
  }

  revalidatePath("/admin/departments");
  return null;
}
