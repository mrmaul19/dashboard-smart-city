/**
 * Build-time Transjakarta GTFS snapshot generator.
 *
 * The operator publishes a static GTFS feed as a single ZIP, regenerated
 * frequently (its `Last-Modified` moved within the same day during this
 * project's validation). There is **no official GTFS-Realtime feed**, so this
 * captures the schedule — routes, stops, shapes and headways — and the runtime
 * animates buses along those real shapes at those real headways, labelled
 * SIMULATED.
 *
 * As with the OSM snapshot, the data is fetched once here and committed, so the
 * deployed app never depends on the operator's server being up.
 *
 * Usage:
 *   node scripts/fetch-transit-data.ts
 *   node scripts/fetch-transit-data.ts --dry-run
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CITY } from '../src/lib/constants/city-config.ts';
import { geoToLocal } from '../src/lib/geo/projection.ts';
import { parseGtfsTable } from './lib/csv.ts';
import { readZipEntries, readZipFile } from './lib/zip.ts';
import type {
  RouteFragment,
  TransitManifest,
  TransitRoute,
  TransitStop,
} from '../src/features/transportation/types/transit-data.ts';

const FEED_URL = 'https://gtfs.transjakarta.co.id/files/file_gtfs.zip';

const USER_AGENT =
  'SmartCityDigitalTwin/0.1 (build-time transit snapshot generator)';

/**
 * Margin beyond the study area, in metres. Keeping a little extra means a route
 * entering the scene is already drawn at the edge rather than popping in.
 */
const CLIP_MARGIN_M = 200;

