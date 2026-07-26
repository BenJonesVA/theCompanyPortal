"use server";

import { Permission, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { DeleteActionState } from "@/components/ui/delete-button";
import type { FormActionState } from "@/components/ui/action-form";
import { parseFieldSchema, extractCustomFieldsFromFormData, validateCustomFieldValues } from "@/lib/asset-fields";

export async function updateAsset(id: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  await requirePermission(Permission.MANAGE_ASSETS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const name = String(formData.get("name") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const serialNumber = String(formData.get("serialNumber") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const isActive = formData.get("isActive") === "on";

  if (!name || !locationId || !categoryId) {
    return { error: "Asset name, location, and category are required" };
  }

  const existing = await prisma.asset.findUnique({ where: { id }, select: { locationId: true } });
  if (!existing) {
    throw new Error("Asset not found");
  }

  const category = await prisma.assetCategory.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw new Error("Selected category no longer exists");
  }
  const fieldSchema = parseFieldSchema(category.fieldSchema);
  const customFields = extractCustomFieldsFromFormData(formData, fieldSchema);
  const fieldError = validateCustomFieldValues(fieldSchema, customFields);
  if (fieldError) {
    return { error: fieldError };
  }

  const asset = await prisma.asset.update({
    where: { id },
    data: { name, locationId, categoryId, serialNumber, notes, isActive, customFields },
  });

  revalidatePath("/assets");
  revalidatePath(`/assets/${id}`);
  revalidatePath(`/locations/${existing.locationId}`);
  if (asset.locationId !== existing.locationId) {
    revalidatePath(`/locations/${asset.locationId}`);
  }
  return null;
}

// TicketAsset.assetId cascades on delete (unlike Board/User/Location, which
// RESTRICT), so deleting an asset can't fail on existing ticket links — it
// just unlinks them. No guard needed, but still returns { error } instead of
// throwing on the unexpected-failure path for the same reason as the other
// delete actions (see components/ui/delete-button.tsx): a thrown Error's
// message gets redacted by Next.js in production builds.
export async function deleteAsset(id: string, _prevState: DeleteActionState, _formData: FormData): Promise<DeleteActionState> {
  await requirePermission(Permission.MANAGE_ASSETS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const asset = await prisma.asset.findUnique({ where: { id }, select: { locationId: true } });
  if (!asset) {
    return { error: "Asset not found." };
  }

  await prisma.asset.delete({ where: { id } });

  revalidatePath("/assets");
  revalidatePath(`/locations/${asset.locationId}`);
  redirect("/assets");
}
