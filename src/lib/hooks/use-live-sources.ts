'use client';

import { useAirQuality } from '@/features/air-quality/hooks/use-air-quality';
import { useWeather } from '@/features/weather/hooks/use-weather';
import type { LiveStatusKind } from '@/components/navigation/live-status';

/**
 * Aggregate health of the live data services, for the top bar indicator.
 *
 * Derived from the actual query state rather than hard-coded, so the indicator
 * cannot claim the dashboard is live while every panel is showing an error. As
 * further services arrive (air quality in phase 4, transport in phase 5) they
 * are added to the list here.
 */
export interface LiveSources {
  status: LiveStatusKind;
  /** Number of REAL sources currently serving data. */
  count: number;
  total: number;
}

export function useLiveSources(): LiveSources {
  const weather = useWeather();
  const airQuality = useAirQuality();

  const services = [
    { ok: weather.isSuccess, failed: weather.isError },
    {
      // An unconfigured key is not a live source and not a failure: the route
      // answers 200 with an all-unavailable payload, so it counts as neither.
      ok: airQuality.isSuccess && (airQuality.data?.stationCount ?? 0) > 0,
      failed: airQuality.isError,
    },
  ];

  const count = services.filter((service) => service.ok).length;
  const failed = services.filter((service) => service.failed).length;

  let status: LiveStatusKind = 'standby';
  if (failed > 0) status = 'degraded';
  else if (count > 0) status = 'live';

  return { status, count, total: services.length };
}
