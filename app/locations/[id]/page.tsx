import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission, TicketPriority, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";
import { parseFieldSchema } from "@/lib/asset-fields";
import { resolveLocationPage } from "@/lib/locations";
import { MAX_BANNER_IMAGE_MB } from "@/lib/storage";
import {
  createAsset,
  updateLocation,
  deleteLocation,
  upsertLocationSlaPolicy,
  deleteLocationSlaPolicy,
  upsertLocationPageConfig,
  deleteLocationPageBanner,
} from "../actions";
import { ActionForm } from "@/components/ui/action-form";
import { DeleteButton } from "@/components/ui/delete-button";
import { StatusBadge, PriorityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { AssetCategoryFields } from "@/components/ui/asset-category-fields";

const SLA_PRIORITY_ORDER: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "EMERGENCY"];

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const isManagerRole = user.role === Role.SUPER_ADMIN || user.role === Role.DEPARTMENT_MANAGER;
  const canManage = isManagerRole || (user.permissions?.includes(Permission.MANAGE_LOCATIONS) ?? false);
  const canManageAssets = isManagerRole || (user.permissions?.includes(Permission.MANAGE_ASSETS) ?? false);

  const { id } = await params;

  const location = await prisma.location.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true } },
      pageConfig: true,
      employees: { orderBy: { name: "asc" } },
      assets: { include: { category: true }, orderBy: { createdAt: "asc" } },
      tickets: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          board: { select: { name: true } },
          assignee: { select: { name: true } },
        },
      },
    },
  });

  if (!location) {
    notFound();
  }

  const assetCategories = await prisma.assetCategory.findMany({ orderBy: { name: "asc" } });
  const assetCategoryOptions = assetCategories.map((category) => ({
    id: category.id,
    name: category.name,
    fields: parseFieldSchema(category.fieldSchema),
  }));

  const [locationSlaPolicies, globalSlaPolicies, resolvedPage] = await Promise.all([
    prisma.locationSlaPolicy.findMany({ where: { locationId: location.id } }),
    prisma.slaPolicy.findMany(),
    resolveLocationPage(location.id),
  ]);
  const locationSlaByPriority = new Map(locationSlaPolicies.map((p) => [p.priority, p]));
  const globalSlaByPriority = new Map(globalSlaPolicies.map((p) => [p.priority, p]));

  const createAssetForLocation = createAsset.bind(null, location.id);
  const updateLocationForLocation = updateLocation.bind(null, location.id);
  const deleteLocationForLocation = deleteLocation.bind(null, location.id);
  const upsertPageConfigForLocation = upsertLocationPageConfig.bind(null, location.id);
  const deletePageBannerForLocation = deleteLocationPageBanner.bind(null, location.id);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-fg">{location.name}</h1>
          <p className="mt-[3px] text-[13.5px] text-fg-muted">{location.type.replace(/_/g, " ")}</p>
          {location.parent && (
            <p className="mt-[3px] text-[13.5px] text-fg-muted">
              Part of{" "}
              <Link href={`/locations/${location.parent.id}`} className="text-accent hover:underline">
                {location.parent.name}
              </Link>
            </p>
          )}
          {location.address && (
            <p className="mt-[3px] text-[13.5px] text-fg-muted">{location.address}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              location.isActive ? "text-green bg-green-bg" : "text-slate bg-slate-bg"
            }`}
          >
            <span className={`h-[7px] w-[7px] rounded-full ${location.isActive ? "bg-green" : "bg-slate"}`} />
            {location.isActive ? "Active" : "Inactive"}
          </span>
          {canManage && (
            <Link href="/locations/new">
              <Button variant="primary">
                <span className="text-[15px] leading-none">+</span>New location
              </Button>
            </Link>
          )}
        </div>
      </div>

      {canManage && (
        <Card>
          <CardHeader>
            <h2 className="text-[13.5px] font-semibold text-fg">Details</h2>
          </CardHeader>
          <ActionForm action={updateLocationForLocation} className="grid grid-cols-2 gap-3 p-4">
            <input
              name="name"
              placeholder="Name"
              required
              defaultValue={location.name}
              className="col-span-2 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg sm:col-span-1"
            />
            <input
              name="address"
              placeholder="Address"
              defaultValue={location.address ?? ""}
              className="col-span-2 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg sm:col-span-1"
            />
            <label className="col-span-2 flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={location.isActive}
                className="rounded border-border-strong accent-accent"
              />
              Active
            </label>
            <Button type="submit" variant="primary" className="col-span-2 sm:col-span-1">
              Save
            </Button>
          </ActionForm>
          <div className="flex justify-end border-t border-border p-4">
            <DeleteButton action={deleteLocationForLocation} label="Delete location" />
          </div>
        </Card>
      )}

      {/* Employees */}
      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">Employees</h2>
        </CardHeader>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Title</th>
              <th className="px-4 py-2.5">Role</th>
            </tr>
          </thead>
          <tbody>
            {location.employees.map((employee) => (
              <tr key={employee.id} className="border-b border-grid last:border-0 hover:bg-surface-2">
                <td className="px-4 py-row-py font-medium text-fg">
                  <Link href={`/admin/users/${employee.id}`} className="hover:text-accent">
                    {employee.name}
                  </Link>
                </td>
                <td className="px-4 py-row-py text-fg-muted">{employee.email}</td>
                <td className="px-4 py-row-py text-fg-muted">{employee.title ?? "—"}</td>
                <td className="px-4 py-row-py text-fg-muted">{employee.role}</td>
              </tr>
            ))}
            {location.employees.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-fg-subtle">
                  No employees assigned to this location yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {canManage && (
          <div className="flex justify-end border-t border-border p-4">
            <Link href="/admin/users/new">
              <Button variant="secondary" size="sm">
                Add employee
              </Button>
            </Link>
          </div>
        )}
      </Card>

      {/* SLA overrides */}
      {canManage && (
      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">SLA overrides</h2>
        </CardHeader>
        <div className="flex flex-col divide-y divide-grid">
          {SLA_PRIORITY_ORDER.map((priority) => {
            const override = locationSlaByPriority.get(priority);
            const hasOverride = Boolean(override?.isActive);
            const globalPolicy = globalSlaByPriority.get(priority);
            const upsertForPriority = upsertLocationSlaPolicy.bind(null, location.id, priority);

            if (hasOverride && override) {
              return (
                <div key={priority} className="p-4">
                  <ActionForm action={upsertForPriority} className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <PriorityBadge priority={priority} />
                      <span className="rounded-full bg-violet-bg px-2 py-0.5 text-[10.5px] font-semibold text-violet">
                        Overridden
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1.5 block text-[11.5px] font-medium text-fg-subtle">
                          Response target (minutes)
                        </span>
                        <input
                          type="number"
                          name="responseTargetMinutes"
                          min={1}
                          required
                          defaultValue={override.responseTargetMinutes}
                          className="w-full rounded-lg border border-border-strong bg-surface px-3 py-[7px] text-[13.5px] text-fg focus:outline-none focus:ring-2 focus:ring-focus"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[11.5px] font-medium text-fg-subtle">
                          Resolution target (minutes)
                        </span>
                        <input
                          type="number"
                          name="resolutionTargetMinutes"
                          min={1}
                          required
                          defaultValue={override.resolutionTargetMinutes}
                          className="w-full rounded-lg border border-border-strong bg-surface px-3 py-[7px] text-[13.5px] text-fg focus:outline-none focus:ring-2 focus:ring-focus"
                        />
                      </label>
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" variant="primary" size="sm">
                        Save
                      </Button>
                    </div>
                  </ActionForm>
                  <form action={deleteLocationSlaPolicy.bind(null, location.id, priority)} className="mt-2 flex justify-end">
                    <Button type="submit" variant="ghost" size="sm">
                      Remove override
                    </Button>
                  </form>
                </div>
              );
            }

            return (
              <div key={priority} className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <PriorityBadge priority={priority} />
                  <span className="text-xs text-fg-subtle">
                    {globalPolicy
                      ? `Using global default (${formatMinutes(globalPolicy.responseTargetMinutes)} response / ${formatMinutes(globalPolicy.resolutionTargetMinutes)} resolution)`
                      : "No global default configured"}
                  </span>
                </div>
                <ActionForm action={upsertForPriority}>
                  <input
                    type="hidden"
                    name="responseTargetMinutes"
                    value={globalPolicy?.responseTargetMinutes ?? 60}
                  />
                  <input
                    type="hidden"
                    name="resolutionTargetMinutes"
                    value={globalPolicy?.resolutionTargetMinutes ?? 480}
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    Override
                  </Button>
                </ActionForm>
              </div>
            );
          })}
        </div>
      </Card>
      )}

      {/* Location page config — personalizes this location's employee-portal
          landing page. See lib/locations.ts for how a location with no
          config of its own inherits up the parent chain. */}
      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">Page config</h2>
          <p className="mt-1 text-[12px] text-fg-muted">
            Banner, floor plan link, and widgets shown to employees at this location. A field left
            unset here is inherited from {location.parent ? location.parent.name : "the org-wide default"}.
          </p>
        </CardHeader>

        {canManage && (
          <div className="border-b border-border p-4">
          <ActionForm
            action={upsertPageConfigForLocation}
            encType="multipart/form-data"
            className="flex flex-col gap-4"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-28 flex-none items-center justify-center overflow-hidden rounded-lg border border-border-strong bg-surface-2">
                {location.pageConfig?.bannerImageMimeType ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/locations/${location.id}/banner?v=${location.pageConfig.updatedAt.getTime()}`}
                    alt="Current banner"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-[11px] text-fg-subtle">No banner</span>
                )}
              </div>
              <div className="flex-1">
                <label className="block">
                  <span className="mb-1.5 block text-[11.5px] font-medium text-fg-subtle">
                    Banner image (PNG, JPEG, or WebP — max {MAX_BANNER_IMAGE_MB}MB)
                  </span>
                  <input
                    type="file"
                    name="bannerImage"
                    accept="image/png,image/jpeg,image/webp"
                    className="block w-full text-[13px] text-fg-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-[6px] file:text-[13px] file:font-semibold file:text-fg hover:file:bg-surface-3"
                  />
                </label>
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[11.5px] font-medium text-fg-subtle">Banner text</span>
              <input
                name="bannerText"
                defaultValue={location.pageConfig?.bannerText ?? ""}
                placeholder="Welcome to the Downtown Branch"
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-[7px] text-[13.5px] text-fg focus:outline-none focus:ring-2 focus:ring-focus"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11.5px] font-medium text-fg-subtle">Floor plan link</span>
              <input
                name="floorPlanUrl"
                type="url"
                defaultValue={location.pageConfig?.floorPlanUrl ?? ""}
                placeholder="https://..."
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-[7px] text-[13.5px] text-fg focus:outline-none focus:ring-2 focus:ring-focus"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11.5px] font-medium text-fg-subtle">
                Widget config (JSON, optional — merges over inherited widgets)
              </span>
              <textarea
                name="widgetConfig"
                rows={4}
                defaultValue={
                  location.pageConfig?.widgetConfig
                    ? JSON.stringify(location.pageConfig.widgetConfig, null, 2)
                    : ""
                }
                placeholder='{"weather": {"enabled": true, "city": "Austin, TX"}}'
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-[7px] font-mono text-[12.5px] text-fg focus:outline-none focus:ring-2 focus:ring-focus"
              />
            </label>

            <div className="flex justify-end">
              <Button type="submit" variant="primary">
                Save
              </Button>
            </div>
          </ActionForm>
          {location.pageConfig?.bannerImageMimeType && (
            <form action={deletePageBannerForLocation} className="mt-2 flex justify-end">
              <Button type="submit" variant="ghost" size="sm">
                Remove banner
              </Button>
            </form>
          )}
          </div>
        )}

        <div className="p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            Effective for employees here
          </h3>
          <dl className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <dt className="text-fg-subtle">Banner image</dt>
              <dd className="text-fg">{resolvedPage.bannerImageUrl ? "Set" : "None"}</dd>
            </div>
            <div>
              <dt className="text-fg-subtle">Banner text</dt>
              <dd className="text-fg">{resolvedPage.bannerText ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-fg-subtle">Floor plan</dt>
              <dd className="text-fg">{resolvedPage.floorPlanUrl ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-fg-subtle">Widgets</dt>
              <dd className="text-fg">
                {Object.keys(resolvedPage.widgetConfig).length > 0
                  ? Object.keys(resolvedPage.widgetConfig).join(", ")
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </Card>

      {/* Assets */}
      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">Assets</h2>
        </CardHeader>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Serial</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {location.assets.map((asset) => (
              <tr key={asset.id} className="border-b border-grid last:border-0 hover:bg-surface-2">
                <td className="px-4 py-row-py font-medium text-fg">
                  <Link href={`/assets/${asset.id}`} className="hover:text-accent">
                    {asset.name}
                  </Link>
                </td>
                <td className="px-4 py-row-py text-fg-muted">{asset.category.name}</td>
                <td className="px-4 py-row-py font-mono text-fg-muted">{asset.serialNumber ?? "—"}</td>
                <td className="px-4 py-row-py text-fg-muted">{asset.isActive ? "Active" : "Inactive"}</td>
              </tr>
            ))}
            {location.assets.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-fg-subtle">
                  No assets on file yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {canManageAssets && (
          <ActionForm
            action={createAssetForLocation}
            className="grid grid-cols-2 gap-3 border-t border-border p-4 sm:grid-cols-4"
          >
            <input
              name="name"
              placeholder="Name (e.g. Front desk PC)"
              required
              className="col-span-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg sm:col-span-2"
            />
            <AssetCategoryFields
              categories={assetCategoryOptions}
              categoryLabel="Type"
              initialCategoryId={assetCategories[0]?.id}
            />
            <input
              name="serialNumber"
              placeholder="Serial number"
              className="col-span-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            />
            <input
              name="notes"
              placeholder="Notes (optional)"
              className="col-span-2 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg sm:col-span-3"
            />
            <Button type="submit" variant="primary" className="col-span-1">
              Add asset
            </Button>
          </ActionForm>
        )}
      </Card>

      {/* Recent Tickets */}
      <Card>
        <CardHeader>
          <h2 className="text-[13.5px] font-semibold text-fg">Recent tickets</h2>
        </CardHeader>
        <ul className="divide-y divide-grid">
          {location.tickets.map((ticket) => (
            <li key={ticket.id} className="flex items-center justify-between px-4 py-row-py text-sm">
              <div>
                <Link href={`/tickets/${ticket.id}`} className="font-medium text-fg hover:text-accent">
                  TKT-{ticket.id}
                </Link>{" "}
                <span className="text-fg-muted">{ticket.title}</span>
                <div className="text-xs text-fg-subtle">
                  {ticket.board.name}
                  {ticket.assignee ? ` · ${ticket.assignee.name}` : ""}
                </div>
              </div>
              <StatusBadge status={ticket.status} />
            </li>
          ))}
          {location.tickets.length === 0 && (
            <li className="px-4 py-8 text-center text-fg-subtle">No tickets yet.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
