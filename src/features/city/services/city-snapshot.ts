import type { CityManifest, CityTile } from '../types/city-data';

/**
 * Snapshot access.
 *
 * The snapshot is committed static JSON under `public/data/city/<id>/`, so
 * these are plain static-asset fetches: no API route, no server work, and the
 * CDN caches them. Overpass is never contacted at request time — see
 * `scripts/fetch-city-data.ts` for why.
 */

const SNAPSHOT_BASE = '/data/city';

/** Error carrying the HTTP status, so query retry logic can skip 4xx. */
export class SnapshotFetchError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SnapshotFetchError';
    this.status = status;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url);
  } catch (cause) {
    // Network-level failure: no status is available.
    throw new SnapshotFetchError(
      `Could not reach ${url}: ${cause instanceof Error ? cause.message : 'network error'}`,
      0,
    );
  }

  if (!response.ok) {
    throw new SnapshotFetchError(
      `Request for ${url} failed with ${response.status}`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

export function cityManifestUrl(cityId: string): string {
  return `${SNAPSHOT_BASE}/${cityId}/manifest.json`;
}

export function fetchCityManifest(cityId: string): Promise<CityManifest> {
  return fetchJson<CityManifest>(cityManifestUrl(cityId));
}

export function fetchCityTile(cityId: string, file: string): Promise<CityTile> {
  return fetchJson<CityTile>(`${SNAPSHOT_BASE}/${cityId}/${file}`);
}

/**
 * Distance from a point to a tile's centre, in metres.
 *
 * Used for area-based loading: tiles are fetched nearest-first and anything
 * beyond the load radius is never requested. With a 1.5 km study area every
 * tile is close enough to load, but the mechanism is what lets the area grow
 * without changing the renderer.
 */
export function tileDistanceM(
  centre: readonly [number, number],
  from: readonly [number, number],
): number {
  return Math.hypot(centre[0] - from[0], centre[1] - from[1]);
}
