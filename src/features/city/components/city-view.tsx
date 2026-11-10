'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Crosshair, Loader2 } from 'lucide-react';
import { ProvenanceBadge } from '@/components/ui/provenance-badge';
import { ErrorState } from '@/components/ui/states';
import { DEFAULT_CITY } from '@/lib/constants/cities';
import { formatInteger } from '@/lib/utils/format';
import { useCityStore } from '@/stores/city-store';
import { useWeather } from '@/features/weather/hooks/use-weather';
import { useAirQuality } from '@/features/air-quality/hooks/use-air-quality';
import { useTransit } from '@/features/transportation/hooks/use-transit';
import type { TrafficStats } from '@/three/objects/traffic-layer';
import { AQI_COLOURS } from '@/features/air-quality/utils/aqi-palette';
import type { AirQualityMarker } from '@/three/objects/air-quality-overlay';
import { weatherCodeInfo } from '@/features/weather/utils/wmo-codes';
import { hasValue } from '@/types/data-envelope';
import {
  FACILITY_GROUP_COLOURS,
  FACILITY_GROUP_LABELS,
  type FacilityGroup,
} from '@/three/objects/facility-markers';
import type { SceneStats } from '@/three/scenes/city-scene';
import { useCityManifest, useCityTiles } from '../hooks/use-city-data';
import type { SnapshotBuilding, SnapshotFacility } from '../types/city-data';

/**
 * 3D city view.
 *
 * The canvas is loaded lazily with SSR disabled (spec §10): three.js and the
 * renderer are a large bundle with no server-side meaning, and importing them
 * eagerly would make them part of the dashboard's first load even for a user
 * who never opens this view.
 */
const CityCanvas = dynamic(() => import('@/three/components/city-canvas'), {
  ssr: false,
  loading: () => <CanvasSkeleton />,
});

function CanvasSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Preparing 3D renderer…
      </div>
    </div>
  );
}

const EMPTY_ROUTES: readonly never[] = [];
const EMPTY_STOPS: readonly never[] = [];

const FACILITY_GROUPS: readonly FacilityGroup[] = [
  'health',
  'education',
  'worship',
  'civic',
];

