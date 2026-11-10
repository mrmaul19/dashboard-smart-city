'use client';

import { CloudSun } from 'lucide-react';
import { ProvenanceBadge } from '@/components/ui/provenance-badge';
import { Skeleton } from '@/components/ui/states';
import { formatNumber, formatRelativeAge } from '@/lib/utils/format';
import { hasValue } from '@/types/data-envelope';
import { useWeather } from '../hooks/use-weather';
import { weatherCodeInfo, windCompass } from '../utils/wmo-codes';
import { WeatherAttribution } from './weather-attribution';

/**
 * Compact weather section for the right-hand information panel.
 *
 * Shares the query cache with the full weather view, so opening both costs one
 * upstream request, not two.
 */
export function WeatherPanelSection() {
  const { data, isPending, isError } = useWeather();

  return (
    <section className="border-b border-border-subtle p-3 last:border-b-0">
      <h3 className="panel-heading mb-2 flex items-center gap-1.5">
        <CloudSun className="size-3.5" aria-hidden="true" />
        Weather
      </h3>

      {isPending ? <Skeleton className="h-16 w-full" /> : null}

      {isError ? (
        <p className="text-[11px] text-dim">
          Open-Meteo could not be reached. Values are unavailable rather than
          estimated.
        </p>
      ) : null}

      {data ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-semibold text-fg">
                {hasValue(data.current.temperatureC)
                  ? formatNumber(data.current.temperatureC.value, 1)
                  : '—'}
              </span>
              <span className="text-xs text-muted">
                {data.current.temperatureC.unit ?? ''}
              </span>
            </div>
            <ProvenanceBadge envelope={data.current.temperatureC} />
          </div>

          {hasValue(data.current.weatherCode) ? (
            <p className="text-xs text-muted">
              {weatherCodeInfo(data.current.weatherCode.value).label}
            </p>
          ) : null}

          <dl className="readout space-y-0.5 text-[11px]">
            <div className="flex justify-between gap-2">
              <dt className="text-dim">Humidity</dt>
              <dd className="text-muted">
                {hasValue(data.current.humidityPct)
                  ? `${formatNumber(data.current.humidityPct.value, 0)}%`
                  : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-dim">Wind</dt>
              <dd className="text-muted">
                {hasValue(data.current.windSpeedKmh)
                  ? `${formatNumber(data.current.windSpeedKmh.value, 1)} km/h`
                  : '—'}
                {hasValue(data.current.windDirectionDeg)
                  ? ` ${windCompass(data.current.windDirectionDeg.value)}`
                  : ''}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-dim">Rain</dt>
              <dd className="text-muted">
                {hasValue(data.current.precipitationMm)
                  ? `${formatNumber(data.current.precipitationMm.value, 1)} mm`
                  : '—'}
              </dd>
            </div>
          </dl>

          <div className="flex items-center justify-between gap-2">
            <span className="readout text-[10px] text-dim">
              {data.current.temperatureC.measuredAt
                ? `measured ${formatRelativeAge(data.current.temperatureC.measuredAt)}`
                : 'no measurement time'}
            </span>
            <WeatherAttribution />
          </div>
        </div>
      ) : null}
    </section>
  );
}
