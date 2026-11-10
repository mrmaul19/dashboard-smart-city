import type { BuildingCategory, HeightSource } from '../types/city-data';

/**
 * Building height derivation.
 *
 * A measured sample of central Jakarta found `building:levels` on 1.4% of
 * footprints and `height` on 0.04% (see `docs/api-validation.md`). Rendering
 * only tagged buildings would leave a near-empty city, so untagged footprints
 * get a heuristic height — and every such value is classified `DERIVED` and
 * surfaced to the user as an estimate. It is never presented as a measurement.
 *
 * This module has **type-only imports** so the Node-run snapshot generator can
 * import it directly.
 */

/** Typical floor-to-floor height, including slab, for Indonesian construction. */
const METRES_PER_LEVEL = 3.2;

/** Nothing renders shorter than this, to avoid degenerate extrusions. */
const MIN_HEIGHT_M = 3;

/** Guard against vandalised or mis-keyed tags producing absurd towers. */
const MAX_PLAUSIBLE_HEIGHT_M = 700;

export interface DerivedHeight {
  readonly heightM: number;
  readonly heightSource: HeightSource;
}

/**
 * Parse an OSM height tag. Values are metres by default but are often written
 * with a unit, and occasionally in feet (`height=32'` or `height=32 ft`).
 */
function parseOsmHeight(raw: string | undefined): number | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  const match = /^(-?\d+(?:[.,]\d+)?)\s*(m|metre|meters?|ft|'|")?$/i.exec(trimmed);
  if (!match) return null;

  const value = Number.parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = match[2]?.toLowerCase();
  const metres = unit === 'ft' || unit === "'" || unit === '"' ? value * 0.3048 : value;

  return metres > MAX_PLAUSIBLE_HEIGHT_M ? null : metres;
}

function parseLevels(raw: string | undefined): number | null {
  if (!raw) return null;

  // Some footprints carry ranges or lists such as "2;3" or "2-3": take the first.
  const first = raw.split(/[;,-]/)[0]?.trim();
  const value = Number.parseFloat(first ?? '');

  if (!Number.isFinite(value) || value <= 0 || value > 180) return null;
  return value;
}

/**
 * Deterministic 0..1 value from a building id.
 *
 * A uniform heuristic height makes a city of identical slabs, so heights are
 * varied by ±15%. The variation must be *stable* — a hash of the id rather
 * than `Math.random()` — so that a building does not change height between
 * renders, between tiles, or between snapshot regenerations.
 */
function stableJitter(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

/** Baseline height per category, before footprint size and jitter are applied. */
function baselineHeight(category: BuildingCategory, areaM2: number): number {
  switch (category) {
    case 'office':
      // A large office footprint in a CBD is usually a tower; a small one is
      // more often a converted shophouse.
      return areaM2 > 1200 ? 42 : areaM2 > 400 ? 22 : 11;
    case 'commercial':
      // Large retail footprints are malls: wide but comparatively low.
      return areaM2 > 4000 ? 20 : areaM2 > 800 ? 14 : 9;
    case 'industrial':
      return areaM2 > 2000 ? 11 : 8;
    case 'public':
      return areaM2 > 2000 ? 16 : 10;
    case 'residential':
      // Dense low-rise kampung housing dominates by count in Jakarta.
      return areaM2 > 600 ? 12 : areaM2 > 150 ? 7 : 5;
    case 'other':
    default:
      // This branch decides how most of the city looks. A measured sample of
      // the study area found 98.2% of footprints tagged only `building=yes`
      // (7,968 of 8,119), which carries no functional information, so nearly
      // everything lands here. Keying off footprint area is what keeps the
      // skyline varied and plausible: the median footprint is 55 m² — a
      // kampung house — while the largest exceeds 10,000 m² and is certainly
      // not two storeys.
      if (areaM2 < 60) return 5;
      if (areaM2 < 150) return 6.5;
      if (areaM2 < 400) return 8.5;
      if (areaM2 < 1200) return 12;
      if (areaM2 < 4000) return 17;
      return 23;
  }
}

/**
 * Resolve a building's height, preferring real tags over the heuristic.
 *
 * Precedence: `height` → `building:levels` × floor height → category heuristic.
 */
export function deriveBuildingHeight(
  id: string,
  tags: Readonly<Record<string, string>>,
  category: BuildingCategory,
  areaM2: number,
): DerivedHeight {
  const tagged = parseOsmHeight(tags.height);
  if (tagged !== null) {
    return {
      heightM: Math.max(MIN_HEIGHT_M, Math.round(tagged * 10) / 10),
      heightSource: 'OSM_HEIGHT',
    };
  }

  const levels = parseLevels(tags['building:levels']);
  if (levels !== null) {
    // Roof levels are a separate tag; include them when present, since they
    // contribute real height to the silhouette.
    const roofLevels = parseLevels(tags['roof:levels']) ?? 0;
    const metres = (levels + roofLevels) * METRES_PER_LEVEL;
    return {
      heightM: Math.max(MIN_HEIGHT_M, Math.round(metres * 10) / 10),
      heightSource: 'OSM_LEVELS',
    };
  }

  const baseline = baselineHeight(category, areaM2);
  const variation = 0.85 + stableJitter(id) * 0.3;

  return {
    heightM: Math.max(MIN_HEIGHT_M, Math.round(baseline * variation * 10) / 10),
    heightSource: 'DERIVED',
  };
}
