import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Two interchangeable drivers behind the same function signatures, selected
// by STORAGE_DRIVER (default "local") so every call site (ticket attachments,
// branding logo) works unmodified regardless of backend. Files are keyed
// purely by the Attachment row's own cuid id, never by the client-supplied
// filename, so there's no path-traversal surface to guard against: the id
// always comes from Prisma, never from user input, and the original filename
// is only ever used for display and the download Content-Disposition header.
const STORAGE_DRIVER = process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";

// In `docker-compose.yml` this directory is a named volume so uploads
// survive container recreation, the same way Postgres's data does — only
// relevant when STORAGE_DRIVER=local.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENT_MB = 20;

// Org logo — a single fixed-name file (there's only ever one), served
// unauthenticated by app/api/branding/logo/route.ts. Setting.logoMimeType
// (lib/settings.ts) records whether one exists and what content type to
// send back; the file itself is content-addressed by nothing but that flag.
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_LOGO_MB = 2;

const LOGO_KEY = "branding-logo";
const ATTACHMENT_PREFIX = "attachments/";

// Constructed lazily so local-disk deployments never need any S3_* env var set.
let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (s3Client) return s3Client;
  const region = process.env.S3_REGION;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error("STORAGE_DRIVER=s3 requires S3_REGION, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY to be set.");
  }
  s3Client = new S3Client({
    region,
    endpoint: process.env.S3_ENDPOINT || undefined,
    // Path-style addressing is what R2/MinIO and most other S3-compatible
    // services expect when a custom endpoint is set; real AWS works with
    // either style, so this only changes behavior when S3_ENDPOINT is set.
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: { accessKeyId, secretAccessKey },
  });
  return s3Client;
}

function s3Bucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET to be set.");
  return bucket;
}

async function s3Put(key: string, data: Buffer): Promise<void> {
  await getS3Client().send(new PutObjectCommand({ Bucket: s3Bucket(), Key: key, Body: data }));
}

async function s3Get(key: string): Promise<Buffer> {
  const result = await getS3Client().send(new GetObjectCommand({ Bucket: s3Bucket(), Key: key }));
  const bytes = await result.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

async function s3Delete(key: string): Promise<void> {
  await getS3Client().send(new DeleteObjectCommand({ Bucket: s3Bucket(), Key: key }));
}

export async function saveAttachmentFile(id: string, data: Buffer): Promise<void> {
  if (STORAGE_DRIVER === "s3") {
    await s3Put(`${ATTACHMENT_PREFIX}${id}`, data);
    return;
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, id), data);
}

export async function readAttachmentFile(id: string): Promise<Buffer> {
  if (STORAGE_DRIVER === "s3") {
    return s3Get(`${ATTACHMENT_PREFIX}${id}`);
  }
  return readFile(path.join(UPLOAD_DIR, id));
}

// Best-effort — if the file's already gone (or was never written), that's
// not an error worth surfacing to the caller deleting the Attachment row.
export async function deleteAttachmentFile(id: string): Promise<void> {
  try {
    if (STORAGE_DRIVER === "s3") {
      await s3Delete(`${ATTACHMENT_PREFIX}${id}`);
    } else {
      await unlink(path.join(UPLOAD_DIR, id));
    }
  } catch {
    // nothing to clean up
  }
}

export async function saveLogoFile(data: Buffer): Promise<void> {
  if (STORAGE_DRIVER === "s3") {
    await s3Put(LOGO_KEY, data);
    return;
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, LOGO_KEY), data);
}

export async function readLogoFile(): Promise<Buffer | null> {
  try {
    if (STORAGE_DRIVER === "s3") {
      return await s3Get(LOGO_KEY);
    }
    return await readFile(path.join(UPLOAD_DIR, LOGO_KEY));
  } catch {
    return null;
  }
}

// RFC 6266 filename*= handles non-ASCII names; the plain filename= fallback
// (with quotes/CR/LF stripped) covers older clients that ignore filename*=.
export function contentDispositionHeader(fileName: string): string {
  const safe = fileName.replace(/[\r\n"]/g, "");
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
