import { Permission, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { createLocation } from "../actions";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const LOCATION_TYPES = ["CORPORATE_HQ", "REGIONAL_HUB", "BRANCH"] as const;

export default async function NewLocationPage() {
  await requirePermission(Permission.MANAGE_LOCATIONS, Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER);

  const locations = await prisma.location.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-[24px] font-bold tracking-tight text-fg">New location</h1>

      <Card className="mt-6 p-6">
        <ActionForm action={createLocation} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg-muted">Name</label>
            <input
              name="name"
              required
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Type</label>
            <select
              name="type"
              defaultValue="BRANCH"
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            >
              {LOCATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Address</label>
            <textarea
              name="address"
              rows={3}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Parent location (optional)</label>
            <select
              name="parentId"
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

          <Button type="submit" variant="primary">
            Create location
          </Button>
        </ActionForm>
      </Card>
    </div>
  );
}
