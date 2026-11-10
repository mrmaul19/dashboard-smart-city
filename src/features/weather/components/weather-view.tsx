'use client';

import { useSyncExternalStore } from 'react';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ProvenanceBadge } from '@/components/ui/provenance-badge';
import { ErrorState, LoadingState, Skeleton } from '@/components/ui/states';
import { DEFAULT_CITY } from '@/lib/constants/cities';
import { formatCoordinates, formatNumber } from '@/lib/utils/format';
import { hasValue } from '@/types/data-envelope';
import { useWeather } from '../hooks/use-weather';
import {
  peakPrecipitation,
  upcomingDays,
  upcomingHours,
} from '../utils/series';
import { weatherCodeInfo, windCompass } from '../utils/wmo-codes';
import { CurrentConditions } from './current-conditions';
import { WeatherAttribution } from './weather-attribution';

/**
 * Weather view.
 *
 * Trimming the forecast to "from now on" needs the current time, which is an
 * external value: it is read through `useSyncExternalStore` with a null server
 * snapshot, so nothing time-dependent is evaluated during the prerender.
 * Re-reading once a minute is ample for deciding which hour the series starts
 * at.
 */
function subscribeToMinute(onChange: () => void): () => void {
  const id = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(id);
}

function minuteSnapshot(): number {
  return Math.floor(Date.now() / 60_000);
}

function serverSnapshot(): null {
  return null;
}

function useNow(): Date | null {
  const minute = useSyncExternalStore(
    subscribeToMinute,
    minuteSnapshot,
    serverSnapshot,
  );
  return minute === null ? null : new Date(minute * 60_000);
}

function hourLabel(localTime: string): string {
  // `2026-11-06T20:00` — the hour is already in the city's zone, so slicing is
  // correct and avoids re-deriving an instant just to format it back.
  return localTime.slice(11, 16);
}

