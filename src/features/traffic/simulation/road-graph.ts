import type { RoadClass, SnapshotRoad } from '@/features/city/types/city-data';

/**
 * Drivable graph built from the OpenStreetMap road snapshot.
 *
 * The geometry is real; the traffic on it is not. This module only turns road
 * polylines into something a vehicle can follow and turn along.
 *
 * Intersections are recovered by splitting: any vertex shared by two or more
 * road ways becomes a graph node, and the ways are cut there into separate
 * edges. Using way endpoints alone would miss every junction where OSM carries
 * a road straight through, which measured at a third of the network in this
 * study area and left those vehicles bouncing along a stub instead of turning.
 */

/** Free-flow speed per road class, in metres per second. */
const FREE_FLOW_MS: Record<RoadClass, number> = {
  // Jakarta's arterials are signal-heavy, so these are well below the legal
  // limits: they are intended to look like city traffic, not motorway speed.
  motorway: 19,
  trunk: 16,
  primary: 13,
  secondary: 11,
  tertiary: 9,
  residential: 7,
  service: 5,
  pedestrian: 3,
};

export interface GraphEdge {
  readonly id: string;
  readonly roadClass: RoadClass;
  readonly oneway: boolean;
  readonly widthM: number;
  readonly name: string | null;
  /** Polyline in local metres, flat `[x, z, …]`. */
  readonly path: readonly number[];
  /** Cumulative distance at each vertex, so a position lookup is a binary search. */
  readonly cumulative: readonly number[];
  readonly lengthM: number;
  readonly fromNode: number;
  readonly toNode: number;
  readonly freeFlowMs: number;
  /**
   * Vehicles this edge holds before it is considered saturated, from its length
   * and lane count. Used to derive a congestion level.
   */
  readonly capacity: number;
}

export interface RoadGraph {
  readonly edges: readonly GraphEdge[];
  /** Node index to the edges that can be entered from it. */
  readonly outgoing: readonly (readonly number[])[];
  readonly totalLengthM: number;
  readonly nodeCount: number;
}

/** Average space a vehicle occupies per lane, in metres, including the gap. */
const METRES_PER_VEHICLE = 11;

function nodeKey(x: number, z: number): string {
  // 1 m rounding: the snapshot quantises to 0.1 m, so shared OSM nodes land on
  // the same key while genuinely distinct endpoints stay apart.
  return `${Math.round(x)}_${Math.round(z)}`;
}

/** Shortest edge worth keeping, in metres. */
const MIN_EDGE_M = 5;

