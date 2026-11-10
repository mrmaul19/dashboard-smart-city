'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferAttribute,
  type LineSegments,
} from 'three';
import type { SnapshotRoad } from '@/features/city/types/city-data';
import { buildRoadGraph } from '@/features/traffic/simulation/road-graph';
import {
  CONGESTION_SEVERE,
  TrafficSimulation,
  VEHICLE_TYPES,
} from '@/features/traffic/simulation/traffic-sim';

/**
 * Simulated traffic layer.
 *
 * Rendering strategy: one `InstancedMesh` per vehicle type, so the whole fleet
 * is five draw calls regardless of how many vehicles there are. Matrices are
 * written straight into the instance buffer from the simulation's typed arrays
 * each frame, with no React state involved — a 1,400-vehicle fleet would
 * otherwise cause 1,400 re-renders per frame.
 *
 * **Everything this layer draws is simulated**, including the congestion
 * colours. The road geometry beneath it is real OpenStreetMap data.
 */

/** Congestion ramp. These are the app's reserved status colours: congestion is a status. */
const CONGESTION_FREE = new Color('#34d399');
const CONGESTION_MODERATE = new Color('#fbbf24');
const CONGESTION_SEVERE_COLOUR = new Color('#f87171');

/** Below this, a road is drawn as free-flowing. */
const CONGESTION_QUIET = 0.25;

/** How often the congestion colours are refreshed, in seconds. */
const CONGESTION_REFRESH_S = 0.25;

export interface TrafficStats {
  vehicleCount: number;
  meanCongestion: number;
  severeEdges: number;
  totalRoadKm: number;
}

interface TrafficLayerProps {
  roads: readonly SnapshotRoad[];
  /** 0..1 from the dashboard control. */
  density: number;
  showCongestion: boolean;
  onStats?: (stats: TrafficStats) => void;
}

/** Headroom above a type's expected share, so a run of one type cannot overflow. */
function instanceLimit(share: number): number {
  return Math.ceil(1400 * share * 1.35) + 12;
}

