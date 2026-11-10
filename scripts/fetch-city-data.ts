/**
 * Build-time OpenStreetMap snapshot generator.
 *
 * Why a snapshot instead of fetching at request time:
 *
 * Overpass's public instances are a shared, rate-limited resource — the policy
 * is 10,000 queries *and* under 1 GB *and* under 10 minutes of processing per
 * day, for roughly 30,000 daily users — and they were unreachable entirely
 * during this project's validation pass. A deployed dashboard that queried
 * Overpass on every visit would be both fragile and impolite. So geometry is
 * fetched once here, trimmed, pre-projected into local metres, split into
 * tiles, and committed. The runtime then reads static JSON.
 *
 * Usage:
 *   node scripts/fetch-city-data.ts                 # auto: Overpass, else OSM API
 *   node scripts/fetch-city-data.ts --adapter osm   # force the OSM /map API
 *   node scripts/fetch-city-data.ts --dry-run       # fetch and report, write nothing
 *
 * Attribution: the output carries ODbL 1.0 and "© OpenStreetMap contributors",
 * which the UI is obliged to display.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_CITY,
  type CityConfig,
} from '../src/lib/constants/city-config.ts';
import {
  METERS_PER_DEG_LAT,
  geoToLocal,
  localToGeo,
  metersPerDegreeLon,
  ringAreaM2,
  ringCentroid,
} from '../src/lib/geo/projection.ts';
import { deriveBuildingHeight } from '../src/features/city/utils/building-height.ts';
import {
  classifyBuilding,
  classifyFacility,
  classifyGreen,
  classifyRoad,
  isOneway,
  parseLanes,
  pickTags,
  roadWidthM,
} from '../src/features/city/utils/osm-classify.ts';
import type {
  CityManifest,
  CityTileRef,
  SnapshotBuilding,
  SnapshotFacility,
  SnapshotGreenArea,
  SnapshotRoad,
} from '../src/features/city/types/city-data.ts';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Overpass instances, tried in order. The main instance is first; the others
 * are community mirrors listed on the OSM wiki. A distinctive User-Agent is
 * required by the usage policy so that instance operators can identify traffic.
 */
const OVERPASS_ENDPOINTS: readonly string[] = (
  process.env.OVERPASS_ENDPOINTS ??
  [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ].join(',')
).split(',');

const OSM_MAP_API = 'https://api.openstreetmap.org/api/0.6/map';

const USER_AGENT =
  'SmartCityDigitalTwin/0.1 (build-time snapshot generator; https://github.com)';

/** The OSM /map API refuses a bbox containing more than 50,000 nodes. */
const OSM_NODE_LIMIT = 50_000;

/** Pause between sequential upstream requests, to stay a polite client. */
const REQUEST_SPACING_MS = 1_500;

/** Overpass asks clients to wait 30 s after a 429 before retrying. */
const RATE_LIMIT_BACKOFF_MS = 30_000;

/** Ring simplification tolerance, in metres. */
const SIMPLIFY_BUILDING_M = 0.4;
const SIMPLIFY_ROAD_M = 1;

/** Footprints below this are noise at city scale (bins, kiosks, sheds). */
const MIN_BUILDING_AREA_M2 = 12;

// ---------------------------------------------------------------------------
// Raw OSM model
// ---------------------------------------------------------------------------

interface RawWay {
  readonly id: number;
  /** Way geometry as `[lat, lon]` pairs, in order. */
  readonly coords: readonly (readonly [number, number])[];
  readonly tags: Record<string, string>;
}

interface RawNode {
  readonly id: number;
  readonly lat: number;
  readonly lon: number;
  readonly tags: Record<string, string>;
}

interface RawData {
  readonly ways: RawWay[];
  /** Only nodes that carry tags; untagged nodes are geometry, not features. */
  readonly taggedNodes: RawNode[];
  /** Relations are counted but not assembled — see `assembleRelations` note. */
  readonly relationCount: number;
}

