import type { LocationPageConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export type ResolvedLocationPage = {
  bannerImageUrl: string | null;
  bannerText: string | null;
  floorPlanUrl: string | null;
  widgetConfig: Record<string, unknown>;
};

type PageConfigRow = Pick<LocationPageConfig, "bannerImageUrl" | "bannerText" | "floorPlanUrl" | "widgetConfig">;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolves the effective location-page config for a single location.
 * See `loadLocationPageResolver` for the batched variant and the resolution
 * rules — this just wraps it for a one-off single-location lookup.
 */
export async function resolveLocationPage(locationId: string): Promise<ResolvedLocationPage> {
  const resolver = await loadLocationPageResolver([locationId]);
  return resolver(locationId);
}

/**
 * Batched resolver for pages that resolve location-page config for many
 * locations at once (e.g. a dashboard rendering widgets for several
 * employees' locations) — same override-then-fallback batching shape as
 * lib/sla.ts's loadSlaPolicyResolver(), per ARCHITECTURE.md section B.
 *
 * Each field (banner image, banner text, floor plan link) independently
 * walks Location.parentId up toward CORPORATE_HQ, taking the first non-null
 * value found at any level — a Branch missing only a floor plan link still
 * gets its own banner rather than inheriting its Regional Hub's whole
 * config. widgetConfig is layered rather than taken whole:
 * Setting.globalWidgetDefaults is the base layer, then each ancestor's
 * widgetConfig overrides matching keys moving from CORPORATE_HQ down to the
 * target location, so a location can override a single widget without
 * losing the rest of what it inherited.
 *
 * Locations and their page configs are both bounded by the size of the
 * org's location tree (not ticket/attachment volume), so it's simplest —
 * and still free of N+1 regardless of how many locations get resolved on
 * one page — to load all of both up front rather than walk each requested
 * location's ancestor chain with its own round trip.
 */
export async function loadLocationPageResolver(
  locationIds: string[]
): Promise<(locationId: string) => ResolvedLocationPage> {
  const [locations, configs, settings] = await Promise.all([
    prisma.location.findMany({ select: { id: true, parentId: true } }),
    prisma.locationPageConfig.findMany(),
    getSettings(),
  ]);

  const parentById = new Map(locations.map((l) => [l.id, l.parentId]));
  const configById = new Map(configs.map((c) => [c.locationId, c]));
  const globalWidgetDefaults = isPlainObject(settings.globalWidgetDefaults) ? settings.globalWidgetDefaults : {};

  // Nearest (the location itself) first, furthest ancestor last. Guards
  // against a corrupt cyclical parentId chain with `seen` rather than
  // trusting the data is a tree, since a cycle here would otherwise hang.
  function chainFor(locationId: string): PageConfigRow[] {
    const chain: PageConfigRow[] = [];
    let currentId: string | null | undefined = locationId;
    const seen = new Set<string>();
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const config = configById.get(currentId);
      if (config) chain.push(config);
      currentId = parentById.get(currentId);
    }
    return chain;
  }

  const cache = new Map<string, ResolvedLocationPage>();

  return (locationId: string): ResolvedLocationPage => {
    const cached = cache.get(locationId);
    if (cached) return cached;

    const chain = chainFor(locationId);

    const bannerImageUrl = chain.find((c) => c.bannerImageUrl)?.bannerImageUrl ?? null;
    const bannerText = chain.find((c) => c.bannerText)?.bannerText ?? null;
    const floorPlanUrl = chain.find((c) => c.floorPlanUrl)?.floorPlanUrl ?? null;

    // Layer widgetConfig from the furthest ancestor down to the target
    // location (reverse of `chain`'s nearest-first order) so the most
    // specific location's keys win, with the global default as the base.
    let widgetConfig: Record<string, unknown> = { ...globalWidgetDefaults };
    for (const config of [...chain].reverse()) {
      if (isPlainObject(config.widgetConfig)) {
        widgetConfig = { ...widgetConfig, ...config.widgetConfig };
      }
    }

    const resolved: ResolvedLocationPage = { bannerImageUrl, bannerText, floorPlanUrl, widgetConfig };
    cache.set(locationId, resolved);
    return resolved;
  };
}
