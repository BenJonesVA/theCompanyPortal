"use server";

import { Permission, Prisma, TicketPriority, Role, LocationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { parseFieldSchema, extractCustomFieldsFromFormData, validateCustomFieldValues } from "@/lib/asset-fields";
import {
  saveAttachmentFile,
  deleteAttachmentFile,
  bannerStorageKey,
  MAX_BANNER_IMAGE_BYTES,
  MAX_BANNER_IMAGE_MB,
} from "@/lib/storage";
import type { DeleteActionState } from "@/components/ui/delete-button";
import type { FormActionState } from "@/components/ui/action-form";

const ALLOWED_BANNER_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function createLocation(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  await requirePermission(Permission.MANAGE_LOCATIONS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  const type = (String(formData.get("type") ?? "").trim() || "BRANCH") as LocationType;
  const parentIdRaw = String(formData.get("parentId") ?? "").trim();
  const parentId = parentIdRaw ? parentIdRaw : null;

  if (!name) {
    return { error: "Location name is required" };
  }

  const location = await prisma.location.create({
    data: { name, address, type, parentId },
  });

  redirect(`/locations/${location.id}`);
}

export async function updateLocation(id: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  await requirePermission(Permission.MANAGE_LOCATIONS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  const isActive = formData.get("isActive") === "on";

  if (!name) {
    return { error: "Location name is required" };
  }

  await prisma.location.update({
    where: { id },
    data: { name, address, isActive },
  });

  revalidatePath("/locations");
  revalidatePath(`/locations/${id}`);
  return null;
}

// Returns { error } instead of throwing for the expected/guarded failure —
// a thrown Error's message gets redacted by Next.js in production builds
// (components/ui/delete-button.tsx explains why), which would otherwise turn
// this into a blank crash screen instead of the message below.
export async function deleteLocation(id: string, _prevState: DeleteActionState, _formData: FormData): Promise<DeleteActionState> {
  await requirePermission(Permission.MANAGE_LOCATIONS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  try {
    await prisma.location.delete({ where: { id } });
  } catch (error) {
    // Ticket.locationId is a required FK with no onDelete set (RESTRICT), so
    // any ticket filed against this location blocks the delete.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return {
        error: "Cannot delete a location with existing tickets or employees — deactivate it instead.",
      };
    }
    throw error;
  }

  revalidatePath("/locations");
  redirect("/locations");
}

export async function createAsset(locationId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  await requirePermission(Permission.MANAGE_ASSETS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const name = String(formData.get("name") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const serialNumber = String(formData.get("serialNumber") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name || !categoryId) {
    return { error: "Asset name and category are required" };
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

  await prisma.asset.create({
    data: { locationId, name, categoryId, serialNumber, notes, customFields },
  });

  revalidatePath(`/locations/${locationId}`);
  return null;
}

// Creates or updates this location's per-priority SLA override. lib/sla.ts's
// resolveSlaPolicy checks for an active row here before falling back to the
// org-wide SlaPolicy — see app/admin/sla for the equivalent global-policy form.
export async function upsertLocationSlaPolicy(
  locationId: string,
  priority: TicketPriority,
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  await requirePermission(Permission.MANAGE_LOCATIONS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const responseTargetMinutes = Number(formData.get("responseTargetMinutes"));
  const resolutionTargetMinutes = Number(formData.get("resolutionTargetMinutes"));

  if (
    !Number.isInteger(responseTargetMinutes) ||
    responseTargetMinutes <= 0 ||
    !Number.isInteger(resolutionTargetMinutes) ||
    resolutionTargetMinutes <= 0
  ) {
    return { error: "Response and resolution targets must be positive whole numbers of minutes" };
  }

  await prisma.locationSlaPolicy.upsert({
    where: { locationId_priority: { locationId, priority } },
    create: { locationId, priority, responseTargetMinutes, resolutionTargetMinutes, isActive: true },
    update: { responseTargetMinutes, resolutionTargetMinutes, isActive: true },
  });

  revalidatePath(`/locations/${locationId}`);
  return null;
}

// Removes this location's override for one priority — after this, SLA status
// for that priority falls back to the org-wide SlaPolicy again.
export async function deleteLocationSlaPolicy(locationId: string, priority: TicketPriority) {
  await requirePermission(Permission.MANAGE_LOCATIONS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  await prisma.locationSlaPolicy.deleteMany({ where: { locationId, priority } });

  revalidatePath(`/locations/${locationId}`);
}

// Creates or updates this location's page-personalization config
// (lib/locations.ts resolves it up the parent chain for locations with no
// config of their own). A newly-uploaded banner image always wins over
// whatever banner was there before; leaving the file input empty keeps the
// existing one untouched rather than clearing it — use
// deleteLocationPageBanner to remove it explicitly.
export async function upsertLocationPageConfig(
  locationId: string,
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const user = await requirePermission(Permission.MANAGE_LOCATIONS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const bannerText = String(formData.get("bannerText") ?? "").trim() || null;
  const floorPlanUrl = String(formData.get("floorPlanUrl") ?? "").trim() || null;
  const widgetConfigRaw = String(formData.get("widgetConfig") ?? "").trim();

  let widgetConfig: Prisma.InputJsonValue | undefined = undefined;
  if (widgetConfigRaw) {
    try {
      const parsed = JSON.parse(widgetConfigRaw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { error: "Widget config must be a JSON object, e.g. {\"weather\": {\"enabled\": true}}" };
      }
      widgetConfig = parsed;
    } catch {
      return { error: "Widget config is not valid JSON" };
    }
  }

  const banner = formData.get("bannerImage");
  let bannerFields: { bannerImageUrl: string; bannerImageMimeType: string } | undefined;
  if (banner instanceof File && banner.size > 0) {
    if (banner.size > MAX_BANNER_IMAGE_BYTES) {
      return { error: `Banner image exceeds the ${MAX_BANNER_IMAGE_MB}MB limit.` };
    }
    if (!ALLOWED_BANNER_IMAGE_TYPES.includes(banner.type)) {
      return { error: "Banner image must be a PNG, JPEG, or WebP image." };
    }
    await saveAttachmentFile(bannerStorageKey(locationId), Buffer.from(await banner.arrayBuffer()));
    bannerFields = {
      bannerImageUrl: `/api/locations/${locationId}/banner`,
      bannerImageMimeType: banner.type,
    };
  }

  await prisma.locationPageConfig.upsert({
    where: { locationId },
    create: {
      locationId,
      bannerText,
      floorPlanUrl,
      widgetConfig,
      updatedByUserId: user.id,
      ...bannerFields,
    },
    update: {
      bannerText,
      floorPlanUrl,
      widgetConfig: widgetConfig ?? Prisma.JsonNull,
      updatedByUserId: user.id,
      ...bannerFields,
    },
  });

  revalidatePath(`/locations/${locationId}`);
  return null;
}

// Removes just the banner image, leaving bannerText/floorPlanUrl/widgetConfig
// untouched — mirrors deleteLocationSlaPolicy's scoped-removal shape.
export async function deleteLocationPageBanner(locationId: string) {
  await requirePermission(Permission.MANAGE_LOCATIONS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  await deleteAttachmentFile(bannerStorageKey(locationId));
  await prisma.locationPageConfig.updateMany({
    where: { locationId },
    data: { bannerImageUrl: null, bannerImageMimeType: null },
  });

  revalidatePath(`/locations/${locationId}`);
}
