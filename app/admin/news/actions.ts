"use server";

import { Permission, Role, NewsPostStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import {
  saveAttachmentFile,
  deleteAttachmentFile,
  newsCoverStorageKey,
  MAX_NEWS_COVER_BYTES,
  MAX_NEWS_COVER_MB,
} from "@/lib/storage";
import type { FormActionState } from "@/components/ui/action-form";
import type { DeleteActionState } from "@/components/ui/delete-button";

const ALLOWED_COVER_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

function validateCoverImage(file: File): string | null {
  if (file.size > MAX_NEWS_COVER_BYTES) return `Cover image exceeds the ${MAX_NEWS_COVER_MB}MB limit.`;
  if (!ALLOWED_COVER_IMAGE_TYPES.includes(file.type)) return "Cover image must be a PNG, JPEG, or WebP image.";
  return null;
}

type PostFields = {
  title: string;
  body: string;
  targetDepartmentId: string | null;
  targetLocationId: string | null;
  targetRole: Role | null;
  status: NewsPostStatus;
};

// Validated up front, before any database write, so a bad title/body/cover
// image never leaves an orphaned draft row behind — only a genuine
// storage-layer failure during the actual upload (rare) can do that, which
// is an acceptable edge case (the admin can just re-upload from the edit
// page) rather than one worth transactional rollback machinery for.
function readFields(formData: FormData): { error: string } | { fields: PostFields; cover: File | null } {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const targetDepartmentId = String(formData.get("targetDepartmentId") ?? "").trim() || null;
  const targetLocationId = String(formData.get("targetLocationId") ?? "").trim() || null;
  const targetRoleRaw = String(formData.get("targetRole") ?? "").trim();
  const targetRole = targetRoleRaw ? (targetRoleRaw as Role) : null;
  const status = formData.get("status") === "PUBLISHED" ? NewsPostStatus.PUBLISHED : NewsPostStatus.DRAFT;

  if (!title || !body) {
    return { error: "Title and body are required." };
  }

  const cover = formData.get("coverImage");
  if (cover instanceof File && cover.size > 0) {
    const coverError = validateCoverImage(cover);
    if (coverError) return { error: coverError };
    return { fields: { title, body, targetDepartmentId, targetLocationId, targetRole, status }, cover };
  }

  return { fields: { title, body, targetDepartmentId, targetLocationId, targetRole, status }, cover: null };
}

export async function createNewsPost(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const user = await requirePermission(Permission.MANAGE_NEWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const parsed = readFields(formData);
  if ("error" in parsed) return parsed;
  const { fields, cover } = parsed;

  const post = await prisma.newsPost.create({
    data: {
      ...fields,
      // First-publish invariant: status=PUBLISHED always pairs with a
      // non-null publishedAt, so lib/news.ts's visibility query (which
      // filters on both) never silently drops a "published" row.
      publishedAt: fields.status === "PUBLISHED" ? new Date() : null,
      authorId: user.id,
    },
  });

  if (cover) {
    await saveAttachmentFile(newsCoverStorageKey(post.id), Buffer.from(await cover.arrayBuffer()));
    await prisma.newsPost.update({
      where: { id: post.id },
      data: { coverImageUrl: `/api/news/${post.id}/cover`, coverImageMimeType: cover.type },
    });
  }

  revalidatePath("/admin/news");
  redirect(`/admin/news/${post.id}/edit`);
}

export async function updateNewsPost(
  postId: string,
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  await requirePermission(Permission.MANAGE_NEWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const parsed = readFields(formData);
  if ("error" in parsed) return parsed;
  const { fields, cover } = parsed;

  const existing = await prisma.newsPost.findUnique({ where: { id: postId }, select: { publishedAt: true } });
  if (!existing) return { error: "This post no longer exists." };

  // Preserve the original publish date across unpublish/republish — only a
  // first-time transition into PUBLISHED sets it.
  const publishedAt = fields.status === "PUBLISHED" ? (existing.publishedAt ?? new Date()) : existing.publishedAt;

  if (cover) {
    await saveAttachmentFile(newsCoverStorageKey(postId), Buffer.from(await cover.arrayBuffer()));
  }

  await prisma.newsPost.update({
    where: { id: postId },
    data: {
      ...fields,
      publishedAt,
      ...(cover ? { coverImageUrl: `/api/news/${postId}/cover`, coverImageMimeType: cover.type } : {}),
    },
  });

  revalidatePath("/admin/news");
  revalidatePath(`/admin/news/${postId}/edit`);
  return null;
}

// Removes just the cover image, leaving everything else untouched — mirrors
// deleteLocationPageBanner's scoped-removal shape.
export async function deleteNewsPostCover(postId: string) {
  await requirePermission(Permission.MANAGE_NEWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  await deleteAttachmentFile(newsCoverStorageKey(postId));
  await prisma.newsPost.update({
    where: { id: postId },
    data: { coverImageUrl: null, coverImageMimeType: null },
  });

  revalidatePath(`/admin/news/${postId}/edit`);
}

export async function deleteNewsPost(
  postId: string,
  _prevState: DeleteActionState,
  _formData: FormData
): Promise<DeleteActionState> {
  await requirePermission(Permission.MANAGE_NEWS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  await deleteAttachmentFile(newsCoverStorageKey(postId));
  await prisma.newsPost.delete({ where: { id: postId } });

  revalidatePath("/admin/news");
  redirect("/admin/news");
}
