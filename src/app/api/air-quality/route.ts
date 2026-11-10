import { NextResponse } from 'next/server';
import { DEFAULT_CITY } from '@/lib/constants/city-config';
import {
  fetchAirQuality,
  MAX_RADIUS_M,
  OpenAqError,
  unconfiguredPayload,
} from '@/features/air-quality/services/openaq';
import type { AirQualityErrorBody } from '@/features/air-quality/types/air-quality';

/**
 * `GET /api/air-quality?lat=&lon=&radius=`
 *
 * The OpenAQ key lives only here, in a server-side environment variable. It is
 * never given a `NEXT_PUBLIC_` prefix and never reaches the client bundle
 * (spec §10), and because the key's quota is shared by every visitor, the
 * response is cached for 15 minutes.
 *
 * A missing key is not an error: the route returns a normal payload in which
 * everything is UNAVAILABLE and the reason says the key is unset, so the
 * dashboard degrades honestly instead of showing a broken panel.
 */

const CACHE_SECONDS = 900;
const STALE_WHILE_REVALIDATE_SECONDS = 3_600;

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
    return NextResponse.json<AirQualityErrorBody>(
      {
        error: 'Invalid coordinates',
        detail: 'lat must be within ±90 and lon within ±180.',
      },
      { status: 400 },
    );
  }

  const radiusRaw = params.get('radius');
  const radiusM =
    radiusRaw === null ? MAX_RADIUS_M : Number.parseInt(radiusRaw, 10);

  if (!Number.isFinite(radiusM) || radiusM <= 0 || radiusM > MAX_RADIUS_M) {
    return NextResponse.json<AirQualityErrorBody>(
      {
        error: 'Invalid radius',
        detail: `radius must be a positive number of metres, at most ${MAX_RADIUS_M} (the API maximum).`,
      },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAQ_API_KEY?.trim();

  if (!apiKey) {
    // 200 with an all-unavailable payload: the dashboard still renders, and
    // the UI explains exactly what is missing.
    return NextResponse.json(unconfiguredPayload(radiusM), {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    const payload = await fetchAirQuality({ lat, lon, radiusM, apiKey });

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`,
      },
    });
  } catch (error) {
    const status = error instanceof OpenAqError ? error.status : 502;

    return NextResponse.json<AirQualityErrorBody>(
      {
        error:
          status === 401
            ? 'OpenAQ API key rejected'
            : status === 429
              ? 'OpenAQ rate limit reached'
              : 'Air quality data unavailable',
        detail: error instanceof Error ? error.message : 'Unknown failure',
      },
      // A rate-limited response must not be cached, or the error sticks for
      // the whole window.
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
