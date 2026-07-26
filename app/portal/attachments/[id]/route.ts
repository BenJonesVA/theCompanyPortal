import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";
import { readAttachmentFile, contentDispositionHeader } from "@/lib/storage";

// Nested under /portal (not /api/attachments) so this stays reachable for
// EMPLOYEE-role sessions confined by middleware.ts to that path. Ownership
// and internal-visibility are enforced in the query itself, not filtered
// after fetching — same discipline as every other portal read in this app
// (e.g. app/portal/tickets/[id]/page.tsx's comment scoping): a wrong
// requesterId or an internal-only attachment id is a genuine 404, not a
// fetched-then-hidden row.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();

  const { id } = await params;
  const attachment = await prisma.attachment.findFirst({
    where: { id, isInternal: false, ticket: { requesterId: user.id } },
  });
  if (!attachment) return new Response("Not found", { status: 404 });

  const data = await readAttachmentFile(attachment.id);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": contentDispositionHeader(attachment.fileName),
      "Content-Length": String(attachment.sizeBytes),
    },
  });
}
