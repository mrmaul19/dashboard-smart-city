'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { BufferAttribute, LineSegments } from 'three';

/**
 * In-scene weather visualisation (spec §7).
 *
 * Everything here is driven by the live Open-Meteo measurement: rainfall only
 * appears when the reported precipitation is above zero, and the drop count
 * and drift scale with the reported rate and wind. Nothing is animated for
 * decoration — if the city is dry, the sky is empty.
 */

/** Horizontal extent of the rain volume, in metres. Covers the study area. */
const FIELD_M = 1_900;
/** Height of the rain volume. Drops recycle from the top once they fall out. */
const CEILING_M = 420;
/** Streak length, in metres: long enough to read as rain, short enough to be rain. */
const STREAK_M = 7;

const MIN_DROPS = 700;
const MAX_DROPS = 6_000;
/** Terminal velocity of a raindrop is about 9 m/s; this is deliberately close. */
const FALL_SPEED_MS = 8.5;

interface WeatherOverlayProps {
  /** Measured precipitation in mm (per hour). `null` when unavailable. */
  precipitationMm: number | null;
  /** Measured wind speed in km/h. */
  windSpeedKmh: number | null;
  /** Meteorological bearing the wind comes *from*, in degrees. */
  windDirectionDeg: number | null;
  /** Whether the reported WMO code implies falling precipitation. */
  precipitating: boolean;
}

/**
 * Small deterministic PRNG (mulberry32).
 *
 * Used instead of `Math.random()` for two reasons: reading a global random
 * source during render is impure, and a fixed seed means the rain field is
 * identical on every render and every reload, so a drop never teleports when
 * the component happens to re-render.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Convert a meteorological bearing into the scene's rotation about +Y.
 *
 * North is -Z and east is +X, so a bearing β points along
 * `(sin β, 0, -cos β)`. Rotating the rest direction (0, 0, -1) about +Y by `a`
 * yields `(-sin a, 0, -cos a)`, so matching the two gives `a = -β`.
 */
function bearingToSceneRotation(bearingDeg: number): number {
  return -(bearingDeg * Math.PI) / 180;
}

function Rain({
  intensityMm,
  windSpeedKmh,
  windDirectionDeg,
}: {
  intensityMm: number;
  windSpeedKmh: number;
  windDirectionDeg: number;
}) {
  const ref = useRef<LineSegments>(null);

  // Drop count tracks the measured rate, so a drizzle and a downpour look
  // different rather than both rendering as "rain on".
  const dropCount = Math.round(
    Math.min(MAX_DROPS, MIN_DROPS + Math.min(intensityMm, 12) * 440),
  );

  // Base positions and a per-drop speed jitter, generated once per count
  // change from a fixed seed so the field is stable across re-renders.
  const { positions, seeds } = useMemo(() => {
    const random = mulberry32(0x5ca1ab1e);
    const positions = new Float32Array(dropCount * 6);
    const seeds = new Float32Array(dropCount * 2);

    for (let i = 0; i < dropCount; i += 1) {
      seeds[i * 2] = random() * CEILING_M;
      seeds[i * 2 + 1] = 0.75 + random() * 0.5;

      const x = (random() - 0.5) * FIELD_M;
      const z = (random() - 0.5) * FIELD_M;
      positions[i * 6] = x;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x;
      positions[i * 6 + 5] = z;
    }

    return { positions, seeds };
  }, [dropCount]);

  // Wind pushes the streaks off vertical. 3.6 converts km/h to m/s; the 0.35
  // factor keeps the lean plausible rather than horizontal in a stiff breeze.
  const drift = (windSpeedKmh / 3.6) * 0.35;
  const towardRad = ((windDirectionDeg + 180) * Math.PI) / 180;
  const driftX = Math.sin(towardRad) * drift;
  const driftZ = -Math.cos(towardRad) * drift;

  useFrame((state) => {
    const geometry = ref.current?.geometry;
    if (!geometry) return;

    const attribute = geometry.getAttribute('position') as BufferAttribute;
    const array = attribute.array as Float32Array;
    const elapsed = state.clock.elapsedTime;

    for (let i = 0; i < dropCount; i += 1) {
      const speed = FALL_SPEED_MS * seeds[i * 2 + 1];
      // Modulo wrap recycles each drop to the ceiling without any per-drop
      // bookkeeping, so the whole field is one pass over a typed array.
      const fallen = (seeds[i * 2] + elapsed * speed) % CEILING_M;
      const y = CEILING_M - fallen;

      const base = i * 6;
      array[base + 1] = y;
      array[base + 4] = y + STREAK_M;
      // Lean the streak into the wind, scaled by the streak length.
      array[base + 3] = array[base] - driftX * 0.9;
      array[base + 5] = array[base + 2] - driftZ * 0.9;
    }

    attribute.needsUpdate = true;
  });

  return (
    <lineSegments ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={dropCount * 2}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color="#9ec9ea"
        transparent
        opacity={0.33}
        depthWrite={false}
      />
    </lineSegments>
  );
}

/** Wind direction indicator, floating above the city centre. */
function WindVane({
  bearingDeg,
  speedKmh,
}: {
  bearingDeg: number;
  speedKmh: number;
}) {
  // Length hints at speed without becoming a second, competing scale.
  const length = 36 + Math.min(speedKmh, 40) * 1.4;

  return (
    <group
      position={[0, 150, 0]}
      rotation={[0, bearingToSceneRotation(bearingDeg + 180), 0]}
    >
      {/* Shaft, laid along -Z (the rest direction assumed above). */}
      <mesh position={[0, 0, -length / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.1, 1.1, length, 6]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.75} />
      </mesh>
      {/* Head, pointing the way the wind is blowing towards. */}
      <mesh position={[0, 0, -length]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[6, 16, 8]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

export function WeatherOverlay({
  precipitationMm,
  windSpeedKmh,
  windDirectionDeg,
  precipitating,
}: WeatherOverlayProps) {
  // Rain is shown when either the rate or the condition code says it is
  // raining: a drizzle can report 0.0 mm in the hour while the code says 51.
  const showRain =
    (precipitationMm !== null && precipitationMm > 0) || precipitating;

  return (
    <group name="weather">
      {showRain ? (
        <Rain
          intensityMm={Math.max(precipitationMm ?? 0, 0.2)}
          windSpeedKmh={windSpeedKmh ?? 0}
          windDirectionDeg={windDirectionDeg ?? 0}
        />
      ) : null}

      {windSpeedKmh !== null && windDirectionDeg !== null && windSpeedKmh > 0 ? (
        <WindVane bearingDeg={windDirectionDeg} speedKmh={windSpeedKmh} />
      ) : null}
    </group>
  );
}