export function CityView() {
  const cityId = useCityStore((s) => s.cityId);
  const layers = useCityStore((s) => s.layers);
  const selectedBuilding = useCityStore((s) => s.selectedBuilding);
  const selectBuilding = useCityStore((s) => s.selectBuilding);
  const select = useCityStore((s) => s.select);
  const focusOn = useCityStore((s) => s.focusOn);
  const focusTarget = useCityStore((s) => s.focusTarget);
  const resetNonce = useCityStore((s) => s.cameraResetNonce);
  const resetCamera = useCityStore((s) => s.resetCamera);

  const [stats, setStats] = useState<SceneStats | null>(null);
  const [shadows, setShadows] = useState(true);

  const manifestQuery = useCityManifest(cityId);
  const manifest = manifestQuery.data;
  const { tiles, loadedCount, totalCount, isComplete } = useCityTiles(
    cityId,
    manifest,
  );

  const handleSelectBuilding = useCallback(
    (building: SnapshotBuilding) => {
      selectBuilding(building);
      // Centre the camera on the footprint, at half its height, so the
      // selection is framed rather than merely highlighted.
      focusOn([building.centroid[0], building.heightM, building.centroid[1]]);
    },
    [selectBuilding, focusOn],
  );

  const handleSelectFacility = useCallback(
    (facility: SnapshotFacility) => {
      select({
        kind: 'facility',
        id: facility.id,
        label: facility.name ?? `${facility.category} ${facility.osmId}`,
      });
      focusOn([facility.position[0], 20, facility.position[1]]);
    },
    [select, focusOn],
  );

  const handleClearSelection = useCallback(() => {
    select(null);
  }, [select]);

  // Shares the weather query cache with the weather view and the information
  // panel, so the in-scene rain costs no extra upstream request.
  const { data: weather } = useWeather();

  const sceneWeather = useMemo(() => {
    if (!weather) return null;
    const { precipitationMm, windSpeedKmh, windDirectionDeg, weatherCode } =
      weather.current;

    return {
      precipitationMm: hasValue(precipitationMm) ? precipitationMm.value : null,
      windSpeedKmh: hasValue(windSpeedKmh) ? windSpeedKmh.value : null,
      windDirectionDeg: hasValue(windDirectionDeg) ? windDirectionDeg.value : null,
      precipitating: hasValue(weatherCode)
        ? weatherCodeInfo(weatherCode.value).precipitating
        : false,
    };
  }, [weather]);

  const { data: air } = useAirQuality();
  const { data: transit } = useTransit(cityId);
  const trafficDensity = useCityStore((s) => s.trafficDensity);
  const [trafficStats, setTrafficStats] = useState<TrafficStats | null>(null);

  // Station markers are placed at their real projected coordinates. Only the
  // primary station has readings; the rest are drawn as positions only, which
  // is honest about what is known where.
  const airQualityMarkers = useMemo<readonly AirQualityMarker[]>(() => {
    if (!air) return [];
    const colour = hasValue(air.aqi) ? AQI_COLOURS[air.aqi.value.categoryId] : null;
    const pm25 = air.readings.pm25;

    // flatMap rather than filter+map, so the coordinate check narrows the
    // type instead of needing a non-null assertion.
    return air.stations.flatMap<AirQualityMarker>((station) => {
      const coordinates = station.coordinates;
      if (coordinates === null) return [];

      const isPrimary = station.id === air.primaryStationId;
      return [
        {
          id: station.id,
          name: station.name,
          lat: coordinates.lat,
          lon: coordinates.lon,
          pm25: isPrimary && pm25 && hasValue(pm25) ? pm25.value : null,
          colour: isPrimary ? colour : null,
          isPrimary,
        },
      ];
    });
  }, [air]);

  const heightCoverage = useMemo(() => {
    if (!manifest) return null;
    const { osmHeight, osmLevels, derived } = manifest.heightTagCoverage;
    const total = osmHeight + osmLevels + derived;
    if (total === 0) return null;
    return {
      taggedPct: ((osmHeight + osmLevels) / total) * 100,
      derived,
    };
  }, [manifest]);

  if (manifestQuery.isError) {
    return (
      <ErrorState
        title="City snapshot unavailable"
        description={
          `The geometry snapshot for ${DEFAULT_CITY.name} could not be loaded. ` +
          'Run `npm run data:city` to generate it, then reload.'
        }
      />
    );
  }

  return (
    <div className="relative h-full w-full">
      <CityCanvas
        tiles={tiles}
        layers={layers}
        selectedBuilding={selectedBuilding}
        onSelectBuilding={handleSelectBuilding}
        onSelectFacility={handleSelectFacility}
        onClearSelection={handleClearSelection}
        resetNonce={resetNonce}
        focusTarget={focusTarget}
        shadows={shadows}
        onStats={setStats}
        weather={sceneWeather}
        airQualityMarkers={airQualityMarkers}
        trafficDensity={trafficDensity}
        onTrafficStats={setTrafficStats}
        transitRoutes={transit?.routes ?? EMPTY_ROUTES}
        transitStops={transit?.stops ?? EMPTY_STOPS}
      />

      {/*
        Provenance strip. The 3D city mixes classifications: footprints and
        road centrelines are real OSM geometry, while almost every height is
        derived. Spec §11 requires that distinction be visible, not buried in
        documentation.
      */}
      <div className="pointer-events-none absolute top-3 left-3 flex max-w-[min(26rem,calc(100%-1.5rem))] flex-col gap-1.5">
        <div className="panel pointer-events-auto flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5">
          <ProvenanceBadge provenance="REAL" />
          <span className="text-[11px] text-muted">
            Footprints, roads and facilities from OpenStreetMap
          </span>
        </div>
        {layers.traffic && trafficStats ? (
          <div className="panel pointer-events-auto flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5">
            <ProvenanceBadge provenance="SIMULATED" />
            <span className="text-[11px] text-muted">
              {formatInteger(trafficStats.vehicleCount)} vehicles and congestion
              are generated locally — not measured traffic
            </span>
          </div>
        ) : null}
        <div className="panel pointer-events-auto flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5">
          <ProvenanceBadge provenance="STATIC" />
          <span className="text-[11px] text-muted">
            {heightCoverage
              ? `Building heights are estimated — only ${heightCoverage.taggedPct.toFixed(1)}% carry an OSM height tag`
              : 'Building heights are estimated, not measured'}
          </span>
        </div>
      </div>

      {/* Renderer statistics, so the cost of the scene is observable. */}
      <div className="panel absolute top-3 right-3 px-2.5 py-1.5">
        <dl className="readout grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-[10px]">
          <dt className="text-dim">fps</dt>
          <dd className="text-right text-muted">{stats?.fps ?? '—'}</dd>
          <dt className="text-dim">tris</dt>
          <dd className="text-right text-muted">
            {stats ? formatInteger(stats.triangles) : '—'}
          </dd>
          <dt className="text-dim">calls</dt>
          <dd className="text-right text-muted">{stats?.drawCalls ?? '—'}</dd>
          <dt className="text-dim">tiles</dt>
          <dd className="text-right text-muted">
            {loadedCount}/{totalCount || '—'}
          </dd>
        </dl>
      </div>

      <div className="absolute bottom-3 left-3 flex flex-col gap-1.5">
        {/* Facility legend: identity never rests on marker colour alone. */}
        {layers.facilities ? (
          <div className="panel flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5">
            {FACILITY_GROUPS.map((group) => (
              <span key={group} className="flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: FACILITY_GROUP_COLOURS[group] }}
                  aria-hidden="true"
                />
                <span className="text-[10px] text-muted">
                  {FACILITY_GROUP_LABELS[group]}
                </span>
              </span>
            ))}
          </div>
        ) : null}

        {manifest ? (
          <p className="readout text-[10px] text-dim">
            {formatInteger(manifest.counts.buildings)} buildings ·{' '}
            {formatInteger(manifest.counts.roads)} roads ·{' '}
            {formatInteger(manifest.counts.facilities)} facilities · snapshot{' '}
            {manifest.generatedAt.slice(0, 10)}
          </p>
        ) : null}
      </div>

      <div className="absolute right-3 bottom-3 flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={resetCamera}
          className="panel flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-muted hover:text-fg"
        >
          <Crosshair className="size-3.5" aria-hidden="true" />
          Reset camera
        </button>
        <button
          type="button"
          onClick={() => setShadows((on) => !on)}
          aria-pressed={shadows}
          className="panel px-2.5 py-1.5 text-[11px] text-muted hover:text-fg"
        >
          Shadows: {shadows ? 'on' : 'off'}
        </button>
      </div>

      {!isComplete && totalCount > 0 ? (
        <div className="panel absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 px-3 py-1.5">
          <Loader2 className="size-3.5 animate-spin text-accent" aria-hidden="true" />
          <span className="text-[11px] text-muted">
            Loading geometry {loadedCount}/{totalCount}
          </span>
        </div>
      ) : null}
    </div>
  );
}
