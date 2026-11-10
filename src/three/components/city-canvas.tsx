'use client';

import { Suspense } from 'react';
import { AdaptiveDpr, Preload } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import {
  CityScene,
  type SceneStats,
  type SceneWeather,
} from '@/three/scenes/city-scene';
import type { AirQualityMarker } from '@/three/objects/air-quality-overlay';
import type { TrafficStats } from '@/three/objects/traffic-layer';
import type {
  TransitRoute,
  TransitStop,
} from '@/features/transportation/types/transit-data';
import type { LoadedTile } from '@/features/city/hooks/use-city-data';
import type {
  SnapshotBuilding,
  SnapshotFacility,
} from '@/features/city/types/city-data';
import type { LayerVisibility } from '@/stores/city-store';

/**
 * The WebGL canvas.
 *
 * Data is fetched by the parent and passed in as props rather than queried
 * here: React Three Fiber renders its children through its own reconciler, so
 * React context from the surrounding tree (the TanStack Query provider) is not
 * something to rely on inside the canvas. Zustand is safe either way, being an
 * external store rather than a context, but keeping all data flow explicit
 * makes the boundary obvious.
 */

export interface CityCanvasProps {
  tiles: readonly LoadedTile[];
  layers: LayerVisibility;
  selectedBuilding: SnapshotBuilding | null;
  onSelectBuilding: (building: SnapshotBuilding) => void;
  onSelectFacility: (facility: SnapshotFacility) => void;
  onClearSelection: () => void;
  resetNonce: number;
  focusTarget: readonly [number, number, number] | null;
  shadows: boolean;
  onStats: (stats: SceneStats) => void;
  weather: SceneWeather | null;
  airQualityMarkers: readonly AirQualityMarker[];
  trafficDensity: number;
  onTrafficStats?: (stats: TrafficStats) => void;
  transitRoutes: readonly TransitRoute[];
  transitStops: readonly TransitStop[];
  distanceByKey: ReadonlyMap<string, number>;
}

export default function CityCanvas({
  onClearSelection,
  ...sceneProps
}: CityCanvasProps) {
  return (
    <Canvas
      shadows={sceneProps.shadows}
      // Cap the device pixel ratio: on a high-DPI display, rendering at native
      // resolution quadruples the fragment cost for little visible gain here.
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      // A tighter depth range gives the buffer more precision to separate
      // the near-coplanar ground layers (ground, grid, parks, roads), which
      // otherwise shimmer against each other at distance. The scene is only
      // ~1.6 km across, so 9000 of far plane bought nothing.
      camera={{ fov: 45, near: 2, far: 6000, position: [620, 430, 620] }}
      // Regression to 50% of the target frame rate is allowed before the
      // adaptive DPR kicks in, which keeps interaction responsive on weaker
      // GPUs instead of dropping frames.
      performance={{ min: 0.5 }}
      // A click that hits nothing clears the selection. Handling it here
      // avoids an invisible picking plane behind the city.
      onPointerMissed={onClearSelection}
    >
      <Suspense fallback={null}>
        <CityScene {...sceneProps} />
        <Preload all />
      </Suspense>
      <AdaptiveDpr pixelated />
    </Canvas>
  );
}
