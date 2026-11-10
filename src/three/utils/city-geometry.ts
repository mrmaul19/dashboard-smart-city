import {
  BufferGeometry,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
} from 'three';
import type {
  BuildingCategory,
  GreenKind,
  SnapshotBuilding,
  SnapshotGreenArea,
  SnapshotRoad,
} from '@/features/city/types/city-data';

/**
 * Geometry builders for the city.
 *
 * Performance strategy: a 1.5 x 1.5 km slice of central Jakarta holds on the
 * order of 11,000 building footprints. One mesh per building would mean 11,000
 * draw calls and is hopeless, so every footprint in a tile is extruded into a
 * **single merged BufferGeometry**, giving one draw call per tile per layer.
 *
 * Merging costs us the natural "which object did I click" answer that separate
 * meshes provide, so each merged geometry is returned alongside a
 * `faceToFeature` lookup: a raycast gives a triangle index, and that array maps
 * it straight back to the source feature. See `pickFeature`.
 *
 * Category is carried in a vertex colour attribute rather than by splitting
 * into one mesh per category, so a tile stays a single draw call.
 */

export interface MergedGeometry {
  geometry: BufferGeometry;
  /** Triangle index to source-feature index. Length is the triangle count. */
  faceToFeature: Uint32Array;
}

/**
 * Resolve a raycast hit back to the feature it belongs to.
 *
 * `faceIndex` comes straight off a React Three Fiber intersection event, where
 * it is optional and may be null, so both absent cases are accepted here.
 */
export function pickFeature(
  merged: MergedGeometry,
  faceIndex: number | null | undefined,
): number | null {
  if (faceIndex === null || faceIndex === undefined) return null;
  if (faceIndex < 0 || faceIndex >= merged.faceToFeature.length) return null;
  return merged.faceToFeature[faceIndex];
}

// ---------------------------------------------------------------------------
// Colour tables
//
// Buildings are tinted by category to make the city legible without labels.
// These are intentionally desaturated: the scene is the backdrop for data
// overlays, so saturated colour is reserved for the data, not the city.
// ---------------------------------------------------------------------------

const BUILDING_COLOURS: Record<BuildingCategory, [number, number, number]> = {
  office: [0.38, 0.45, 0.58],
  commercial: [0.46, 0.42, 0.52],
  residential: [0.34, 0.36, 0.42],
  industrial: [0.4, 0.38, 0.34],
  public: [0.3, 0.44, 0.5],
  other: [0.33, 0.35, 0.4],
};

const GREEN_COLOURS: Record<GreenKind, [number, number, number]> = {
  park: [0.16, 0.34, 0.22],
  garden: [0.18, 0.37, 0.24],
  forest: [0.12, 0.28, 0.18],
  grass: [0.2, 0.36, 0.23],
  pitch: [0.17, 0.33, 0.26],
  water: [0.11, 0.24, 0.36],
};

export const ROAD_COLOUR: [number, number, number] = [0.13, 0.15, 0.19];

// ---------------------------------------------------------------------------
// Winding-agnostic triangle emission
//
// OSM does not guarantee ring orientation, and a wrongly wound triangle is
// invisible under backface culling. Rather than normalising winding up front
// and reasoning about shoelace sign conventions, each triangle is emitted with
// the winding that matches its intended normal: if the cross product points
// the wrong way, two vertices are swapped. This is self-correcting, so neither
// clockwise nor counter-clockwise input can produce a hole in the mesh.
// ---------------------------------------------------------------------------

interface MeshSink {
  positions: number[];
  normals: number[];
  colours: number[];
  faceToFeature: number[];
}

function emitTriangle(
  sink: MeshSink,
  featureIndex: number,
  colour: readonly [number, number, number],
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  nx: number, ny: number, nz: number,
): void {
  // Orientation test: does this vertex order already face the wanted normal?
  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;
  const e2x = cx - ax;
  const e2y = cy - ay;
  const e2z = cz - az;

  const crossX = e1y * e2z - e1z * e2y;
  const crossY = e1z * e2x - e1x * e2z;
  const crossZ = e1x * e2y - e1y * e2x;

  const facesWantedWay = crossX * nx + crossY * ny + crossZ * nz >= 0;

  if (facesWantedWay) {
    sink.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  } else {
    sink.positions.push(ax, ay, az, cx, cy, cz, bx, by, bz);
  }

  for (let i = 0; i < 3; i += 1) {
    sink.normals.push(nx, ny, nz);
    sink.colours.push(colour[0], colour[1], colour[2]);
  }
  sink.faceToFeature.push(featureIndex);
}

