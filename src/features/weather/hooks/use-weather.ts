'use client';

import { useQuery } from '@tanstack/react-query';
import { DEFAULT_CITY } from '@/lib/constants/cities';
import type { WeatherErrorBody, WeatherPayload } from '../types/weather';

/**
 * Weather query.
 *
 * Refetch cadence is deliberately modest: Open-Meteo updates its forecast on
 * the hour, the route caches for 10 minutes, and the provider's limits are
 * per IP. Polling faster would spend quota to receive the same numbers.
 */

const REFETCH_INTERVAL_MS = 10 * 60 * 1000;

export class WeatherRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'WeatherRequestError';
    this.status = status;
  }
}

export function weatherQueryKey(lat: number, lon: number) {
  return ['weather', lat.toFixed(4), lon.toFixed(4)] as const;
}

async function fetchWeatherPayload(
  lat: number,
  lon: number,
): Promise<WeatherPayload> {
  const response = await fetch(
    `/api/weather?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`,
  );

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as WeatherErrorBody;
      detail = body.detail ?? body.error;
    } catch {
      // Keep the status-only message.
    }
    // Carrying the status lets the shared retry policy skip 4xx, which no
    // amount of retrying can fix.
    throw new WeatherRequestError(detail, response.status);
  }

  return (await response.json()) as WeatherPayload;
}

export function useWeather(
  lat: number = DEFAULT_CITY.center.lat,
  lon: number = DEFAULT_CITY.center.lon,
) {
  return useQuery({
    queryKey: weatherQueryKey(lat, lon),
    queryFn: () => fetchWeatherPayload(lat, lon),
    staleTime: REFETCH_INTERVAL_MS,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}
