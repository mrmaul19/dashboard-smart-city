'use client';

import { useMemo } from 'react';
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  fetchCityManifest,
  fetchCityTile,
  tileDistanceM,
} from '../services/city-snapshot';
import type { CityManifest, CityTile } from '../types/city-data';

/**
 * City snapshot queries.
 *
 * The snapshot is immutable once generated — it only changes when the
 * generator is re-run and the result committed — so it is cached indefinitely
 * (`staleTime: Infinity`). Re-validating it would spend bandwidth to receive
 * byte-identical JSON.
 */

const SNAPSHOT_QUERY_OPTIONS = {
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
} as const;

export function cityManifestKey(cityId: string) {
  return ['city', cityId, 'manifest'] as const;
}

export function cityTileKey(cityId: string, file: string) {
  return ['city', cityId, 'tile', file] as const;
}

export function useCityManifest(cityId: string) {
  return useQuery({
    queryKey: cityManifestKey(cityId),
    queryFn: () => fetchCityManifest(cityId),
    ...SNAPSHOT_QUERY_OPTIONS,
  });
}

interface UseCityTilesOptions {
  /** Load centre in local metres; tiles are fetched nearest-first. */
  focus?: readonly [number, number];
  /** Tiles whose centre is beyond this distance are not requested. */
  radiusM?: number;
}

/**
 * A loaded tile is the snapshot data itself.
 *
 * Deliberately **not** a wrapper object. The renderer memoises merged geometry
 * per tile and the traffic graph per road set, so cloning the data into
 * `{ ...tile, distanceM }` on every render gave every tile a new identity and
 * caused all 23 tiles' geometry to be rebuilt — and the traffic simulation to
 * be reconstructed, resetting every vehicle to a random position — several
 * times a second. That showed up as the whole scene juddering. Per-tile
 * distance is published separately, via `distanceByKey`.
 */
export type LoadedTile = CityTile;

/**
 * Default focus point, defined once at module scope.
 *
 * A `[0, 0]` default written in the parameter list would be a fresh array on
 * every call, invalidating every memo that depends on it on every render.
 */
const DEFAULT_FOCUS: readonly [number, number] = [0, 0];

/**
 * Reduce the per-tile query results to the loaded tiles.
 *
 * Defined at module scope so the function identity is stable, and it pushes
 * `result.data` straight through without copying. Both matter: TanStack applies
 * structural sharing to a combined result, and because each element is the
 * identical reference as last render, that comparison short-circuits per
 * element and hands back the *previous array* whenever membership is
 * unchanged. That is what keeps the scene's memos intact between renders.
 */
function combineTiles(results: UseQueryResult<CityTile, Error>[]): {
  tiles: CityTile[];
  errors: Error[];
} {
  const tiles: CityTile[] = [];
  const errors: Error[] = [];

  for (const result of results) {
    if (result.data) tiles.push(result.data);
    if (result.error instanceof Error) errors.push(result.error);
  }

  return { tiles, errors };
}

/**
 * Load the tiles near a focus point.
 *
 * Area-based loading (spec §5): the manifest lists every tile with its centre,
 * so the renderer decides what to request without a server round-trip. Tiles
 * are independent queries, which means a single failed tile degrades that part
 * of the city instead of the whole scene.
 */
export function useCityTiles(
  cityId: string,
  manifest: CityManifest | undefined,
  { focus = DEFAULT_FOCUS, radiusM = 1_600 }: UseCityTilesOptions = {},
) {
  // Sorting nearest-first makes the city fill in from the camera outward.
  const wanted = useMemo(() => {
    if (!manifest) return [];
    return manifest.tiles
      .map((tile) => ({
        ...tile,
        distanceM: tileDistanceM(tile.centre, focus),
      }))
      .filter((tile) => tile.distanceM <= radiusM)
      .sort((a, b) => a.distanceM - b.distanceM);
  }, [manifest, focus, radiusM]);

  const { tiles, errors } = useQueries({
    queries: wanted.map((tile) => ({
      queryKey: cityTileKey(cityId, tile.file),
      queryFn: () => fetchCityTile(cityId, tile.file),
      ...SNAPSHOT_QUERY_OPTIONS,
    })),
    combine: combineTiles,
  });

  /** Distance from the focus point per tile key, for distance-based detail. */
  const distanceByKey = useMemo(
    () => new Map(wanted.map((tile) => [tile.key, tile.distanceM])),
    [wanted],
  );

  const loadedCount = tiles.length;
  const totalCount = wanted.length;

  return {
    tiles,
    distanceByKey,
    loadedCount,
    totalCount,
    isLoading: totalCount > 0 && loadedCount === 0,
    isComplete: totalCount > 0 && loadedCount === totalCount,
    errors,
  };
}
