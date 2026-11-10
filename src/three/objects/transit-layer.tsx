'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import type {
  TransitRoute,
  TransitStop,
} from '@/features/transportation/types/transit-data';

/**
 * Transjakarta layer.
 *
 * Provenance is mixed here, and the split matters:
 *
 * - **REAL**: route identities and colours, the corridor geometry buses follow,
 *   stop positions, and the service headways from `frequencies.txt`.
 * - **SIMULATED**: where each bus is at this instant. Transjakarta publishes no
 *   official GTFS-Realtime feed, so positions cannot be known. Buses are spaced
 *   along each corridor by their route's real headway and advanced at an
 *   assumed average speed.
 *
 * The assumed speed is the only invented quantity, and it is stated in the UI
 * next to the bus count rather than buried here.
 */

/**
 * Assumed average service speed, in metres per second (~20 km/h).
 *
 * Transjakarta's corridors are partly segregated but share junctions with
 * general traffic, which puts commercial speed well below the free-flow speed
 * of the roads. This is an assumption, not a measurement.
 */
export const ASSUMED_BUS_SPEED_MS = 5.5;

/** Fallback headway when a route has no `frequencies.txt` entry, in seconds. */
const FALLBACK_HEADWAY_S = 900;

/** Cap on buses per fragment, so a short headway cannot flood a corridor. */
const MAX_BUSES_PER_FRAGMENT = 12;

interface BusSlot {
  /** Index into the flattened fragment list. */
  readonly fragment: number;
  /** Distance along the fragment at t = 0, in metres. */
  readonly startOffsetM: number;
  readonly colour: Color;
}

interface FlatFragment {
  readonly path: readonly number[];
  readonly cumulative: readonly number[];
  readonly lengthM: number;
}

/** Position and heading at a distance along a polyline. */
function pointOnPath(
  fragment: FlatFragment,
  distanceM: number,
): { x: number; z: number; heading: number } {
  const clamped = Math.min(Math.max(distanceM, 0), fragment.lengthM);

  let low = 0;
  let high = fragment.cumulative.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (fragment.cumulative[mid] <= clamped) low = mid;
    else high = mid;
  }

  const start = fragment.cumulative[low];
  const span = fragment.cumulative[high] - start || 1;
  const t = (clamped - start) / span;

  const ax = fragment.path[low * 2];
  const az = fragment.path[low * 2 + 1];
  const dx = fragment.path[high * 2] - ax;
  const dz = fragment.path[high * 2 + 1] - az;

  return {
    x: ax + dx * t,
    z: az + dz * t,
    heading: Math.atan2(dx, dz),
  };
}

interface TransitLayerProps {
  routes: readonly TransitRoute[];
  stops: readonly TransitStop[];
  showRoutes: boolean;
  showStops: boolean;
  showBuses: boolean;
}

