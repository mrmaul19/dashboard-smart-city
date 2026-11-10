'use client';

import { useState } from 'react';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ProvenanceBadge } from '@/components/ui/provenance-badge';
import { ErrorState, LoadingState } from '@/components/ui/states';
import {
  seriesStats,
  TimeSeriesChart,
} from '@/components/charts/time-series-chart';
import { useAirQuality } from '@/features/air-quality/hooks/use-air-quality';
import { useTransit } from '@/features/transportation/hooks/use-transit';
import { useWeather } from '@/features/weather/hooks/use-weather';
import {
  usePollutantTrend,
  useTrafficTrend,
  useWeatherTrend,
  type TrendRange,
} from '../hooks/use-trends';
import { DEFAULT_CITY } from '@/lib/constants/cities';
import { formatInteger, formatNumber } from '@/lib/utils/format';
import { useCityStore } from '@/stores/city-store';

/**
 * Analytics view.
 *
 * Every chart states where its series came from. Three different provenances
 * appear on this page and they are not interchangeable:
 *
 * - Weather trends are REAL, from a week of Open-Meteo hourly data.
 * - Pollutant trends are REAL when a station reports them, and absent
 *   otherwise — never interpolated to fill the chart.
 * - The traffic profile is SIMULATED, and is a model rather than a recording.
 */

const RANGES: readonly { id: TrendRange; label: string }[] = [
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
];

function StatsRow({
  stats,
  unit,
  precision = 1,
}: {
  stats: { min: number; max: number; mean: number; count: number } | null;
  unit: string;
  precision?: number;
}) {
  if (!stats) return null;

  return (
    <dl className="readout flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
      {[
        ['min', stats.min],
        ['mean', stats.mean],
        ['max', stats.max],
      ].map(([label, value]) => (
        <div key={String(label)} className="flex gap-1.5">
          <dt className="text-dim">{label}</dt>
          <dd className="text-muted">
            {formatNumber(value as number, precision)} {unit}
          </dd>
        </div>
      ))}
      <div className="flex gap-1.5">
        <dt className="text-dim">points</dt>
        <dd className="text-muted">{formatInteger(stats.count)}</dd>
      </div>
    </dl>
  );
}

export function AnalyticsView() {
  const cityId = useCityStore((s) => s.cityId);

  const [range, setRange] = useState<TrendRange>('24h');

  const weather = useWeather();
  const air = useAirQuality();
  const transit = useTransit(cityId);

  const { rows: weatherRows } = useWeatherTrend(range);
  const pollutants = usePollutantTrend(range);
  const trafficRows = useTrafficTrend();

  if (weather.isPending && air.isPending) {
    return <LoadingState label="Loading trend data" />;
  }

  if (weather.isError && air.isError) {
    return (
      <ErrorState
        title="No trend data available"
        description="Neither the weather nor the air-quality service could be reached."
      />
    );
  }

  return (
    <div className="h-full space-y-3 overflow-y-auto p-3">
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label="Time range"
      >
        <span className="panel-heading mr-1">Range</span>
        {RANGES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setRange(item.id)}
            aria-pressed={range === item.id}
            className={
              range === item.id
                ? 'rounded border border-accent/40 bg-accent-soft px-2.5 py-1 text-[11px] text-accent-text'
                : 'rounded border border-transparent px-2.5 py-1 text-[11px] text-muted hover:bg-surface-2 hover:text-fg'
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
        <Panel flush>
          <PanelHeader
            title="Air temperature"
            subtitle={`Open-Meteo hourly · ${DEFAULT_CITY.timezone}`}
            actions={
              <ProvenanceBadge
                envelope={weather.data?.forecast.hourly}
                provenance="REAL"
              />
            }
          />
          <div className="p-3">
            <TimeSeriesChart
              rows={weatherRows}
              series={[{ key: 'temperature', label: 'Temperature', unit: '°C' }]}
              footnote="Weather data by Open-Meteo.com (CC-BY 4.0)"
            />
            <StatsRow stats={seriesStats(weatherRows, 'temperature')} unit="°C" />
          </div>
        </Panel>

        <Panel flush>
          <PanelHeader
            title="Relative humidity"
            subtitle="Open-Meteo hourly"
            actions={
              <ProvenanceBadge
                envelope={weather.data?.forecast.hourly}
                provenance="REAL"
              />
            }
          />
          <div className="p-3">
            <TimeSeriesChart
              rows={weatherRows}
              series={[{ key: 'humidity', label: 'Humidity', unit: '%' }]}
              precision={0}
              footnote="Weather data by Open-Meteo.com (CC-BY 4.0)"
            />
            <StatsRow
              stats={seriesStats(weatherRows, 'humidity')}
              unit="%"
              precision={0}
            />
          </div>
        </Panel>

        <Panel flush>
          <PanelHeader
            title="Particulate matter"
            subtitle={
              pollutants.series.length > 0
                ? 'OpenAQ hourly means'
                : 'no station series available'
            }
            actions={<ProvenanceBadge envelope={air.data?.aqi} provenance="REAL" />}
          />
          <div className="p-3">
            {pollutants.series.length > 0 ? (
              <>
                <TimeSeriesChart
                  rows={pollutants.rows}
                  series={pollutants.series}
                  footnote="Hourly aggregates from the nearest reporting station. Gaps are gaps — missing hours are not interpolated."
                />
                <StatsRow
                  stats={seriesStats(pollutants.rows, 'pm25')}
                  unit="µg/m³"
                />
              </>
            ) : (
              <p className="p-4 text-center text-[11px] leading-relaxed text-dim">
                {pollutants.emptyReason ?? 'Loading station history…'}
              </p>
            )}
          </div>
        </Panel>

        <Panel flush>
          <PanelHeader
            title="Traffic density"
            subtitle="modelled daily profile"
            actions={<ProvenanceBadge provenance="SIMULATED" />}
          />
          <div className="p-3">
            <TimeSeriesChart
              rows={trafficRows}
              series={[{ key: 'density', label: 'Density', unit: '%' }]}
              precision={0}
              footnote="Not a measurement and not a recording: a twin-peak daily model scaled by the current density setting. No open historical congestion data exists for Jakarta."
            />
            <StatsRow
              stats={seriesStats(trafficRows, 'density')}
              unit="%"
              precision={0}
            />
          </div>
        </Panel>
      </div>

      <Panel flush>
        <PanelHeader
          title="Transportation statistics"
          subtitle="Transjakarta GTFS"
          actions={<ProvenanceBadge provenance="REAL" />}
        />
        {transit.data ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 p-3 lg:grid-cols-4">
            {[
              ['Routes in view', formatInteger(transit.data.routes.length)],
              ['Stops in view', formatInteger(transit.data.stops.length)],
              [
                'Median headway',
                (() => {
                  const values = transit.data.routes
                    .map((route) => route.headwaySec)
                    .filter((value): value is number => value !== null)
                    .sort((a, b) => a - b);
                  if (values.length === 0) return '—';
                  const middle = values[Math.floor(values.length / 2)];
                  return `${formatNumber(middle / 60, 0)} min`;
                })(),
              ],
              [
                'Corridor length',
                `${formatNumber(
                  transit.data.routes.reduce(
                    (sum, route) =>
                      sum +
                      route.fragments.reduce((inner, f) => inner + f.lengthM, 0),
                    0,
                  ) / 1000,
                  1,
                )} km`,
              ],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-[10px] text-dim">{label}</dt>
                <dd className="readout text-sm text-fg">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="p-3 text-[11px] text-dim">
            Transit snapshot not loaded.
          </p>
        )}
      </Panel>
    </div>
  );
}
