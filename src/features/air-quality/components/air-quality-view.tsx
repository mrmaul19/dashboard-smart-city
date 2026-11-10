'use client';

import { KeyRound, MapPin, Wind } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ProvenanceBadge } from '@/components/ui/provenance-badge';
import { StatTile } from '@/components/ui/stat-tile';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from '@/components/ui/states';
import { DEFAULT_CITY } from '@/lib/constants/cities';
import {
  formatCoordinates,
  formatInteger,
  formatNumber,
  formatRelativeAge,
} from '@/lib/utils/format';
import { unavailableValue } from '@/types/data-envelope';
import { SOURCE_OPENAQ } from '@/lib/constants/data-sources';
import { useAirQuality } from '../hooks/use-air-quality';
import type { PollutantKey } from '../types/air-quality';
import { AqiCard } from './aqi-card';

const POLLUTANT_ORDER: readonly PollutantKey[] = [
  'pm25',
  'pm10',
  'o3',
  'no2',
  'so2',
  'co',
];

const POLLUTANT_LABELS: Record<PollutantKey, string> = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  o3: 'Ozone (O₃)',
  no2: 'Nitrogen dioxide (NO₂)',
  so2: 'Sulphur dioxide (SO₂)',
  co: 'Carbon monoxide (CO)',
};

export function AirQualityView() {
  const { data, isPending, isError, error } = useAirQuality();

  if (isPending) {
    return (
      <div className="h-full space-y-3 overflow-y-auto p-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
        <LoadingState label="Querying OpenAQ monitoring stations" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        title="Air quality data unavailable"
        description={
          error instanceof Error ? error.message : 'OpenAQ could not be reached.'
        }
      />
    );
  }

  // No key configured: the whole feature is honestly unavailable, with the
  // exact remedy rather than a generic failure.
  if (!data.keyConfigured) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="panel max-w-md space-y-3 p-5 text-center">
          <KeyRound className="mx-auto size-5 text-sim" aria-hidden="true" />
          <h2 className="text-sm font-medium text-fg">
            OpenAQ API key not configured
          </h2>
          <p className="text-xs leading-relaxed text-muted">
            Air-quality measurements need a free OpenAQ API key. Register at{' '}
            <a
              href="https://explore.openaq.org/register"
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent-text underline decoration-dotted underline-offset-2"
            >
              explore.openaq.org/register
            </a>
            , then add it to <code className="readout">.env.local</code> as{' '}
            <code className="readout">OPENAQ_API_KEY</code> and restart the dev
            server.
          </p>
          <p className="text-[11px] text-dim">
            Nothing is estimated in the meantime — every pollutant reads as
            unavailable.
          </p>
          <div className="flex justify-center">
            <ProvenanceBadge envelope={data.aqi} />
          </div>
        </div>
      </div>
    );
  }

  const primary = data.stations.find(
    (station) => station.id === data.primaryStationId,
  );

  return (
    <div className="h-full space-y-3 overflow-y-auto p-3">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,20rem)_1fr]">
        <Panel flush>
          <PanelHeader title="Air quality index" subtitle="US EPA" />
          <div className="p-3">
            <AqiCard envelope={data.aqi} excluded={data.excluded} />
          </div>
        </Panel>

        <Panel flush>
          <PanelHeader
            title="Pollutant measurements"
            subtitle={
              primary ? `${primary.name}` : `${data.stationCount} station(s)`
            }
          />
          <div className="grid grid-cols-2 gap-3 p-3 lg:grid-cols-3">
            {POLLUTANT_ORDER.map((pollutant) => {
              const envelope =
                data.readings[pollutant] ??
                unavailableValue<number>({
                  source: SOURCE_OPENAQ,
                  note: 'Not measured at this station.',
                });

              return (
                <StatTile
                  key={pollutant}
                  label={POLLUTANT_LABELS[pollutant]}
                  envelope={envelope}
                  icon={Wind}
                  format={(value) => formatNumber(value, 1)}
                  deltaGoodDirection="down"
                />
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel flush>
        <PanelHeader
          title="Monitoring stations"
          subtitle={`within ${formatInteger(data.searchRadiusM / 1000)} km of the city centre`}
          actions={
            data.rateLimit?.remaining !== null &&
            data.rateLimit?.remaining !== undefined ? (
              <span className="readout text-[10px] text-dim">
                quota {data.rateLimit.remaining} left
              </span>
            ) : null
          }
        />

        {data.stations.length === 0 ? (
          <EmptyState
            title="No monitoring stations in range"
            description={`OpenAQ lists no station within ${formatInteger(data.searchRadiusM / 1000)} km of ${DEFAULT_CITY.name}. ${
              data.searchRadiusM >= 25000
                ? 'That radius is already the API maximum, so no nearer data exists to show.'
                : ''
            }`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th scope="col" className="panel-heading p-2 text-left">Station</th>
                  <th scope="col" className="panel-heading p-2 text-left">Provider</th>
                  <th scope="col" className="panel-heading p-2 text-right">Distance</th>
                  <th scope="col" className="panel-heading p-2 text-left">Pollutants</th>
                  <th scope="col" className="panel-heading p-2 text-right">Last report</th>
                </tr>
              </thead>
              <tbody>
                {data.stations.map((station) => {
                  const pollutants = POLLUTANT_ORDER.filter(
                    (pollutant) => station.sensors[pollutant],
                  );

                  return (
                    <tr
                      key={station.id}
                      className={
                        station.id === data.primaryStationId
                          ? 'border-b border-border-subtle/60 bg-accent-soft/40'
                          : 'border-b border-border-subtle/60'
                      }
                    >
                      <td className="p-2">
                        <span className="text-fg">{station.name}</span>
                        {station.coordinates ? (
                          <span className="readout block text-[10px] text-dim">
                            {formatCoordinates(
                              station.coordinates.lat,
                              station.coordinates.lon,
                            )}
                          </span>
                        ) : null}
                        {/* Per-station attribution is the binding credit. */}
                        {station.attribution ? (
                          <span className="block text-[10px] text-dim">
                            {station.attributionUrl ? (
                              <a
                                href={station.attributionUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="underline decoration-dotted underline-offset-2"
                              >
                                {station.attribution}
                              </a>
                            ) : (
                              station.attribution
                            )}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-2 text-muted">
                        {station.provider ?? '—'}
                      </td>
                      <td className="readout p-2 text-right text-muted">
                        {station.distanceM === null
                          ? '—'
                          : `${formatNumber(station.distanceM / 1000, 1)} km`}
                      </td>
                      <td className="readout p-2 text-muted">
                        {pollutants.length > 0
                          ? pollutants
                              .map((p) => POLLUTANT_LABELS[p].split(' ')[0])
                              .join(', ')
                          : '—'}
                      </td>
                      <td className="readout p-2 text-right text-muted">
                        {station.datetimeLast
                          ? formatRelativeAge(station.datetimeLast)
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/*
        Spec §7 forbids inventing a geographic pollution distribution from a
        single measurement, so this states plainly what the numbers cover.
      */}
      <Panel>
        <p className="flex items-start gap-2 text-[11px] leading-snug text-muted">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-dim" aria-hidden="true" />
          <span>
            Readings describe the individual monitoring stations listed above,
            not the whole city. No pollution surface is interpolated between
            stations, and no heatmap is drawn from a single measurement.
          </span>
        </p>
      </Panel>
    </div>
  );
}
