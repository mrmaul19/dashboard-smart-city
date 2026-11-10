'use client';

import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
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

export interface LoadedTile extends CityTile {
  readonly distanceM: number;
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
  { focus = [0, 0], radiusM = 1_600 }: UseCityTilesOptions = {},
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

  const queries = useQueries({
    queries: wanted.map((tile) => ({
      queryKey: cityTileKey(cityId, tile.file),
      queryFn: () => fetchCityTile(cityId, tile.file),
      ...SNAPSHOT_QUERY_OPTIONS,
    })),
  });

  const tiles = useMemo(() => {
    const loaded: LoadedTile[] = [];
    queries.forEach((query, index) => {
      if (query.data) {
        loaded.push({ ...query.data, distanceM: wanted[index].distanceM });
      }
    });
    return loaded;
  }, [queries, wanted]);

  const loadedCount = tiles.length;
  const totalCount = wanted.length;

  return {
    tiles,
    loadedCount,
    totalCount,
    isLoading: totalCount > 0 && loadedCount === 0,
    isComplete: totalCount > 0 && loadedCount === totalCount,
    errors: queries
      .map((query) => query.error)
      .filter((error): error is Error => error instanceof Error),
  };
}