interface AdapterResult extends RawData {
  readonly adapter: 'overpass' | 'osm-map-api';
  readonly endpoint: string;
  readonly requestCount: number;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

interface BBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

function studyBBox(city: CityConfig): BBox {
  const latDelta = city.extentM / METERS_PER_DEG_LAT;
  const lonDelta = city.extentM / metersPerDegreeLon(city.center.lat);
  return {
    minLat: city.center.lat - latDelta,
    maxLat: city.center.lat + latDelta,
    minLon: city.center.lon - lonDelta,
    maxLon: city.center.lon + lonDelta,
  };
}

/** Round to 0.1 m. Sub-decimetre precision is meaningless for OSM footprints. */
function quantise(value: number): number {
  return Math.round(value * 10) / 10;
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

// ---------------------------------------------------------------------------
// OSM XML parsing
//
// The OSM /map API returns XML. A dependency-free parser is used because the
// subset involved is tiny and extremely regular: this reads only `node`, `way`,
// `nd` and `tag` elements and ignores everything else. Attribute values are
// always double-quoted and XML-escaped, which is the one subtlety handled here.
// ---------------------------------------------------------------------------

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decodeEntities(value: string): string {
  if (!value.includes('&')) return value;
  return value
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (match) => ENTITIES[match] ?? match)
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

const ATTR_RE = /([\w:.-]+)="([^"]*)"/g;

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(raw)) !== null) {
    attrs[match[1]] = decodeEntities(match[2]);
  }
  return attrs;
}

const ELEMENT_RE = /<(\/?)(node|way|relation|nd|tag)\b([^>]*?)(\/?)>/g;

function parseOsmXml(xml: string): RawData {
  const nodeCoords = new Map<number, readonly [number, number]>();
  const taggedNodes: RawNode[] = [];
  const ways: RawWay[] = [];
  let relationCount = 0;

  // The element currently being filled, so that child `<tag>` and `<nd>`
  // elements attach to the right parent.
  let openNode: { id: number; lat: number; lon: number; tags: Record<string, string> } | null = null;
  let openWay: { id: number; refs: number[]; tags: Record<string, string> } | null = null;
  let inRelation = false;

  ELEMENT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ELEMENT_RE.exec(xml)) !== null) {
    const isClosing = match[1] === '/';
    const name = match[2];
    const attrsRaw = match[3];
    const selfClosing = match[4] === '/';

    if (name === 'node') {
      if (isClosing) {
        if (openNode && Object.keys(openNode.tags).length > 0) {
          taggedNodes.push(openNode);
        }
        openNode = null;
        continue;
      }

      const attrs = parseAttributes(attrsRaw);
      const id = Number.parseInt(attrs.id ?? '', 10);
      const lat = Number.parseFloat(attrs.lat ?? '');
      const lon = Number.parseFloat(attrs.lon ?? '');
      if (!Number.isFinite(id) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }

      nodeCoords.set(id, [lat, lon]);
      // A self-closing node has no tags, so it is pure geometry.
      openNode = selfClosing ? null : { id, lat, lon, tags: {} };
      continue;
    }

    if (name === 'way') {
      if (isClosing) {
        if (openWay) {
          const coords: (readonly [number, number])[] = [];
          for (const ref of openWay.refs) {
            const coord = nodeCoords.get(ref);
            // A missing ref means the way extends beyond what was returned.
            // Skipping the vertex keeps the rest of the geometry usable.
            if (coord) coords.push(coord);
          }
          if (coords.length >= 2) {
            ways.push({ id: openWay.id, coords, tags: openWay.tags });
          }
        }
        openWay = null;
        continue;
      }

      const attrs = parseAttributes(attrsRaw);
      const id = Number.parseInt(attrs.id ?? '', 10);
      openWay = Number.isFinite(id) ? { id, refs: [], tags: {} } : null;
      continue;
    }

    if (name === 'relation') {
      if (isClosing) {
        inRelation = false;
      } else {
        inRelation = true;
        relationCount += 1;
      }
      continue;
    }

    if (name === 'nd' && openWay) {
      const ref = Number.parseInt(parseAttributes(attrsRaw).ref ?? '', 10);
      if (Number.isFinite(ref)) openWay.refs.push(ref);
      continue;
    }

    if (name === 'tag' && !inRelation) {
      const attrs = parseAttributes(attrsRaw);
      const key = attrs.k;
      const value = attrs.v;
      if (key === undefined || value === undefined) continue;
      if (openWay) openWay.tags[key] = value;
      else if (openNode) openNode.tags[key] = value;
    }
  }

  return { ways, taggedNodes, relationCount };
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

