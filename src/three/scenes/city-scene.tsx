'use client';

import { useMemo, useRef } from 'react';
import { Grid } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { CameraRig } from '@/three/controls/camera-rig';
import {
  BuildingsLayer,
  GreenLayer,
  RoadsLayer,
  SelectionHighlight,
} from '@/three/objects/city-layers';
import { FacilityMarkers } from '@/three/objects/facility-markers';
import {
  AirQualityOverlay,
  type AirQualityMarker,
} from '@/three/objects/air-quality-overlay';
import { TrafficLayer, type TrafficStats } from '@/three/objects/traffic-layer';
import { TransitLayer } from '@/three/objects/transit-layer';
import { WeatherOverlay } from '@/three/objects/weather-overlay';
import type { LoadedTile } from '@/features/city/hooks/use-city-data';
import type {
  SnapshotBuilding,
  SnapshotFacility,
} from '@/features/city/types/city-data';
import type { LayerVisibility } from '@/stores/city-store';
import type {
  TransitRoute,
  TransitStop,
} from '@/features/transportation/types/transit-data';

export interface SceneStats {
  fps: number;
  triangles: number;
  drawCalls: number;
}

/**
 * Samples renderer statistics for the HUD.
 *
 * Reported rather than assumed: the whole merged-geometry design exists to keep
 * draw calls and triangle counts low, so those numbers belong on screen where
 * a regression is visible instead of in a comment claiming it is fast.
 */
function FrameMeter({ onSample }: { onSample: (stats: SceneStats) => void }) {
  const gl = useThree((state) => state.gl);
  const frames = useRef(0);
  // Seeded on the first frame rather than during render: reading a clock while
  // rendering is impure, and a re-render would silently reset the window.
  const since = useRef(0);

  useFrame(() => {
    const now = performance.now();

    if (since.current === 0) {
      since.current = now;
      return;
    }

    frames.current += 1;
    const elapsed = now - since.current;

    // Sample twice a second: often enough to be live, rarely enough that the
    // React state update is not itself a measurable cost.
    if (elapsed < 500) return;

    onSample({
      fps: Math.round((frames.current * 1000) / elapsed),
      triangles: gl.info.render.triangles,
      drawCalls: gl.info.render.calls,
    });

    frames.current = 0;
    since.current = now;
  });

  return null;
}

/**
 * Live weather for the in-scene overlay. `null` fields mean the measurement
 * was unavailable, and the overlay renders nothing rather than a default.
 */
export interface SceneWeather {
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  precipitating: boolean;
}

interface CitySceneProps {
  tiles: readonly LoadedTile[];
  layers: LayerVisibility;
  selectedBuilding: SnapshotBuilding | null;
  onSelectBuilding: (building: SnapshotBuilding) => void;
  onSelectFacility: (facility: SnapshotFacility) => void;
  resetNonce: number;
  focusTarget: readonly [number, number, number] | null;
  shadows: boolean;
  onStats: (stats: SceneStats) => void;
  weather: SceneWeather | null;
  airQualityMarkers: readonly AirQualityMarker[];
  /** 0..1 simulated traffic density. */
  trafficDensity: number;
  onTrafficStats?: (stats: TrafficStats) => void;
  transitRoutes: readonly TransitRoute[];
  transitStops: readonly TransitStop[];
  distanceByKey: ReadonlyMap<string, number>;
}

export function CityScene({
  tiles,
  layers,
  selectedBuilding,
  onSelectBuilding,
  onSelectFacility,
  resetNonce,
  focusTarget,
  shadows,
  onStats,
  weather,
  airQualityMarkers,
  trafficDensity,
  onTrafficStats,
  transitRoutes,
  transitStops,
  distanceByKey,
}: CitySceneProps) {
  // Memoised: TrafficLayer keys the road graph and the simulation on this
  // array, so a fresh identity each render would rebuild both.
  const roads = useMemo(() => tiles.flatMap((tile) => tile.roads), [tiles]);

  return (
    <>
      <color attach="background" args={['#060910']} />
      {/*
        Exponential fog matched to the page background makes distant tiles fade
        into the horizon instead of ending at a hard edge where the study area
        stops.
      */}
      <fogExp2 attach="fog" args={['#070b12', 0.00035]} />

      <CameraRig resetNonce={resetNonce} focusTarget={focusTarget} />
      <FrameMeter onSample={onStats} />

      {/*
        Lighting: a hemisphere light supplies sky/ground ambient so unlit
        facades do not read as black, and one directional light casts the
        shadows. Its shadow camera is fitted to the study area rather than left
        at the default, which would spread the shadow map over empty space.
      */}
      <hemisphereLight args={['#2b3a52', '#070b12', 0.9]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[480, 620, 300]}
        intensity={1.5}
        color="#f2f6ff"
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-820}
        shadow-camera-right={820}
        shadow-camera-top={820}
        shadow-camera-bottom={-820}
        shadow-camera-near={10}
        shadow-camera-far={2200}
        // Without a small negative bias, self-shadowing speckles appear on the
        // flat roofs at this shadow-map scale.
        shadow-bias={-0.0006}
      />

      {/* Ground. Large enough that its edge is never visible within the
          camera's boundary. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
        receiveShadow
      >
        <planeGeometry args={[6000, 6000]} />
        <meshLambertMaterial color="#0a0f18" />
      </mesh>

      <Grid
        position={[0, 0.01, 0]}
        args={[3000, 3000]}
        cellSize={50}
        cellThickness={0.5}
        cellColor="#13202f"
        sectionSize={250}
        sectionThickness={1}
        sectionColor="#1d3048"
        fadeDistance={2600}
        fadeStrength={1.4}
        infiniteGrid
      />

      {layers.green ? <GreenLayer tiles={tiles} /> : null}
      {layers.roads ? <RoadsLayer tiles={tiles} /> : null}
      {layers.buildings ? (
        <BuildingsLayer
          tiles={tiles}
          onSelect={onSelectBuilding}
          shadows={shadows}
          distanceByKey={distanceByKey}
        />
      ) : null}
      {layers.facilities ? (
        <FacilityMarkers tiles={tiles} onSelect={onSelectFacility} />
      ) : null}

      {layers.buildings ? (
        <SelectionHighlight building={selectedBuilding} />
      ) : null}

      {layers.traffic && roads.length > 0 ? (
        <TrafficLayer
          roads={roads}
          density={trafficDensity}
          showCongestion={layers.traffic}
          onStats={onTrafficStats}
        />
      ) : null}

      {layers.transit && transitRoutes.length > 0 ? (
        <TransitLayer
          routes={transitRoutes}
          stops={transitStops}
          showRoutes
          showStops
          showBuses
        />
      ) : null}

      {layers.airQuality && airQualityMarkers.length > 0 ? (
        <AirQualityOverlay markers={airQualityMarkers} />
      ) : null}

      {layers.weather && weather ? (
        <WeatherOverlay
          precipitationMm={weather.precipitationMm}
          windSpeedKmh={weather.windSpeedKmh}
          windDirectionDeg={weather.windDirectionDeg}
          precipitating={weather.precipitating}
        />
      ) : null}
    </>
  );
}
