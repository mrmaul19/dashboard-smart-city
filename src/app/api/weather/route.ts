import { NextResponse } from 'next/server';
import { DEFAULT_CITY } from '@/lib/constants/city-config';
import {
  fetchWeather,
  OpenMeteoError,
} from '@/features/weather/services/open-meteo';
import type { WeatherErrorBody } from '@/features/weather/types/weather';

/**
 * `GET /api/weather?lat=&lon=`
 *
 * Server-side proxy for Open-Meteo. Open-Meteo needs no API key, so this route
 * exists for three other reasons:
 *
 * 1. **Quota.** The provider's limits are applied per IP address and
 *    application. Calling it from every browser would spend one call per
 *    visitor; calling it here, behind a 10-minute cache, spends roughly 144
 *    calls a day in total — far inside the 10,000/day free allowance.
 * 2. **One error shape.** Upstream failures, malformed responses and missing
 *    fields are normalised here, so the client has a single contract.
 * 3. **Provenance at the boundary.** Envelopes are built where the fetch
 *    happens, which is the only place a `fetchedAt` timestamp is truthful.
 */

/** Cache window in seconds. Weather does not change faster than this. */
const CACHE_SECONDS = 600;
const STALE_WHILE_REVALIDATE_SECONDS = 1_800;

function parseCoordinate(
  raw: string | null,
  fallback: number,
  limit: number,
): number | null {
  if (raw === null || raw.trim() === '') return fallback;

  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || Math.abs(value) > limit) return null;
  return value;
}

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;

  const lat = parseCoordinate(params.get('lat'), DEFAULT_CITY.center.lat, 90);
  const lon = parseCoordinate(params.get('lon'), DEFAULT_CITY.center.lon, 180);

  if (lat === null || lon === null) {
    return NextResponse.json<WeatherErrorBody>(
      {
        error: 'Invalid coordinates',
        detail: 'lat must be within ±90 and lon within ±180.',
      },
      { status: 400 },
    );
  }

  try {
    const payload = await fetchWeather({
      lat,
      lon,
      timezone: DEFAULT_CITY.timezone,
    });

    return NextResponse.json(payload, {
      headers: {
        // Lets the CDN serve the same response to every visitor in the window,
        // and keep serving a slightly stale one while it refreshes.
        'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`,
      },
    });
  } catch (error) {
    const status = error instanceof OpenMeteoError ? error.status : 502;

    return NextResponse.json<WeatherErrorBody>(
      {
        error: 'Weather data unavailable',
        detail: error instanceof Error ? error.message : 'Unknown failure',
      },
      { status },
    );
  }
}