function finalise(sink: MeshSink): MergedGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(sink.positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(sink.normals, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(sink.colours, 3));
  // A bounding sphere is required for frustum culling to work per tile.
  geometry.computeBoundingSphere();
  return { geometry, faceToFeature: new Uint32Array(sink.faceToFeature) };
}

function newSink(): MeshSink {
  return { positions: [], normals: [], colours: [], faceToFeature: [] };
}

/** Mean of a flat `[x, z, …]` ring, used to orient wall normals outward. */
function ringMean(ring: readonly number[]): { x: number; z: number } {
  const count = ring.length / 2;
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < count; i += 1) {
    sx += ring[i * 2];
    sz += ring[i * 2 + 1];
  }
  return { x: sx / count, z: sz / count };
}

/**
 * Signed area of a flat `[x, z, …]` ring. The sign encodes winding order,
 * which is what makes outward wall normals computable exactly.
 */
function ringSignedArea(ring: readonly number[]): number {
  const n = ring.length / 2;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    sum += ring[i * 2] * ring[j * 2 + 1] - ring[j * 2] * ring[i * 2 + 1];
  }
  return sum / 2;
}

/** Triangulate a flat `[x, z, …]` ring into index triples. */
function triangulateRing(ring: readonly number[]): number[][] {
  const contour: Vector2[] = [];
  for (let i = 0; i < ring.length; i += 2) {
    // The 2D triangulator works in (x, y); the ring's z becomes y here and is
    // mapped back to z when vertices are emitted.
    contour.push(new Vector2(ring[i], ring[i + 1]));
  }
  return ShapeUtils.triangulateShape(contour, []);
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

/**
 * Extrude a tile's building footprints into one merged geometry.
 *
 * Each footprint contributes a roof cap (triangulated) and one quad per edge
 * for the walls. Ground faces are not emitted: they are never visible from an
 * above-ground camera, and skipping them removes roughly a third of the
 * triangles.
 */
export function buildBuildingsGeometry(
  buildings: readonly SnapshotBuilding[],
): MergedGeometry {
  const sink = newSink();

  for (let featureIndex = 0; featureIndex < buildings.length; featureIndex += 1) {
    const building = buildings[featureIndex];
    const ring = building.ring;
    const vertexCount = ring.length / 2;
    if (vertexCount < 3) continue;

    const height = building.heightM;
    const colour = BUILDING_COLOURS[building.category];
    // Outward direction for the walls comes from the ring's winding order,
    // which is exact for any simple polygon. Testing each edge against the
    // footprint's centroid instead would mis-orient walls on concave shapes,
    // whose centroid can fall outside the polygon.
    const windingSign = ringSignedArea(ring) > 0 ? 1 : -1;

    // Roof cap.
    for (const [i0, i1, i2] of triangulateRing(ring)) {
      emitTriangle(
        sink,
        featureIndex,
        colour,
        ring[i0 * 2], height, ring[i0 * 2 + 1],
        ring[i1 * 2], height, ring[i1 * 2 + 1],
        ring[i2 * 2], height, ring[i2 * 2 + 1],
        0, 1, 0,
      );
    }

    // Walls: one quad per edge, as two triangles.
    for (let i = 0; i < vertexCount; i += 1) {
      const j = (i + 1) % vertexCount;
      const ax = ring[i * 2];
      const az = ring[i * 2 + 1];
      const bx = ring[j * 2];
      const bz = ring[j * 2 + 1];

      const dx = bx - ax;
      const dz = bz - az;
      const length = Math.hypot(dx, dz);
      if (length < 1e-6) continue;

      const nx = (windingSign * dz) / length;
      const nz = (windingSign * -dx) / length;

      emitTriangle(
        sink, featureIndex, colour,
        ax, 0, az,
        bx, 0, bz,
        bx, height, bz,
        nx, 0, nz,
      );
      emitTriangle(
        sink, featureIndex, colour,
        ax, 0, az,
        bx, height, bz,
        ax, height, az,
        nx, 0, nz,
      );
    }
  }

  return finalise(sink);
}

/**
 * Geometry for a single building, used for the selection highlight.
 *
 * Built separately and slightly inflated so it renders just outside the merged
 * mesh without z-fighting, which is cheaper and more reliable than re-uploading
 * a vertex colour range on the merged geometry every time the selection moves.
 */
export function buildSelectionGeometry(
  building: SnapshotBuilding,
  inflateM = 0.3,
): BufferGeometry {
  const centre = ringMean(building.ring);
  const inflated: number[] = [];

  for (let i = 0; i < building.ring.length; i += 2) {
    const x = building.ring[i];
    const z = building.ring[i + 1];
    const dx = x - centre.x;
    const dz = z - centre.z;
    const distance = Math.hypot(dx, dz) || 1;
    inflated.push(
      x + (dx / distance) * inflateM,
      z + (dz / distance) * inflateM,
    );
  }

  const single: SnapshotBuilding = {
    ...building,
    ring: inflated,
    heightM: building.heightM + inflateM,
  };

  return buildBuildingsGeometry([single]).geometry;
}

// ---------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------

/**
 * Build road surfaces as flat ribbons.
 *
 * Each segment becomes one quad, extended by half a width at both ends. The
 * overhang makes consecutive segments overlap at bends, which fills the wedge
 * that would otherwise be visible at a corner — far cheaper than mitring the
 * joints, and invisible from a city-scale camera.
 */
export function buildRoadsGeometry(
  roads: readonly SnapshotRoad[],
  y = 0.08,
): MergedGeometry {
  const sink = newSink();

  for (let featureIndex = 0; featureIndex < roads.length; featureIndex += 1) {
    const road = roads[featureIndex];
    const path = road.path;
    const half = road.widthM / 2;

    for (let i = 0; i + 3 < path.length; i += 2) {
      const ax = path[i];
      const az = path[i + 1];
      const bx = path[i + 2];
      const bz = path[i + 3];

      const dx = bx - ax;
      const dz = bz - az;
      const length = Math.hypot(dx, dz);
      if (length < 1e-6) continue;

      const ux = dx / length;
      const uz = dz / length;
      // Perpendicular offset for width, and along-axis overhang for joints.
      const px = -uz * half;
      const pz = ux * half;
      const ox = ux * half;
      const oz = uz * half;

      const x0 = ax - ox + px;
      const z0 = az - oz + pz;
      const x1 = bx + ox + px;
      const z1 = bz + oz + pz;
      const x2 = bx + ox - px;
      const z2 = bz + oz - pz;
      const x3 = ax - ox - px;
      const z3 = az - oz - pz;

      emitTriangle(
        sink, featureIndex, ROAD_COLOUR,
        x0, y, z0, x1, y, z1, x2, y, z2,
        0, 1, 0,
      );
      emitTriangle(
        sink, featureIndex, ROAD_COLOUR,
        x0, y, z0, x2, y, z2, x3, y, z3,
        0, 1, 0,
      );
    }
  }

  return finalise(sink);
}

// ---------------------------------------------------------------------------
// Green and water areas
// ---------------------------------------------------------------------------

/** Flat filled polygons for parks, grass and water. */
export function buildGreenGeometry(
  areas: readonly SnapshotGreenArea[],
  y = 0.04,
): MergedGeometry {
  const sink = newSink();

  for (let featureIndex = 0; featureIndex < areas.length; featureIndex += 1) {
    const area = areas[featureIndex];
    const ring = area.ring;
    if (ring.length < 6) continue;

    const colour = GREEN_COLOURS[area.kind];

    for (const [i0, i1, i2] of triangulateRing(ring)) {
      emitTriangle(
        sink,
        featureIndex,
        colour,
        ring[i0 * 2], y, ring[i0 * 2 + 1],
        ring[i1 * 2], y, ring[i1 * 2 + 1],
        ring[i2 * 2], y, ring[i2 * 2 + 1],
        0, 1, 0,
      );
    }
  }

  return finalise(sink);
}
