/**
 * City configuration.
 *
 * This module is deliberately **import-free** so that the Node-run snapshot
 * generator in `scripts/` can load it directly without resolving the `@/` path
 * alias. Anything needing the projection helpers belongs in `cities.ts`, which
 * re-exports everything here.
 *
 * `center` is the projection origin: all 3D geometry is expressed in metres
 * relative to it (see `src/lib/geo/projection.ts`). `extentM` is the half-width
 * of the square study area, so the loaded area is `2 * extentM` on each side.
 *
 * The 750 m default comes from a measured sample: a 1.11 x 1.11 km box of
 * central Jakarta contains ~4,986 OSM building footprints, so a 1.5 x 1.5 km
 * area is roughly 11,000 footprints — enough for a convincing skyline while
 * staying inside a workable frame budget with merged geometry.
 */

export interface CityConfig {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  /** IANA time zone, used for every timestamp the dashboard displays. */
  readonly timezone: string;
  readonly center: { readonly lat: number; readonly lon: number };
  /** Half-width of the square study area, in metres. */
  readonly extentM: number;
  /** Edge length of a geometry tile, in metres. Drives chunked loading. */
  readonly tileSizeM: number;
}

export const JAKARTA: CityConfig = {
  id: 'jakarta',
  name: 'Jakarta',
  country: 'Indonesia',
  timezone: 'Asia/Jakarta',
  center: { lat: -6.2088, lon: 106.8456 },
  extentM: 750,
  tileSizeM: 500,
};

export const DEFAULT_CITY = JAKARTA;