export function TransitLayer({
  routes,
  stops,
  showRoutes,
  showStops,
  showBuses,
}: TransitLayerProps) {
  /** Route corridors as a single coloured line geometry, built once. */
  const corridors = useMemo(() => {
    const positions: number[] = [];
    const colours: number[] = [];
    const colour = new Color();

    for (const route of routes) {
      colour.set(route.colour);
      for (const fragment of route.fragments) {
        const path = fragment.path;
        for (let i = 0; i + 3 < path.length; i += 2) {
          // Above the roads and the congestion overlay, so corridors stay
          // readable when traffic is dense.
          positions.push(path[i], 1.2, path[i + 1]);
          positions.push(path[i + 2], 1.2, path[i + 3]);
          colours.push(colour.r, colour.g, colour.b);
          colours.push(colour.r, colour.g, colour.b);
        }
      }
    }

    return {
      positions: new Float32Array(positions),
      colours: new Float32Array(colours),
      vertexCount: positions.length / 3,
    };
  }, [routes]);

  /**
   * Bus slots, derived from each route's real headway.
   *
   * Spacing in metres is `headway × assumed speed`: a route running every 6
   * minutes at 20 km/h puts a bus roughly every 2 km of corridor. That is why
   * a frequent JAK route shows several buses while a 20-minute route shows one.
   */
  const { fragments, slots } = useMemo(() => {
    const fragments: FlatFragment[] = [];
    const slots: BusSlot[] = [];

    for (const route of routes) {
      const headway = route.headwaySec ?? FALLBACK_HEADWAY_S;
      const spacingM = Math.max(120, headway * ASSUMED_BUS_SPEED_MS);
      const colour = new Color(route.colour);

      for (const raw of route.fragments) {
        const path = raw.path;
        if (path.length < 4) continue;

        const cumulative: number[] = [0];
        let length = 0;
        for (let i = 0; i + 3 < path.length; i += 2) {
          length += Math.hypot(path[i + 2] - path[i], path[i + 3] - path[i + 1]);
          cumulative.push(length);
        }
        if (length < 60) continue;

        const fragmentIndex = fragments.length;
        fragments.push({ path, cumulative, lengthM: length });

        const busCount = Math.min(
          MAX_BUSES_PER_FRAGMENT,
          Math.max(1, Math.round(length / spacingM)),
        );

        for (let i = 0; i < busCount; i += 1) {
          slots.push({
            fragment: fragmentIndex,
            // Evenly spaced along the corridor, which is what a constant
            // headway at a constant speed produces.
            startOffsetM: (length / busCount) * i,
            colour,
          });
        }
      }
    }

    return { fragments, slots };
  }, [routes]);

  const busMesh = useRef<InstancedMesh>(null);
  const stopMesh = useRef<InstancedMesh>(null);

  const scratch = useMemo(
    () => ({
      matrix: new Matrix4(),
      position: new Vector3(),
      quaternion: new Quaternion(),
      euler: new Euler(),
      scale: new Vector3(1, 1, 1),
    }),
    [],
  );

  // Stop markers are static, so they are written once rather than per frame.
  const stopsWritten = useRef(false);
  useFrame(({ clock }) => {
    if (showStops && stopMesh.current && !stopsWritten.current) {
      for (let i = 0; i < stops.length; i += 1) {
        scratch.position.set(stops[i].position[0], 2.2, stops[i].position[1]);
        scratch.matrix.compose(
          scratch.position,
          scratch.quaternion.identity(),
          scratch.scale,
        );
        stopMesh.current.setMatrixAt(i, scratch.matrix);
      }
      stopMesh.current.count = stops.length;
      stopMesh.current.instanceMatrix.needsUpdate = true;
      stopsWritten.current = true;
    }

    if (!showBuses || !busMesh.current) return;

    const elapsed = clock.elapsedTime;

    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      const fragment = fragments[slot.fragment];

      // Wrapping at the fragment length makes a bus leaving the scene reappear
      // at the corridor's other end, which is the steady-state behaviour of a
      // constant-headway service.
      const distance =
        (slot.startOffsetM + elapsed * ASSUMED_BUS_SPEED_MS) % fragment.lengthM;
      const point = pointOnPath(fragment, distance);

      scratch.position.set(point.x, 1.7, point.z);
      scratch.euler.set(0, point.heading, 0);
      scratch.quaternion.setFromEuler(scratch.euler);
      scratch.matrix.compose(
        scratch.position,
        scratch.quaternion,
        scratch.scale,
      );
      busMesh.current.setMatrixAt(i, scratch.matrix);
      busMesh.current.setColorAt(i, slot.colour);
    }

    busMesh.current.count = slots.length;
    busMesh.current.instanceMatrix.needsUpdate = true;
    if (busMesh.current.instanceColor) {
      busMesh.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group name="transit">
      {showRoutes && corridors.vertexCount > 0 ? (
        <lineSegments frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[corridors.positions, 3]}
              count={corridors.vertexCount}
              itemSize={3}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[corridors.colours, 3]}
              count={corridors.vertexCount}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial vertexColors transparent opacity={0.85} />
        </lineSegments>
      ) : null}

      {showStops && stops.length > 0 ? (
        <instancedMesh
          ref={stopMesh}
          args={[undefined, undefined, Math.max(stops.length, 1)]}
          frustumCulled={false}
        >
          <cylinderGeometry args={[2.4, 2.4, 4.4, 8]} />
          <meshLambertMaterial color="#e2e8f0" />
        </instancedMesh>
      ) : null}

      {showBuses && slots.length > 0 ? (
        <instancedMesh
          ref={busMesh}
          args={[undefined, undefined, Math.max(slots.length, 1)]}
          frustumCulled={false}
        >
          {/* Articulated-bus proportions, length along -Z. */}
          <boxGeometry args={[2.6, 3.3, 12]} />
          <meshLambertMaterial />
        </instancedMesh>
      ) : null}
    </group>
  );
}

/** Bus count the layer will draw, for the UI to report. */
export function countSimulatedBuses(routes: readonly TransitRoute[]): number {
  let total = 0;

  for (const route of routes) {
    const headway = route.headwaySec ?? FALLBACK_HEADWAY_S;
    const spacingM = Math.max(120, headway * ASSUMED_BUS_SPEED_MS);

    for (const fragment of route.fragments) {
      if (fragment.lengthM < 60) continue;
      total += Math.min(
        MAX_BUSES_PER_FRAGMENT,
        Math.max(1, Math.round(fragment.lengthM / spacingM)),
      );
    }
  }

  return total;
}