export function TrafficLayer({
  roads,
  density,
  showCongestion,
  onStats,
}: TrafficLayerProps) {
  const graph = useMemo(() => buildRoadGraph(roads), [roads]);
  const simulation = useMemo(() => new TrafficSimulation(graph), [graph]);

  const meshRefs = useRef<(InstancedMesh | null)[]>([]);
  const congestionRef = useRef<LineSegments>(null);

  // Position buffers, reused every frame so stepping allocates nothing.
  const buffers = useMemo(
    () =>
      VEHICLE_TYPES.map((spec) => {
        const limit = instanceLimit(spec.share);
        return {
          x: new Float32Array(limit),
          z: new Float32Array(limit),
          heading: new Float32Array(limit),
        };
      }),
    [],
  );

  // Scratch objects for matrix composition, also reused.
  const scratch = useMemo(
    () => ({
      matrix: new Matrix4(),
      position: new Vector3(),
      quaternion: new Quaternion(),
      euler: new Euler(),
      scale: new Vector3(1, 1, 1),
      colour: new Color(),
    }),
    [],
  );

  useEffect(() => {
    simulation.setDensity(density);
  }, [simulation, density]);

  /**
   * Congestion overlay geometry.
   *
   * Positions are static — they are the road centrelines — so only the colour
   * attribute is rewritten as congestion changes. Rebuilding the geometry each
   * time would be far more expensive than updating one buffer.
   */
  const congestionGeometry = useMemo(() => {
    const positions: number[] = [];
    const colours: number[] = [];
    // Maps each emitted vertex back to its edge, so the colour pass is a
    // single linear walk.
    const vertexEdge: number[] = [];

    graph.edges.forEach((edge, edgeIndex) => {
      const path = edge.path;
      for (let i = 0; i + 3 < path.length; i += 2) {
        // Slightly above the road surface so it is not hidden by it.
        positions.push(path[i], 0.35, path[i + 1]);
        positions.push(path[i + 2], 0.35, path[i + 3]);
        colours.push(0, 0, 0, 0, 0, 0);
        vertexEdge.push(edgeIndex, edgeIndex);
      }
    });

    return {
      positions: new Float32Array(positions),
      colours: new Float32Array(colours),
      vertexEdge: new Uint32Array(vertexEdge),
    };
  }, [graph]);

  const congestionClock = useRef(0);
  const statsClock = useRef(0);

  useFrame((_, delta) => {
    simulation.step(delta);

    const written = simulation.writePositions(buffers);

    for (let typeIndex = 0; typeIndex < VEHICLE_TYPES.length; typeIndex += 1) {
      const mesh = meshRefs.current[typeIndex];
      if (!mesh) continue;

      const spec = VEHICLE_TYPES[typeIndex];
      const buffer = buffers[typeIndex];
      const count = written[typeIndex];

      for (let i = 0; i < count; i += 1) {
        scratch.position.set(buffer.x[i], spec.size[2] / 2, buffer.z[i]);
        scratch.euler.set(0, buffer.heading[i], 0);
        scratch.quaternion.setFromEuler(scratch.euler);
        scratch.matrix.compose(
          scratch.position,
          scratch.quaternion,
          scratch.scale,
        );
        mesh.setMatrixAt(i, scratch.matrix);
      }

      // `count` controls how many instances are drawn, so stale instances
      // beyond it are simply not rendered.
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    }

    // Congestion colours, refreshed on their own slower clock.
    congestionClock.current += delta;
    if (showCongestion && congestionClock.current >= CONGESTION_REFRESH_S) {
      congestionClock.current = 0;

      const geometry = congestionRef.current?.geometry;
      const attribute = geometry?.getAttribute('color') as
        | BufferAttribute
        | undefined;

      if (attribute) {
        const array = attribute.array as Float32Array;
        const congestion = simulation.congestion;
        const { vertexEdge } = congestionGeometry;

        for (let v = 0; v < vertexEdge.length; v += 1) {
          const level = congestion[vertexEdge[v]] ?? 0;

          if (level <= CONGESTION_QUIET) {
            scratch.colour.copy(CONGESTION_FREE);
          } else if (level < CONGESTION_SEVERE) {
            // Interpolate across the middle band so the ramp reads as
            // continuous rather than as three discrete states.
            scratch.colour
              .copy(CONGESTION_MODERATE)
              .lerp(
                CONGESTION_SEVERE_COLOUR,
                (level - CONGESTION_QUIET) /
                  (CONGESTION_SEVERE - CONGESTION_QUIET),
              );
          } else {
            scratch.colour.copy(CONGESTION_SEVERE_COLOUR);
          }

          array[v * 3] = scratch.colour.r;
          array[v * 3 + 1] = scratch.colour.g;
          array[v * 3 + 2] = scratch.colour.b;
        }

        attribute.needsUpdate = true;
      }
    }

    statsClock.current += delta;
    if (onStats && statsClock.current >= 0.5) {
      statsClock.current = 0;
      onStats({
        vehicleCount: simulation.vehicleCount,
        meanCongestion: simulation.meanCongestion(),
        severeEdges: simulation.severeEdgeCount(),
        totalRoadKm: graph.totalLengthM / 1000,
      });
    }
  });

  return (
    <group name="traffic">
      {VEHICLE_TYPES.map((spec, typeIndex) => (
        <instancedMesh
          key={spec.type}
          ref={(instance) => {
            meshRefs.current[typeIndex] = instance;
          }}
          // The third argument is the instance capacity; `count` is set per
          // frame to the number actually in use.
          args={[undefined, undefined, instanceLimit(spec.share)]}
          frustumCulled={false}
        >
          {/* Length runs along -Z, matching the heading convention. */}
          <boxGeometry args={[spec.size[1], spec.size[2], spec.size[0]]} />
          <meshLambertMaterial color={spec.colour} />
        </instancedMesh>
      ))}

      {showCongestion ? (
        <lineSegments ref={congestionRef} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[congestionGeometry.positions, 3]}
              count={congestionGeometry.positions.length / 3}
              itemSize={3}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[congestionGeometry.colours, 3]}
              count={congestionGeometry.colours.length / 3}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial vertexColors transparent opacity={0.75} />
        </lineSegments>
      ) : null}
    </group>
  );
}
