import {
  METERS_PER_DEG_LAT,
  metersPerDegreeLon,
} from '@/lib/geo/projection';
import type { CityConfig } from './city-config';

/**
 * City constants for application code.
 *
 * The configuration itself lives in `city-config.ts`, which has no imports so
 * that the snapshot generator can load it under plain Node. This module adds
 * the helpers that depend on the projection maths.
 */

export type { CityConfig } from './city-config';
export { DEFAULT_CITY, JAKARTA } from './city-config';
export {
  METERS_PER_DEG_LAT,
  METERS_PER_DEG_LON_EQUATOR,
} from '@/lib/geo/projection';

export interface GeoBBox {
  readonly minLat: number;
  readonly minLon: number;
  readonly maxLat: number;
  readonly maxLon: number;
}

/**
 * Derive the study-area bounding box from a city's centre and extent.
 *
 * Uses the same equirectangular approximation as the projection: a degree of
 * longitude shortens by cos(latitude), which at Jakarta's 6.2°S is a ~0.6%
 * correction. Over a few kilometres the residual error is well under a metre,
 * far below the positional accuracy of OSM building footprints.
 */
export function cityBBox(city: CityConfig): GeoBBox {
  const latDelta = city.extentM / METERS_PER_DEG_LAT;
  const lonDelta = city.extentM / metersPerDegreeLon(city.center.lat);

  return {
    minLat: city.center.lat - latDelta,
    maxLat: city.center.lat + latDelta,
    minLon: city.center.lon - lonDelta,
    maxLon: city.center.lon + lonDelta,
  };
}

/** Overpass and the OSM API both expect `south,west,north,east`. */
export function bboxToOverpassString(bbox: GeoBBox): string {
  return `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;
}
