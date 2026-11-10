'use client';

import { useMemo } from 'react';
import type { ChartRow } from '@/components/charts/time-series-chart';
import { useAirQuality } from '@/features/air-quality/hooks/use-air-quality';
import { diurnalDensityProfile } from '@/features/traffic/utils/density-profile';
import { useWeather } from '@/features/weather/hooks/use-weather';
import { localHourKey } from '@/features/weather/utils/series';
import { DEFAULT_CITY } from '@/lib/constants/cities';
import { hasValue } from '@/types/data-envelope';
import { useCityStore } from '@/stores/city-store';

/**
 * Trend series, shared by the analytics view and the bottom analytics panel.
 *
 * Both surfaces plot the same data, so the awkward parts — finding where the
 * past ends and the forecast begins, and merging two pollutant series without
 * shifting either — live here once rather than in two implementations that
 * could drift apart.
 */

export type TrendRange = '24h' | '7d';

export const TREND_RANGE_HOURS: Record<TrendRange, number> = {
  '24h': 24,
  '7d': 168,
};

/** Short x-axis label for an Open-Meteo local hour, e.g. `2026-11-10T14:00`. */
function hourLabel(localTime: string, range: TrendRange): string {
  const time = localTime.slice(11, 16);
  if (range === '24h') return time;
  // Over a week the day matters more than the hour.
  return `${localTime.slice(8, 10)}/${localTime.slice(5, 7)} ${time}`;
}

/**
 * Weather history, trimmed to end at the current hour.
 *
 * The request covers 7 past days plus 7 forecast days. A trend chart must show
 * what happened, not what is predicted, so the forecast tail is cut off at the
 * hour of the latest current-conditions measurement.
 */
export function useWeatherTrend(range: TrendRange): {
  rows: ChartRow[];
  isPending: boolean;
  isError: boolean;
} {
  const { data, isPending, isError } = useWeather();
  const hours = TREND_RANGE_HOURS[range];

  const rows = useMemo<ChartRow[]>(() => {
    if (!data || !hasValue(data.forecast.hourly)) return [];

    const series = data.forecast.hourly.value;
    const measuredAt = data.current.temperatureC.measuredAt;

    let cutoff = series.length;
    if (measuredAt) {
      // `localHourKey` produces exactly Open-Meteo's own local-time shape
      // (`YYYY-MM-DDTHH:00`), so finding the current hour is a plain string
      // comparison. Building the key by hand here previously omitted the
      // minutes, which made `"...T15:00" > "...T15"` true and silently
      // dropped the current hour from every chart.
      const localNow = localHourKey(new Date(measuredAt), data.location.timezone);

      // Strictly greater, so the current hour is included: it is the most
      // recent reading, and a trend should reach the present.
      const index = series.findIndex((point) => point.time > localNow);
      if (index > 0) cutoff = index;
    }

    return series
      .slice(Math.max(0, cutoff - hours), cutoff)
      .map((point) => ({
        label: hourLabel(point.time, range),
        title: point.time.replace('T', ' '),
        temperature: point.temperatureC,
        humidity: point.humidityPct,
        precipitation: point.precipitationMm,
      }));
  }, [data, hours, range]);

  return { rows, isPending, isError };
}

export interface PollutantTrend {
  rows: ChartRow[];
  /** Series present in the data, in validated colour-slot order. */
  series: { key: string; label: string; unit: string }[];
  /** Why there is nothing to plot, when there is nothing to plot. */
  emptyReason: string | null;
  isPending: boolean;
}

/** Particulate history from the nearest reporting station. */
export function usePollutantTrend(range: TrendRange): PollutantTrend {
  const { data, isPending } = useAirQuality();
  const hours = TREND_RANGE_HOURS[range];

  return useMemo<PollutantTrend>(() => {
    if (!data) {
      return { rows: [], series: [], emptyReason: null, isPending };
    }

    if (!data.keyConfigured) {
      return {
        rows: [],
        series: [],
        emptyReason:
          'No OpenAQ API key is configured, so no pollutant history can be requested.',
        isPending,
      };
    }

    const pm25 = data.history.pm25 ?? [];
    const pm10 = data.history.pm10 ?? [];

    if (pm25.length === 0 && pm10.length === 0) {
      return {
        rows: [],
        series: [],
        emptyReason:
          data.stationCount === 0
            ? `No monitoring station within ${Math.round(data.searchRadiusM / 1000)} km.`
            : 'No hourly particulate series is available from the stations in range.',
        isPending,
      };
    }

    // Union of timestamps: a pollutant missing an hour leaves a gap rather
    // than shifting the other series along the axis.
    const byTime = new Map<string, Record<string, string | number | null>>();
    const upsert = (time: string): Record<string, string | number | null> => {
      let row = byTime.get(time);
      if (!row) {
        row = {
          label: time.slice(11, 16),
          title: time.replace('T', ' ').replace('Z', ' UTC'),
        };
        byTime.set(time, row);
      }
      return row;
    };

    for (const point of pm25) upsert(point.time).pm25 = point.value;
    for (const point of pm10) upsert(point.time).pm10 = point.value;

    const rows = [...byTime.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, row]) => row as ChartRow)
      .slice(-hours);

    // Slot order matters: PM2.5 takes slot 0 and PM10 slot 1, which is the
    // colour pair validated for co-plotting.
    const series = [
      ...(pm25.length > 0
        ? [{ key: 'pm25', label: 'PM2.5', unit: 'µg/m³' }]
        : []),
      ...(pm10.length > 0 ? [{ key: 'pm10', label: 'PM10', unit: 'µg/m³' }] : []),
    ];

    return { rows, series, emptyReason: null, isPending };
  }, [data, hours, isPending]);
}

/** Modelled daily traffic profile. Simulated, not recorded. */
export function useTrafficTrend(): ChartRow[] {
  const trafficDensity = useCityStore((s) => s.trafficDensity);

  return useMemo<ChartRow[]>(
    () =>
      diurnalDensityProfile(trafficDensity).map((point) => {
        const hour = String(point.hour).padStart(2, '0');
        return {
          label: `${hour}:00`,
          title: `${hour}:00 ${DEFAULT_CITY.timezone}`,
          density: Math.round(point.density * 100),
        };
      }),
    [trafficDensity],
  );
}
