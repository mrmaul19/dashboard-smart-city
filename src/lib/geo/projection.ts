/**
 * Geographic → local 3D coordinate conversion.
 *
 * The scene works in metres on a flat plane, with the city's configured centre
 * at the origin. Converting with a full map projection library would be
 * overkill: over a study area of a few kilometres an **equirectangular
 * approximation** about the origin latitude is accurate to well under a metre,
 * which is far below the positional accuracy of OSM building footprints.
 *
 *   x = (lon - lon0) · metresPerDegreeLon(lat0)
 *   z = -(lat - lat0) · METERS_PER_DEG_LAT
 *
 * The negation of z matters: in three.js the camera looks down -Z by default
 * and +Z points toward the viewer, so north must map to -Z for the city to be
 * oriented the way a map reader expects (north away from the camera).
 *
 * Both the build-time snapshot generator and the runtime renderer use these
 * functions, so geometry and interaction share one definition of "where".
 */

/** Metres per degree of latitude (WGS-84 mean). */
export const METERS_PER_DEG_LAT = 110_540;
/** Metres per degree of longitude at the equator (WGS-84 mean). */
export const METERS_PER_DEG_LON_EQUATOR = 111_320;

export interface GeoOrigin {
  readonly lat: number;
  readonly lon: number;
}

/** Local scene coordinates, in metres. `y` is up and is not set by projection. */
export interface LocalPoint {
  readonly x: number;
  readonly z: number;
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * Length of one degree of longitude at a given latitude, in metres.
 * Longitude lines converge toward the poles by a factor of cos(latitude).
 */
export function metersPerDegreeLon(latitude: number): number {
  return METERS_PER_DEG_LON_EQUATOR * Math.cos(latitude * DEG_TO_RAD);
}

/** Project a geographic coordinate into local scene metres. */
export function geoToLocal(
  lat: number,
  lon: number,
  origin: GeoOrigin,
): LocalPoint {
  return {
    x: (lon - origin.lon) * metersPerDegreeLon(origin.lat),
    z: -(lat - origin.lat) * METERS_PER_DEG_LAT,
  };
}

/**
 * Inverse projection, used to report a clicked feature's real-world
 * coordinates back to the user.
 */
export function localToGeo(
  x: number,
  z: number,
  origin: GeoOrigin,
): { lat: number; lon: number } {
  return {
    lat: origin.lat - z / METERS_PER_DEG_LAT,
    lon: origin.lon + x / metersPerDegreeLon(origin.lat),
  };
}

/**
 * Planar area of a closed ring given as flat `[x, z, x, z, …]` metres, via the
 * shoelace formula. Used by the height heuristic, so it must be cheap: this
 * runs once per footprint over thousands of footprints.
 */
export function ringAreaM2(ring: readonly number[]): number {
  const n = ring.length / 2;
  if (n < 3) return 0;

  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    sum += ring[i * 2] * ring[j * 2 + 1] - ring[j * 2] * ring[i * 2 + 1];
  }
  return Math.abs(sum) / 2;
}

/** Centroid of a flat `[x, z, …]` ring, falling back to the mean of vertices. */
export function ringCentroid(ring: readonly number[]): LocalPoint {
  const n = ring.length / 2;
  if (n === 0) return { x: 0, z: 0 };

  let twiceArea = 0;
  let cx = 0;
  let cz = 0;

  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const xi = ring[i * 2];
    const zi = ring[i * 2 + 1];
    const xj = ring[j * 2];
    const zj = ring[j * 2 + 1];
    const cross = xi * zj - xj * zi;
    twiceArea += cross;
    cx += (xi + xj) * cross;
    cz += (zi + zj) * cross;
  }

  // Degenerate ring (zero area, e.g. collinear points): use the vertex mean.
  if (Math.abs(twiceArea) < 1e-9) {
    let sx = 0;
    let sz = 0;
    for (let i = 0; i < n; i += 1) {
      sx += ring[i * 2];
      sz += ring[i * 2 + 1];
    }
    return { x: sx / n, z: sz / n };
  }

  return { x: cx / (3 * twiceArea), z: cz / (3 * twiceArea) };
}
