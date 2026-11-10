'use client';

import { Database } from 'lucide-react';
import { useAirQuality } from '@/features/air-quality/hooks/use-air-quality';
import { useWeather } from '@/features/weather/hooks/use-weather';
import { useCityManifest } from '@/features/city/hooks/use-city-data';
import { useTransit } from '@/features/transportation/hooks/use-transit';
import { cn } from '@/lib/utils/cn';
import { useCityStore } from '@/stores/city-store';

type WiringStatus =
  | 'connected'
  | 'failing'
  | 'pending'
  | 'key-required'
  | 'no-data';

interface SourceRow {
  readonly name: string;
  readonly detail: string;
  readonly status: WiringStatus;
  readonly phase: number;
}

const STATUS_COPY: Record<WiringStatus, { label: string; className: string }> = {
  connected: { label: 'Connected', className: 'text-real' },
  failing: { label: 'Failing', className: 'text-danger' },
  pending: { label: 'Not wired', className: 'text-na' },
  'key-required': { label: 'Key needed', className: 'text-sim' },
  // Connected and answering, but the provider has nothing for this area.
  'no-data': { label: 'No stations', className: 'text-na' },
};

/**
 * Which data services are actually serving data, with the usage limits
 * verified against each provider's documentation on 2026-11-06.
 *
 * Wired-up sources report their real query state, so a provider outage shows
 * here as "Failing" rather than being hidden behind a stale label. Keeping the
 * published limits visible is what stops a later phase from quietly exceeding
 * them.
 */
export function DataSourceStatus() {
  const cityId = useCityStore((s) => s.cityId);
  const weather = useWeather();
  const airQuality = useAirQuality();
  const manifest = useCityManifest(cityId);
  const transit = useTransit(cityId);

  const sources: readonly SourceRow[] = [
    {
      name: 'Open-Meteo',
      detail: 'No key · 10k/day, 5k/h, 600/min · cached 10 min',
      status: weather.isError
        ? 'failing'
        : weather.isSuccess
          ? 'connected'
          : 'pending',
      phase: 3,
    },
    {
      name: 'OpenAQ v3',
      detail: airQuality.data?.keyConfigured
        ? `${airQuality.data.stationCount} station(s) within ${Math.round(airQuality.data.searchRadiusM / 1000)} km · 60/min, 2k/h`
        : 'API key required · 60/min, 2k/h',
      status: !airQuality.data?.keyConfigured
        ? 'key-required'
        : airQuality.isError
          ? 'failing'
          : airQuality.data.stationCount > 0
            ? 'connected'
            : 'no-data',
      phase: 4,
    },
    {
      name: 'OpenStreetMap / Overpass',
      detail: manifest.data
        ? `Snapshot ${manifest.data.generatedAt.slice(0, 10)} · ${manifest.data.counts.buildings.toLocaleString('en-GB')} buildings`
        : 'Snapshot build · 10k queries & 1 GB per day',
      status: manifest.isError
        ? 'failing'
        : manifest.isSuccess
          ? 'connected'
          : 'pending',
      phase: 2,
    },
    {
      name: 'Transjakarta GTFS',
      detail: transit.data
        ? `${transit.data.routes.length} routes in view of ${transit.data.manifest.feedTotals.routes} citywide`
        : 'Static feed · no realtime feed exists',
      status: transit.isError
        ? 'failing'
        : transit.isSuccess
          ? 'connected'
          : 'pending',
      phase: 5,
    },
  ];

  return (
    <section className="border-b border-border-subtle p-3 last:border-b-0">
      <h3 className="panel-heading mb-2 flex items-center gap-1.5">
        <Database className="size-3.5" aria-hidden="true" />
        Data sources
      </h3>

      <ul className="flex flex-col gap-2">
        {sources.map((source) => {
          const status = STATUS_COPY[source.status];
          return (
            <li key={source.name} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs text-fg">{source.name}</p>
                <p className="readout truncate text-[10px] text-dim">
                  {source.detail}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 font-mono text-[10px] tracking-wider uppercase',
                  status.className,
                )}
                title={`Delivered in phase ${source.phase}`}
              >
                {status.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