function dayLabel(localDate: string, timezone: string): string {
  // Anchored at midday so a zone shift cannot move the label onto another day.
  const date = new Date(`${localDate}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: timezone,
  }).format(date);
}

export function WeatherView() {
  const { data, isPending, isError, error, isFetching } = useWeather();
  const now = useNow();

  if (isPending) {
    return (
      <div className="h-full space-y-3 overflow-y-auto p-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
        <LoadingState label="Fetching live weather" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        title="Weather data unavailable"
        description={
          error instanceof Error
            ? error.message
            : 'Open-Meteo could not be reached.'
        }
      />
    );
  }

  const timezone = data.location.timezone;
  const hourly = hasValue(data.forecast.hourly) ? data.forecast.hourly.value : [];
  const daily = hasValue(data.forecast.daily) ? data.forecast.daily.value : [];

  const hours = now ? upcomingHours(hourly, timezone, now, 24) : hourly.slice(0, 24);
  const days = now ? upcomingDays(daily, timezone, now) : daily;
  const peakRain = peakPrecipitation(hours);

  return (
    <div className="h-full space-y-3 overflow-y-auto p-3">
      <Panel flush>
        <PanelHeader
          title="Current conditions"
          subtitle={`${DEFAULT_CITY.name} · ${timezone}`}
          actions={
            isFetching ? (
              <span className="panel-heading text-accent-text">updating</span>
            ) : null
          }
        />
        <div className="p-3">
          <CurrentConditions snapshot={data.current} />
        </div>
      </Panel>

      {/*
        Open-Meteo resolves coordinates onto its model grid, so the values
        describe a nearby grid cell rather than the exact requested point. The
        difference is a couple of kilometres and is disclosed rather than
        hidden, since the panel is otherwise claiming to describe a location.
      */}
      <Panel flush>
        <PanelHeader title="Measurement location" subtitle="Model grid cell" />
        <dl className="readout grid grid-cols-1 gap-1 p-3 text-[11px] sm:grid-cols-3">
          <div className="flex justify-between gap-2">
            <dt className="text-dim">Requested</dt>
            <dd className="text-muted">
              {formatCoordinates(
                DEFAULT_CITY.center.lat,
                DEFAULT_CITY.center.lon,
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-dim">Resolved</dt>
            <dd className="text-muted">
              {formatCoordinates(data.location.lat, data.location.lon)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-dim">Elevation</dt>
            <dd className="text-muted">
              {data.location.elevationM === null
                ? 'unknown'
                : `${formatNumber(data.location.elevationM, 0)} m`}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel flush>
        <PanelHeader
          title="Next 24 hours"
          subtitle={
            peakRain > 0
              ? `bars show rainfall, peak ${formatNumber(peakRain, 1)} mm/h`
              : 'no rainfall forecast'
          }
          actions={<ProvenanceBadge envelope={data.forecast.hourly} />}
        />
        {hours.length > 0 ? (
          <div className="overflow-x-auto p-3">
            <table className="w-full min-w-max border-separate border-spacing-x-1">
              <caption className="sr-only">
                Hourly temperature and rainfall forecast for the next 24 hours
              </caption>
              <tbody>
                <tr>
                  {hours.map((hour) => (
                    <th
                      key={hour.time}
                      scope="col"
                      className="readout px-1 pb-1 text-[10px] font-normal text-dim"
                    >
                      {hourLabel(hour.time)}
                    </th>
                  ))}
                </tr>
                <tr>
                  {hours.map((hour) => (
                    <td
                      key={hour.time}
                      className="readout px-1 text-center text-[11px] text-fg"
                      title={weatherCodeInfo(hour.weatherCode).label}
                    >
                      {hour.temperatureC === null
                        ? '—'
                        : `${formatNumber(hour.temperatureC, 0)}°`}
                    </td>
                  ))}
                </tr>
                <tr>
                  {hours.map((hour) => {
                    const mm = hour.precipitationMm ?? 0;
                    // Bars share one scale, set by the window's peak, so their
                    // heights are comparable across the row.
                    const heightPct =
                      peakRain > 0 ? Math.max(mm > 0 ? 8 : 0, (mm / peakRain) * 100) : 0;
                    return (
                      <td key={hour.time} className="px-1 align-bottom">
                        <div
                          className="flex h-10 items-end justify-center"
                          title={`${formatNumber(mm, 1)} mm`}
                        >
                          <div
                            className="w-2 rounded-t-[2px] bg-accent/70"
                            style={{ height: `${heightPct}%` }}
                          />
                        </div>
                        <span className="sr-only">
                          {formatNumber(mm, 1)} mm rainfall
                        </span>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-3 text-xs text-dim">
            {data.forecast.hourly.note ?? 'No hourly series available.'}
          </p>
        )}
      </Panel>

      <Panel flush>
        <PanelHeader
          title="7-day forecast"
          actions={<ProvenanceBadge envelope={data.forecast.daily} />}
        />
        {days.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th scope="col" className="panel-heading p-2 text-left">Day</th>
                  <th scope="col" className="panel-heading p-2 text-left">Condition</th>
                  <th scope="col" className="panel-heading p-2 text-right">Min</th>
                  <th scope="col" className="panel-heading p-2 text-right">Max</th>
                  <th scope="col" className="panel-heading p-2 text-right">Rain</th>
                  <th scope="col" className="panel-heading p-2 text-right">Wind</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.date} className="border-b border-border-subtle/60">
                    <td className="readout p-2 text-muted">
                      {dayLabel(day.date, timezone)}
                    </td>
                    <td className="p-2 text-muted">
                      {weatherCodeInfo(day.weatherCode).label}
                    </td>
                    <td className="readout p-2 text-right text-muted">
                      {day.temperatureMinC === null
                        ? '—'
                        : `${formatNumber(day.temperatureMinC, 1)}°`}
                    </td>
                    <td className="readout p-2 text-right text-fg">
                      {day.temperatureMaxC === null
                        ? '—'
                        : `${formatNumber(day.temperatureMaxC, 1)}°`}
                    </td>
                    <td className="readout p-2 text-right text-muted">
                      {day.precipitationSumMm === null
                        ? '—'
                        : `${formatNumber(day.precipitationSumMm, 1)} mm`}
                    </td>
                    <td className="readout p-2 text-right text-muted">
                      {day.windSpeedMaxKmh === null
                        ? '—'
                        : `${formatNumber(day.windSpeedMaxKmh, 0)} km/h`}
                      {day.windDirectionDominantDeg === null
                        ? ''
                        : ` ${windCompass(day.windDirectionDominantDeg)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-3 text-xs text-dim">
            {data.forecast.daily.note ?? 'No daily series available.'}
          </p>
        )}
      </Panel>

      <div className="flex justify-end pb-1">
        <WeatherAttribution />
      </div>
    </div>
  );
}