/** Fragments shorter than this are visual noise at city scale. */
const MIN_FRAGMENT_M = 40;

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function quantise(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Normalise a GTFS colour, which is six hex digits with no leading hash. */
function normaliseColour(raw: string | undefined, fallback: string): string {
  const value = (raw ?? '').trim();
  return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value.toLowerCase()}` : fallback;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

interface ClipBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function insideBox(x: number, z: number, box: ClipBox): boolean {
  return x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ;
}

/**
 * Clip a projected polyline to the study area.
 *
 * Runs of consecutive inside points become fragments, each extended by the one
 * point either side so the line reaches the boundary instead of stopping short.
 * A route that leaves and re-enters yields separate fragments rather than one
 * line bridging the gap, which would draw a corridor the bus never uses.
 */
function clipPolyline(
  points: readonly (readonly [number, number])[],
  box: ClipBox,
): RouteFragment[] {
  const fragments: RouteFragment[] = [];
  let current: number[] = [];
  let lastOutside: (readonly [number, number]) | null = null;

  const flush = (): void => {
    if (current.length < 4) {
      current = [];
      return;
    }

    let lengthM = 0;
    for (let i = 0; i + 3 < current.length; i += 2) {
      lengthM += Math.hypot(
        current[i + 2] - current[i],
        current[i + 3] - current[i + 1],
      );
    }

    if (lengthM >= MIN_FRAGMENT_M) {
      fragments.push({ path: current, lengthM: Math.round(lengthM) });
    }
    current = [];
  };

  for (const point of points) {
    const [x, z] = point;

    if (insideBox(x, z, box)) {
      // Reach back to the previous outside point so the fragment starts at the
      // boundary rather than at the first inside vertex.
      if (current.length === 0 && lastOutside) {
        current.push(quantise(lastOutside[0]), quantise(lastOutside[1]));
      }
      current.push(quantise(x), quantise(z));
      lastOutside = null;
    } else {
      if (current.length > 0) {
        current.push(quantise(x), quantise(z));
        flush();
      }
      lastOutside = point;
    }
  }

  flush();
  return fragments;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const city = DEFAULT_CITY;
  const origin = city.center;

  const limit = city.extentM + CLIP_MARGIN_M;
  const box: ClipBox = {
    minX: -limit,
    maxX: limit,
    minZ: -limit,
    maxZ: limit,
  };

  log(`Transit snapshot: ${city.name}`);
  log(`  fetching ${FEED_URL}`);

  const response = await fetch(FEED_URL, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new Error(`Feed request failed with HTTP ${response.status}`);
  }

  const feedLastModified = response.headers.get('last-modified');
  const archive = Buffer.from(await response.arrayBuffer());
  log(`  received ${(archive.length / 1_048_576).toFixed(2)} MB`);

  const entries = readZipEntries(archive);
  const read = (name: string): string => {
    const entry = entries.get(name);
    if (!entry) throw new Error(`Feed is missing ${name}`);
    return readZipFile(archive, entry);
  };

  const agencyRows = parseGtfsTable(read('agency.txt'));
  const routeRows = parseGtfsTable(read('routes.txt'));
  const tripRows = parseGtfsTable(read('trips.txt'));
  const stopRows = parseGtfsTable(read('stops.txt'));
  const shapeRows = parseGtfsTable(read('shapes.txt'));
  const frequencyRows = parseGtfsTable(read('frequencies.txt'));
  const stopTimeRows = parseGtfsTable(read('stop_times.txt'));

  log(
    `  parsed: ${routeRows.length} routes, ${stopRows.length} stops, ` +
      `${tripRows.length} trips, ${shapeRows.length} shape points, ` +
      `${frequencyRows.length} frequency entries`,
  );

  // --- stops, clipped to the study area ------------------------------------
  const stops: TransitStop[] = [];
  const stopById = new Map<string, TransitStop>();

  for (const row of stopRows) {
    const lat = Number.parseFloat(row.stop_lat);
    const lon = Number.parseFloat(row.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const { x, z } = geoToLocal(lat, lon, origin);
    if (!insideBox(x, z, box)) continue;

    const wheelchair = Number.parseInt(row.wheelchair_boarding ?? '', 10);
    const stop: TransitStop = {
      id: row.stop_id,
      name: row.stop_name || row.stop_id,
      position: [quantise(x), quantise(z)],
      latLon: [
        Math.round(lat * 1e6) / 1e6,
        Math.round(lon * 1e6) / 1e6,
      ],
      wheelchairBoarding: Number.isFinite(wheelchair) ? wheelchair : null,
    };

    stops.push(stop);
    stopById.set(stop.id, stop);
  }

  // --- shapes, grouped by id ------------------------------------------------
  const shapePoints = new Map<string, { seq: number; lat: number; lon: number }[]>();

  for (const row of shapeRows) {
    const lat = Number.parseFloat(row.shape_pt_lat);
    const lon = Number.parseFloat(row.shape_pt_lon);
    const seq = Number.parseInt(row.shape_pt_sequence, 10);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(seq)) {
      continue;
    }

    let list = shapePoints.get(row.shape_id);
    if (!list) {
      list = [];
      shapePoints.set(row.shape_id, list);
    }
    list.push({ seq, lat, lon });
  }

  // --- trips: route -> shape, and route -> representative trip -------------
  const shapesByRoute = new Map<string, Set<string>>();
  const routeByTrip = new Map<string, string>();
  const tripByRoute = new Map<string, string>();

  for (const row of tripRows) {
    routeByTrip.set(row.trip_id, row.route_id);
    if (!tripByRoute.has(row.route_id)) tripByRoute.set(row.route_id, row.trip_id);

    if (row.shape_id) {
      let set = shapesByRoute.get(row.route_id);
      if (!set) {
        set = new Set();
        shapesByRoute.set(row.route_id, set);
      }
      set.add(row.shape_id);
    }
  }

  // --- headways from frequencies.txt, grouped by route ---------------------
  const headwaysByRoute = new Map<string, number[]>();

  for (const row of frequencyRows) {
    const routeId = routeByTrip.get(row.trip_id);
    if (!routeId) continue;

    const headway = Number.parseInt(row.headway_secs, 10);
    if (!Number.isFinite(headway) || headway <= 0) continue;

    const list = headwaysByRoute.get(routeId) ?? [];
    list.push(headway);
    headwaysByRoute.set(routeId, list);
  }

  // --- route -> stops, from one representative trip ------------------------
  const stopsByTrip = new Map<string, string[]>();
  const wantedTrips = new Set(tripByRoute.values());

  for (const row of stopTimeRows) {
    if (!wantedTrips.has(row.trip_id)) continue;
    const list = stopsByTrip.get(row.trip_id) ?? [];
    list.push(row.stop_id);
    stopsByTrip.set(row.trip_id, list);
  }

  // --- assemble routes -----------------------------------------------------
  const routes: TransitRoute[] = [];
  let fragmentCount = 0;

  for (const row of routeRows) {
    const routeId = row.route_id;
    const shapeIds = shapesByRoute.get(routeId);
    if (!shapeIds || shapeIds.size === 0) continue;

    // One route has a shape per direction and variant; take the longest, which
    // is the most representative of the corridor.
    let best: (readonly [number, number])[] | null = null;
    for (const shapeId of shapeIds) {
      const points = shapePoints.get(shapeId);
      if (!points) continue;

      const ordered = [...points]
        .sort((a, b) => a.seq - b.seq)
        .map((point) => [point.lat, point.lon] as const);

      if (!best || ordered.length > best.length) best = ordered;
    }
    if (!best) continue;

    const projected = best.map((coordinate) => {
      const { x, z } = geoToLocal(coordinate[0], coordinate[1], origin);
      return [x, z] as const;
    });

    const fragments = clipPolyline(projected, box);
    if (fragments.length === 0) continue;

    const representativeTrip = tripByRoute.get(routeId);
    const routeStopIds = (
      representativeTrip ? stopsByTrip.get(representativeTrip) ?? [] : []
    ).filter((stopId) => stopById.has(stopId));

    const headways = headwaysByRoute.get(routeId) ?? [];

    fragmentCount += fragments.length;
    routes.push({
      id: routeId,
      shortName: row.route_short_name || routeId,
      longName: row.route_long_name || '',
      colour: normaliseColour(row.route_color, '#38bdf8'),
      textColour: normaliseColour(row.route_text_color, '#0b111c'),
      routeType: Number.parseInt(row.route_type, 10) || 3,
      headwaySec: median(headways),
      headwaySamples: headways.length,
      fragments,
      // Deduplicate: a loop route visits some stops twice.
      stopIds: [...new Set(routeStopIds)],
    });
  }

  routes.sort((a, b) => a.shortName.localeCompare(b.shortName, 'en'));

  const agency = agencyRows[0] ?? {};
  const manifest: TransitManifest = {
    city: city.id,
    generatedAt: new Date().toISOString(),
    feedLastModified,
    origin,
    agency: {
      name: agency.agency_name ?? 'PT Transportasi Jakarta',
      url: agency.agency_url ?? 'https://transjakarta.co.id/',
      timezone: agency.agency_timezone ?? city.timezone,
    },
    source: {
      url: FEED_URL,
      licence: 'Published openly by the operator; no explicit licence stated',
      attribution: `Schedule data: ${agency.agency_name ?? 'PT Transportasi Jakarta'}`,
    },
    feedTotals: {
      routes: routeRows.length,
      stops: stopRows.length,
      trips: tripRows.length,
      shapePoints: shapeRows.length,
      frequencies: frequencyRows.length,
    },
    counts: {
      routes: routes.length,
      stops: stops.length,
      fragments: fragmentCount,
    },
  };

  log('Clipped to the study area:');
  log(`  routes     ${routes.length} of ${routeRows.length}`);
  log(`  stops      ${stops.length} of ${stopRows.length}`);
  log(`  fragments  ${fragmentCount}`);
  const withHeadway = routes.filter((route) => route.headwaySec !== null).length;
  log(`  routes with a real headway: ${withHeadway} of ${routes.length}`);

  if (dryRun) {
    log('Dry run: nothing written.');
    return;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(here, '..', 'public', 'data', 'transit', city.id);
  await mkdir(outDir, { recursive: true });

  await writeFile(
    join(outDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  await writeFile(join(outDir, 'routes.json'), JSON.stringify(routes), 'utf8');
  await writeFile(join(outDir, 'stops.json'), JSON.stringify(stops), 'utf8');

  log(`Wrote snapshot to public/data/transit/${city.id}/`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