interface FetchTextResult {
  ok: boolean;
  status: number;
  body: string;
}

async function fetchText(
  url: string,
  init: RequestInit & { timeoutMs: number },
): Promise<FetchTextResult> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(init.timeoutMs),
    });
    const body = await response.text();
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 0, body: reason };
  }
}

/**
 * Overpass adapter.
 *
 * `out tags geom` returns way geometry inline, so no separate node resolution
 * pass is needed. One query covers the whole study area, which is well within
 * the default 180 s / 512 MiB server limits for an area this size.
 */
async function fetchViaOverpass(bbox: BBox): Promise<AdapterResult | null> {
  const bboxStr = `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;
  const query = [
    '[out:json][timeout:120];',
    '(',
    `  way["building"](${bboxStr});`,
    `  way["highway"](${bboxStr});`,
    `  way["leisure"](${bboxStr});`,
    `  way["landuse"](${bboxStr});`,
    `  way["natural"](${bboxStr});`,
    // Way-based facilities that are not buildings: school grounds, markets,
    // bus stations. A measured count found 13 of these in the study area that
    // the building and node queries alone would miss.
    `  way["amenity"](${bboxStr});`,
    `  node["amenity"](${bboxStr});`,
    `  node["public_transport"](${bboxStr});`,
    `  node["highway"="bus_stop"](${bboxStr});`,
    ');',
    'out tags geom;',
  ].join('\n');

  for (const endpoint of OVERPASS_ENDPOINTS) {
    log(`  overpass: trying ${endpoint}`);
    let attempt = 0;

    while (attempt < 2) {
      const result = await fetchText(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ data: query }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeoutMs: 180_000,
      });

      if (result.ok) {
        const parsed = JSON.parse(result.body) as {
          elements?: {
            type: string;
            id: number;
            lat?: number;
            lon?: number;
            tags?: Record<string, string>;
            geometry?: { lat: number; lon: number }[];
          }[];
        };

        const ways: RawWay[] = [];
        const taggedNodes: RawNode[] = [];
        let relationCount = 0;

        for (const element of parsed.elements ?? []) {
          if (element.type === 'way' && element.geometry) {
            const coords = element.geometry.map(
              (point) => [point.lat, point.lon] as const,
            );
            if (coords.length >= 2) {
              ways.push({ id: element.id, coords, tags: element.tags ?? {} });
            }
          } else if (
            element.type === 'node' &&
            element.lat !== undefined &&
            element.lon !== undefined &&
            element.tags
          ) {
            taggedNodes.push({
              id: element.id,
              lat: element.lat,
              lon: element.lon,
              tags: element.tags,
            });
          } else if (element.type === 'relation') {
            relationCount += 1;
          }
        }

        return {
          adapter: 'overpass',
          endpoint,
          requestCount: 1,
          ways,
          taggedNodes,
          relationCount,
        };
      }

      // 429 (rate limited) and 504 (resource exhausted) are the documented
      // throttling responses; the policy asks for a 30 s pause before retrying.
      if (result.status === 429 || result.status === 504) {
        log(`  overpass: ${result.status}, waiting ${RATE_LIMIT_BACKOFF_MS / 1000}s`);
        await sleep(RATE_LIMIT_BACKOFF_MS);
        attempt += 1;
        continue;
      }

      log(`  overpass: failed (${result.status || 'no connection'}) — ${result.body.slice(0, 120)}`);
      break;
    }
  }

  return null;
}

/**
 * OSM main API fallback.
 *
 * The `/map` endpoint is officially **not** intended for bulk data download;
 * it is used here only as a development fallback for one small study area while
 * Overpass is unreachable, and it refuses any bbox holding more than 50,000
 * nodes. The area is therefore split into a grid of sub-requests, each well
 * under that cap, issued sequentially with spacing between them.
 *
 * Because the API returns every way referencing a node inside the bbox *plus*
 * all of those ways' remaining nodes, each sub-request yields complete
 * geometry, and features straddling a sub-request boundary simply arrive twice
 * and are de-duplicated by id.
 */
async function fetchViaOsmMapApi(
  bbox: BBox,
  divisions: number,
): Promise<AdapterResult | null> {
  const ways = new Map<number, RawWay>();
  const taggedNodes = new Map<number, RawNode>();
  let relationCount = 0;
  let requestCount = 0;

  const latStep = (bbox.maxLat - bbox.minLat) / divisions;
  const lonStep = (bbox.maxLon - bbox.minLon) / divisions;

  for (let row = 0; row < divisions; row += 1) {
    for (let col = 0; col < divisions; col += 1) {
      const sub: BBox = {
        minLat: bbox.minLat + row * latStep,
        maxLat: bbox.minLat + (row + 1) * latStep,
        minLon: bbox.minLon + col * lonStep,
        maxLon: bbox.minLon + (col + 1) * lonStep,
      };

      // The /map API takes bbox as left,bottom,right,top (lon/lat order).
      const url = `${OSM_MAP_API}?bbox=${sub.minLon},${sub.minLat},${sub.maxLon},${sub.maxLat}`;

      if (requestCount > 0) await sleep(REQUEST_SPACING_MS);
      const result = await fetchText(url, { timeoutMs: 120_000 });
      requestCount += 1;

      if (!result.ok) {
        if (result.status === 400 && result.body.includes('nodes')) {
          log(`  osm-api: sub-request ${row}/${col} exceeded the ${OSM_NODE_LIMIT} node limit`);
        }
        log(`  osm-api: sub-request ${row}/${col} failed (${result.status || 'no connection'})`);
        return null;
      }

      const parsed = parseOsmXml(result.body);
      for (const way of parsed.ways) if (!ways.has(way.id)) ways.set(way.id, way);
      for (const node of parsed.taggedNodes) {
        if (!taggedNodes.has(node.id)) taggedNodes.set(node.id, node);
      }
      relationCount += parsed.relationCount;

      log(
        `  osm-api: tile ${row}/${col} → ${parsed.ways.length} ways, ` +
          `${parsed.taggedNodes.length} tagged nodes (${(result.body.length / 1_048_576).toFixed(1)} MB)`,
      );
    }
  }

  return {
    adapter: 'osm-map-api',
    endpoint: OSM_MAP_API,
    requestCount,
    ways: [...ways.values()],
    taggedNodes: [...taggedNodes.values()],
    relationCount,
  };
}

// ---------------------------------------------------------------------------
// Geometry processing
// ---------------------------------------------------------------------------

/**
 * Ramer–Douglas–Peucker simplification on a flat `[x, z, …]` polyline.
 *
 * OSM footprints frequently carry vertices a few centimetres apart, which cost
 * memory and triangles while being invisible at city scale. Simplifying at
 * decimetre tolerance typically removes a third of the vertices with no
 * perceptible change to the silhouette.
 */
function simplify(flat: readonly number[], toleranceM: number): number[] {
  const count = flat.length / 2;
  if (count < 3) return [...flat];

  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;

  const stack: [number, number][] = [[0, count - 1]];
  const toleranceSq = toleranceM * toleranceM;

  while (stack.length > 0) {
    const segment = stack.pop();
    if (!segment) break;
    const [first, last] = segment;
    if (last - first < 2) continue;

    const ax = flat[first * 2];
    const az = flat[first * 2 + 1];
    const bx = flat[last * 2];
    const bz = flat[last * 2 + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSq = dx * dx + dz * dz;

    let worstIndex = -1;
    let worstDistSq = -1;

    for (let i = first + 1; i < last; i += 1) {
      const px = flat[i * 2];
      const pz = flat[i * 2 + 1];

      let distSq: number;
      if (lengthSq === 0) {
        distSq = (px - ax) ** 2 + (pz - az) ** 2;
      } else {
        // Projection parameter of p onto the segment, clamped to its ends.
        const t = Math.max(
          0,
          Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq),
        );
        const cx = ax + t * dx;
        const cz = az + t * dz;
        distSq = (px - cx) ** 2 + (pz - cz) ** 2;
      }

      if (distSq > worstDistSq) {
        worstDistSq = distSq;
        worstIndex = i;
      }
    }

    if (worstIndex >= 0 && worstDistSq > toleranceSq) {
      keep[worstIndex] = 1;
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }

  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (keep[i]) out.push(flat[i * 2], flat[i * 2 + 1]);
  }
  return out;
}

/** Project a way to a flat `[x, z, …]` array of quantised local metres. */
function projectWay(
  coords: readonly (readonly [number, number])[],
  origin: { lat: number; lon: number },
): number[] {
  const flat: number[] = [];
  let lastX = Number.NaN;
  let lastZ = Number.NaN;

  for (const [lat, lon] of coords) {
    const { x, z } = geoToLocal(lat, lon, origin);
    const qx = quantise(x);
    const qz = quantise(z);
    // Drop consecutive duplicates introduced by quantisation.
    if (qx === lastX && qz === lastZ) continue;
    flat.push(qx, qz);
    lastX = qx;
    lastZ = qz;
  }

  return flat;
}

function isClosedRing(coords: readonly (readonly [number, number])[]): boolean {
  if (coords.length < 4) return false;
  const first = coords[0];
  const last = coords[coords.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

interface ProcessedFeatures {
  buildings: SnapshotBuilding[];
  roads: SnapshotRoad[];
  green: SnapshotGreenArea[];
  facilities: SnapshotFacility[];
  skipped: {
    smallBuildings: number;
    openBuildingWays: number;
    unclassifiedWays: number;
    relations: number;
  };
}

function processFeatures(raw: RawData, city: CityConfig): ProcessedFeatures {
  const origin = city.center;
  const buildings: SnapshotBuilding[] = [];
  const roads: SnapshotRoad[] = [];
  const green: SnapshotGreenArea[] = [];
  const facilities: SnapshotFacility[] = [];
  const skipped = {
    smallBuildings: 0,
    openBuildingWays: 0,
    unclassifiedWays: 0,
    relations: raw.relationCount,
  };

  for (const way of raw.ways) {
    const tags = way.tags;

    if (tags.building !== undefined) {
      if (!isClosedRing(way.coords)) {
        skipped.openBuildingWays += 1;
        continue;
      }

      // Drop the duplicated closing vertex: the extruder closes the ring itself.
      const projected = projectWay(way.coords.slice(0, -1), origin);
      const ring = simplify(projected, SIMPLIFY_BUILDING_M);
      if (ring.length < 6) {
        skipped.smallBuildings += 1;
        continue;
      }

      const areaM2 = ringAreaM2(ring);
      if (areaM2 < MIN_BUILDING_AREA_M2) {
        skipped.smallBuildings += 1;
        continue;
      }

      const id = `w${way.id}`;
      const category = classifyBuilding(tags);
      const { heightM, heightSource } = deriveBuildingHeight(
        id,
        tags,
        category,
        areaM2,
      );
      const centroid = ringCentroid(ring);
      const geo = localToGeo(centroid.x, centroid.z, origin);

      buildings.push({
        id,
        osmId: way.id,
        osmType: 'way',
        ring,
        heightM,
        heightSource,
        category,
        centroid: [quantise(centroid.x), quantise(centroid.z)],
        centroidLatLon: [
          Math.round(geo.lat * 1e6) / 1e6,
          Math.round(geo.lon * 1e6) / 1e6,
        ],
        areaM2: Math.round(areaM2),
        tags: pickTags(tags),
      });

      // A building can also be a facility (a hospital, a school). It is
      // recorded in both layers so the facility marker survives the buildings
      // layer being switched off.
      const facilityCategory = classifyFacility(tags);
      if (facilityCategory) {
        facilities.push({
          id: `wf${way.id}`,
          osmId: way.id,
          osmType: 'way',
          category: facilityCategory,
          name: tags.name ?? null,
          position: [quantise(centroid.x), quantise(centroid.z)],
          latLon: [
            Math.round(geo.lat * 1e6) / 1e6,
            Math.round(geo.lon * 1e6) / 1e6,
          ],
          tags: pickTags(tags),
        });
      }
      continue;
    }

    const roadClass = classifyRoad(tags);
    if (roadClass) {
      const path = simplify(projectWay(way.coords, origin), SIMPLIFY_ROAD_M);
      if (path.length < 4) continue;

      const lanes = parseLanes(tags.lanes);
      roads.push({
        id: `w${way.id}`,
        osmId: way.id,
        path,
        roadClass,
        name: tags.name ?? null,
        lanes,
        oneway: isOneway(tags),
        widthM: roadWidthM(roadClass, lanes),
      });
      continue;
    }

    const greenKind = classifyGreen(tags);
    if (greenKind) {
      if (!isClosedRing(way.coords)) continue;
      const ring = simplify(
        projectWay(way.coords.slice(0, -1), origin),
        SIMPLIFY_BUILDING_M,
      );
      if (ring.length < 6) continue;

      const areaM2 = ringAreaM2(ring);
      if (areaM2 < 50) continue;

      green.push({
        id: `w${way.id}`,
        osmId: way.id,
        ring,
        kind: greenKind,
        name: tags.name ?? null,
        areaM2: Math.round(areaM2),
      });
      continue;
    }

    // A facility mapped as an area but not as a building — a school ground, a
    // marketplace, a bus station. Marked at the centroid of its outline.
    const wayFacility = classifyFacility(tags);
    if (wayFacility) {
      const outline = isClosedRing(way.coords)
        ? way.coords.slice(0, -1)
        : way.coords;
      const projected = projectWay(outline, origin);

      if (projected.length >= 4) {
        const centre = ringCentroid(projected);
        const geo = localToGeo(centre.x, centre.z, origin);
        facilities.push({
          id: `wa${way.id}`,
          osmId: way.id,
          osmType: 'way',
          category: wayFacility,
          name: tags.name ?? null,
          position: [quantise(centre.x), quantise(centre.z)],
          latLon: [
            Math.round(geo.lat * 1e6) / 1e6,
            Math.round(geo.lon * 1e6) / 1e6,
          ],
          tags: pickTags(tags),
        });
        continue;
      }
    }

    skipped.unclassifiedWays += 1;
  }

  for (const node of raw.taggedNodes) {
    const category = classifyFacility(node.tags);
    if (!category) continue;

    const { x, z } = geoToLocal(node.lat, node.lon, origin);
    facilities.push({
      id: `n${node.id}`,
      osmId: node.id,
      osmType: 'node',
      category,
      name: node.tags.name ?? null,
      position: [quantise(x), quantise(z)],
      latLon: [
        Math.round(node.lat * 1e6) / 1e6,
        Math.round(node.lon * 1e6) / 1e6,
      ],
      tags: pickTags(node.tags),
    });
  }

  return { buildings, roads, green, facilities, skipped };
}

// ---------------------------------------------------------------------------
// Tiling and output
// ---------------------------------------------------------------------------

/**
 * Assign a local coordinate to a tile.
 *
 * The grid is anchored so that the study area spans columns/rows starting at 0,
 * with the city centre in the middle. Features are binned by a representative
 * point (centroid for areas, first vertex for roads) rather than clipped, which
 * keeps each feature whole in exactly one tile — simpler, and it avoids seams
 * where a building would otherwise be split across two merged meshes.
 */
function tileKeyFor(
  x: number,
  z: number,
  city: CityConfig,
): { key: string; col: number; row: number } {
  const col = Math.floor((x + city.extentM) / city.tileSizeM);
  const row = Math.floor((z + city.extentM) / city.tileSizeM);
  return { key: `${col}_${row}`, col, row };
}

interface TileBucket {
  col: number;
  row: number;
  buildings: SnapshotBuilding[];
  roads: SnapshotRoad[];
  green: SnapshotGreenArea[];
  facilities: SnapshotFacility[];
}

function bucketIntoTiles(
  features: ProcessedFeatures,
  city: CityConfig,
): Map<string, TileBucket> {
  const tiles = new Map<string, TileBucket>();

  const bucket = (x: number, z: number): TileBucket => {
    const { key, col, row } = tileKeyFor(x, z, city);
    let tile = tiles.get(key);
    if (!tile) {
      tile = { col, row, buildings: [], roads: [], green: [], facilities: [] };
      tiles.set(key, tile);
    }
    return tile;
  };

  for (const building of features.buildings) {
    bucket(building.centroid[0], building.centroid[1]).buildings.push(building);
  }
  for (const road of features.roads) {
    bucket(road.path[0], road.path[1]).roads.push(road);
  }
  for (const area of features.green) {
    const centre = ringCentroid(area.ring);
    bucket(centre.x, centre.z).green.push(area);
  }
  for (const facility of features.facilities) {
    bucket(facility.position[0], facility.position[1]).facilities.push(facility);
  }

  return tiles;
}

async function writeSnapshot(
  city: CityConfig,
  bbox: BBox,
  adapter: AdapterResult,
  features: ProcessedFeatures,
  outDir: string,
): Promise<CityManifest> {
  const tiles = bucketIntoTiles(features, city);
  const tilesDir = join(outDir, 'tiles');
  await mkdir(tilesDir, { recursive: true });

  const tileRefs: CityTileRef[] = [];

  for (const [key, tile] of [...tiles.entries()].sort()) {
    const file = `tiles/${key}.json`;
    await writeFile(
      join(outDir, file),
      JSON.stringify({
        key,
        buildings: tile.buildings,
        roads: tile.roads,
        green: tile.green,
        facilities: tile.facilities,
      }),
      'utf8',
    );

    tileRefs.push({
      key,
      col: tile.col,
      row: tile.row,
      centre: [
        tile.col * city.tileSizeM - city.extentM + city.tileSizeM / 2,
        tile.row * city.tileSizeM - city.extentM + city.tileSizeM / 2,
      ],
      file,
      counts: {
        buildings: tile.buildings.length,
        roads: tile.roads.length,
        green: tile.green.length,
        facilities: tile.facilities.length,
      },
    });
  }

  const heightTagCoverage = { osmHeight: 0, osmLevels: 0, derived: 0 };
  for (const building of features.buildings) {
    if (building.heightSource === 'OSM_HEIGHT') heightTagCoverage.osmHeight += 1;
    else if (building.heightSource === 'OSM_LEVELS') heightTagCoverage.osmLevels += 1;
    else heightTagCoverage.derived += 1;
  }

  const manifest: CityManifest = {
    city: city.id,
    generatedAt: new Date().toISOString(),
    origin: city.center,
    bbox,
    tileSizeM: city.tileSizeM,
    extentM: city.extentM,
    source: {
      adapter: adapter.adapter,
      endpoint: adapter.endpoint,
      licence: 'ODbL 1.0',
      attribution: '© OpenStreetMap contributors',
    },
    counts: {
      buildings: features.buildings.length,
      roads: features.roads.length,
      green: features.green.length,
      facilities: features.facilities.length,
    },
    heightTagCoverage,
    tiles: tileRefs,
  };

  await writeFile(
    join(outDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  return manifest;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const adapterArg = args.includes('--adapter')
    ? args[args.indexOf('--adapter') + 1]
    : 'auto';
  const dryRun = args.includes('--dry-run');

  const city = DEFAULT_CITY;
  const bbox = studyBBox(city);

  log(`Snapshot: ${city.name} (${city.id})`);
  log(
    `  study area ${(city.extentM * 2) / 1000} x ${(city.extentM * 2) / 1000} km ` +
      `around ${city.center.lat}, ${city.center.lon}`,
  );
  log(
    `  bbox ${bbox.minLat.toFixed(5)},${bbox.minLon.toFixed(5)} → ` +
      `${bbox.maxLat.toFixed(5)},${bbox.maxLon.toFixed(5)}`,
  );

  let adapter: AdapterResult | null = null;

  if (adapterArg === 'auto' || adapterArg === 'overpass') {
    adapter = await fetchViaOverpass(bbox);
    if (!adapter && adapterArg === 'overpass') {
      throw new Error('Overpass adapter failed and --adapter overpass was requested.');
    }
  }

  if (!adapter && (adapterArg === 'auto' || adapterArg === 'osm')) {
    if (adapterArg === 'auto') {
      log('  overpass unavailable — falling back to the OSM /map API');
    }
    // Three divisions per axis keeps each sub-request near 500 m, which in
    // central Jakarta is roughly 6,000 nodes — an order of magnitude under the
    // API's 50,000-node ceiling.
    adapter = await fetchViaOsmMapApi(bbox, 3);
  }

  if (!adapter) {
    throw new Error(
      'No geodata source was reachable. Check network access to overpass-api.de and api.openstreetmap.org.',
    );
  }

  log(
    `  source: ${adapter.adapter} (${adapter.requestCount} request(s)) → ` +
      `${adapter.ways.length} ways, ${adapter.taggedNodes.length} tagged nodes`,
  );

  const features = processFeatures(adapter, city);

  log('Processed:');
  log(`  buildings  ${features.buildings.length}`);
  log(`  roads      ${features.roads.length}`);
  log(`  green      ${features.green.length}`);
  log(`  facilities ${features.facilities.length}`);
  log(
    `  skipped: ${features.skipped.smallBuildings} tiny/degenerate buildings, ` +
      `${features.skipped.openBuildingWays} unclosed building ways, ` +
      `${features.skipped.relations} relations (multipolygons are not assembled yet), ` +
      `${features.skipped.unclassifiedWays} other ways`,
  );

  if (dryRun) {
    log('Dry run: nothing written.');
    return;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(here, '..', 'public', 'data', 'city', city.id);
  const manifest = await writeSnapshot(city, bbox, adapter, features, outDir);

  const coverage = manifest.heightTagCoverage;
  const total = Math.max(1, manifest.counts.buildings);
  log(`Wrote ${manifest.tiles.length} tile(s) to public/data/city/${city.id}/`);
  log(
    `  height sources: ${coverage.osmHeight} from height tag, ` +
      `${coverage.osmLevels} from building:levels ` +
      `(${(((coverage.osmHeight + coverage.osmLevels) / total) * 100).toFixed(1)}% tagged), ` +
      `${coverage.derived} derived`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