export function buildRoadGraph(roads: readonly SnapshotRoad[]): RoadGraph {
  const nodeIds = new Map<string, number>();
  const edges: GraphEdge[] = [];
  let totalLengthM = 0;

  const nodeFor = (x: number, z: number): number => {
    const key = nodeKey(x, z);
    let id = nodeIds.get(key);
    if (id === undefined) {
      id = nodeIds.size;
      nodeIds.set(key, id);
    }
    return id;
  };

  // Pass 1: count how many ways touch each vertex. A vertex touched more than
  // once is a junction, even if it sits in the middle of both ways.
  const vertexUses = new Map<string, number>();
  for (const road of roads) {
    // A way that revisits a vertex (a loop) must not count itself twice.
    const seen = new Set<string>();
    for (let i = 0; i < road.path.length; i += 2) {
      const key = nodeKey(road.path[i], road.path[i + 1]);
      if (seen.has(key)) continue;
      seen.add(key);
      vertexUses.set(key, (vertexUses.get(key) ?? 0) + 1);
    }
  }

  /** Emit one edge from a slice of a road's polyline. */
  const addEdge = (
    road: SnapshotRoad,
    path: number[],
    suffix: number,
  ): void => {
    if (path.length < 4) return;

    const cumulative: number[] = [0];
    let length = 0;
    for (let i = 0; i + 3 < path.length; i += 2) {
      length += Math.hypot(path[i + 2] - path[i], path[i + 3] - path[i + 1]);
      cumulative.push(length);
    }
    if (length < MIN_EDGE_M) return;

    // Lane count from the rendered width, at least one.
    const lanes = Math.max(1, Math.round(road.widthM / 3.25));

    edges.push({
      id: suffix === 0 ? road.id : `${road.id}:${suffix}`,
      roadClass: road.roadClass,
      oneway: road.oneway,
      widthM: road.widthM,
      name: road.name,
      path,
      cumulative,
      lengthM: length,
      fromNode: nodeFor(path[0], path[1]),
      toNode: nodeFor(path[path.length - 2], path[path.length - 1]),
      freeFlowMs: FREE_FLOW_MS[road.roadClass],
      capacity: Math.max(
        1,
        Math.round((length / METRES_PER_VEHICLE) * lanes * (road.oneway ? 1 : 0.5)),
      ),
    });

    totalLengthM += length;
  };

  // Pass 2: split each way at its shared interior vertices.
  for (const road of roads) {
    const path = road.path;
    if (path.length < 4) continue;

    const vertexCount = path.length / 2;
    let current: number[] = [path[0], path[1]];
    let suffix = 0;

    for (let v = 1; v < vertexCount; v += 1) {
      const x = path[v * 2];
      const z = path[v * 2 + 1];
      current.push(x, z);

      const isLast = v === vertexCount - 1;
      const isShared = (vertexUses.get(nodeKey(x, z)) ?? 0) > 1;

      if (!isLast && isShared) {
        addEdge(road, current, suffix);
        suffix += 1;
        // The junction vertex starts the next edge, so the network stays
        // connected rather than gaining a gap at every intersection.
        current = [x, z];
      }
    }

    addEdge(road, current, suffix);
  }

  // Adjacency. A two-way edge can be entered from either end; a one-way edge
  // only from its start.
  const outgoing: number[][] = Array.from(
    { length: nodeIds.size },
    () => [] as number[],
  );

  edges.forEach((edge, index) => {
    outgoing[edge.fromNode].push(index);
    if (!edge.oneway) outgoing[edge.toNode].push(index);
  });

  return {
    edges,
    outgoing,
    totalLengthM,
    nodeCount: nodeIds.size,
  };
}

export interface PointOnEdge {
  readonly x: number;
  readonly z: number;
  /** Heading in radians about +Y, for orienting a vehicle. */
  readonly heading: number;
}

/**
 * Position and heading at a distance along an edge.
 *
 * `forward` false walks the polyline backwards, which is how the opposite
 * direction of a two-way road is driven without storing a second copy of the
 * geometry.
 */
export function pointOnEdge(
  edge: GraphEdge,
  distanceM: number,
  forward: boolean,
): PointOnEdge {
  const travel = forward ? distanceM : edge.lengthM - distanceM;
  const clamped = Math.min(Math.max(travel, 0), edge.lengthM);

  // Binary search the cumulative table for the containing segment.
  let low = 0;
  let high = edge.cumulative.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (edge.cumulative[mid] <= clamped) low = mid;
    else high = mid;
  }

  const segmentStart = edge.cumulative[low];
  const segmentLength = edge.cumulative[high] - segmentStart || 1;
  const t = (clamped - segmentStart) / segmentLength;

  const ax = edge.path[low * 2];
  const az = edge.path[low * 2 + 1];
  const bx = edge.path[high * 2];
  const bz = edge.path[high * 2 + 1];

  const dx = bx - ax;
  const dz = bz - az;

  // Heading is measured so that atan2(dx, dz) gives a rotation about +Y which
  // turns a model facing -Z onto the direction of travel.
  const heading = forward
    ? Math.atan2(dx, dz)
    : Math.atan2(-dx, -dz);

  return {
    x: ax + dx * t,
    z: az + dz * t,
    heading,
  };
}
