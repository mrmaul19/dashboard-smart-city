'use client';

import { useQuery } from '@tanstack/react-query';
import { DEFAULT_CITY } from '@/lib/constants/cities';
import type {
  AirQualityErrorBody,
  AirQualityPayload,
} from '../types/air-quality';

/**
 * Air-quality query.
 *
 * Polling is slow by design: station data is hourly at best, the route caches
 * for 15 minutes, and the key's quota (60/min, 2,000/hour) is shared by every
 * visitor. OpenAQ's own documentation warns that repeated overuse can lead to
 * a ban, so this is the one place where being conservative matters more than
 * being current.
 */

const REFETCH_INTERVAL_MS = 15 * 60 * 1000;

export class AirQualityRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AirQualityRequestError';
    this.status = status;
  }
}

export function airQualityQueryKey(lat: number, lon: number) {
  return ['air-quality', lat.toFixed(4), lon.toFixed(4)] as const;
}

async function fetchPayload(
  lat: number,
  lon: number,
): Promise<AirQualityPayload> {
  const response = await fetch(
    `/api/air-quality?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`,
  );

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as AirQualityErrorBody;
      detail = body.detail ?? body.error;
    } catch {
      // Keep the status-only message.
    }
    throw new AirQualityRequestError(detail, response.status);
  }

  return (await response.json()) as AirQualityPayload;
}

export function useAirQuality(
  lat: number = DEFAULT_CITY.center.lat,
  lon: number = DEFAULT_CITY.center.lon,
) {
  return useQuery({
    queryKey: airQualityQueryKey(lat, lon),
    queryFn: () => fetchPayload(lat, lon),
    staleTime: REFETCH_INTERVAL_MS,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}
