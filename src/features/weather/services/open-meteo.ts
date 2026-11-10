import { cacheLife } from 'next/cache';
import { SOURCE_OPEN_METEO } from '@/lib/constants/data-sources';
import {
  realValue,
  unavailableValue,
  type DataEnvelope,
} from '@/types/data-envelope';
import type {
  DailyPoint,
  HourlyPoint,
  WeatherPayload,
} from '../types/weather';

/**
 * Open-Meteo client. **Server-side only** — it is called from
 * `src/app/api/weather/route.ts`.
 *
 * Validated against the provider's own documentation on 2026-11-06:
 *
 * - Endpoint `https://api.open-meteo.com/v1/forecast`, no API key required.
 * - Free limits: under 10,000 calls/day, 5,000/hour, 600/minute, applied by IP
 *   address and application.
 * - `timezone` is **required** whenever daily variables are requested.
 * - Data is CC-BY 4.0 and obliges a visible attribution link, which
 *   `WeatherAttribution` renders.
 *
 * Running through our own route rather than calling the API from the browser
 * means the rate limit is spent once per cache window for all visitors instead
 * of once per visitor, and it gives the client a single, uniform error shape.
 */

const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

const CURRENT_VARIABLES = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
] as const;

const HOURLY_VARIABLES = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
] as const;

const DAILY_VARIABLES = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'wind_speed_10m_max',
  'wind_direction_10m_dominant',
] as const;

export class OpenMeteoError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'OpenMeteoError';
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Upstream response shape
// ---------------------------------------------------------------------------

interface RawResponse {
  latitude?: number;
  longitude?: number;
  elevation?: number;
  timezone?: string;
  utc_offset_seconds?: number;
  current_units?: Record<string, string>;
  current?: Record<string, number | string | undefined>;
  hourly_units?: Record<string, string>;
  hourly?: Record<string, (number | null)[] | string[] | undefined>;
  daily_units?: Record<string, string>;
  daily?: Record<string, (number | null)[] | string[] | undefined>;
  error?: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an Open-Meteo local timestamp into a true UTC instant.
 *
 * Times come back in the requested zone and without an offset suffix, e.g.
 * `2026-11-06T20:00`. Parsing that as UTC and then subtracting the reported
 * offset recovers the actual instant, so the UI can compute a measurement age
 * that is correct regardless of where it is viewed from.
 */
function toIsoInstant(
  localTime: string | undefined,
  utcOffsetSeconds: number | undefined,
): string | null {
  if (!localTime) return null;

  const asUtc = Date.parse(`${localTime}Z`);
  if (Number.isNaN(asUtc)) return null;

  return new Date(asUtc - (utcOffsetSeconds ?? 0) * 1000).toISOString();
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNumberArray(value: unknown): (number | null)[] {
  return Array.isArray(value) ? value.map(numberOrNull) : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item : ''))
    : [];
}

// ---------------------------------------------------------------------------
// Fetch and map
// ---------------------------------------------------------------------------

export interface FetchWeatherOptions {
  lat: number;
  lon: number;
  timezone: string;
  /** Days of forecast, 0–16 per the documented range. */
  forecastDays?: number;
  /** Days of history, 0–92. One day of hourly history feeds the trend views. */
  pastDays?: number;
  /** Abort budget, so a slow upstream cannot hold our route open. */
  timeoutMs?: number;
}

export function buildForecastUrl({
  lat,
  lon,
  timezone,
  forecastDays = 7,
  pastDays = 1,
}: FetchWeatherOptions): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: CURRENT_VARIABLES.join(','),
    hourly: HOURLY_VARIABLES.join(','),
    daily: DAILY_VARIABLES.join(','),
    // Required by the API whenever daily variables are requested.
    timezone,
    forecast_days: String(forecastDays),
    past_days: String(pastDays),
  });

  return `${FORECAST_ENDPOINT}?${params.toString()}`;
}

/**
 * Retrieve and map a forecast, cached.
 *
 * Caching uses the `use cache` directive rather than `next: { revalidate }`
 * on the fetch: with Cache Components enabled, Next's documentation directs
 * fetch-level `cache` and `next` options to move to `use cache` with
 * `cacheLife`. The lifetime is given inline so the window sits next to the
 * code that depends on it.
 *
 * Caching the whole mapping — not just the HTTP response — means a cached
 * payload keeps the `fetchedAt` of the request that actually produced it,
 * which is the honest value: that is when the data was retrieved.
 *
 * The caller reads any request-specific values (query parameters) outside this
 * scope and passes them as arguments, which is required: a cached function
 * cannot touch runtime APIs.
 */
export async function fetchWeather(
  options: FetchWeatherOptions,
): Promise<WeatherPayload> {
  'use cache';
  cacheLife({
    // Served without revalidating for 5 minutes, refreshed at 10, and never
    // older than an hour — matching the route's CDN headers.
    stale: 300,
    revalidate: 600,
    expire: 3_600,
  });

  const url = buildForecastUrl(options);
  let response: Response;

  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new OpenMeteoError(
      `Could not reach Open-Meteo: ${cause instanceof Error ? cause.message : 'network error'}`,
      502,
    );
  }

  if (!response.ok) {
    // Open-Meteo returns a JSON body with `reason` on a rejected request.
    let reason = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as RawResponse;
      if (body.reason) reason = body.reason;
    } catch {
      // Non-JSON error body: the status alone has to do.
    }
    throw new OpenMeteoError(`Open-Meteo rejected the request: ${reason}`, 502);
  }

  const raw = (await response.json()) as RawResponse;
  return mapResponse(raw, options);
}

/** Build one current-conditions envelope, or UNAVAILABLE when absent. */
function currentEnvelope(
  raw: RawResponse,
  key: string,
  fallbackUnit: string | null,
  measuredAt: string | null,
  fetchedAt: string,
  options: FetchWeatherOptions,
): DataEnvelope<number> {
  const value = numberOrNull(raw.current?.[key]);
  // Units are read from the response rather than assumed, so a provider-side
  // unit change surfaces in the UI instead of silently mislabelling values.
  const unit = raw.current_units?.[key] ?? fallbackUnit;
  const location = {
    lat: raw.latitude ?? options.lat,
    lon: raw.longitude ?? options.lon,
  };

  if (value === null) {
    return unavailableValue<number>({
      source: SOURCE_OPEN_METEO,
      note: `Open-Meteo returned no value for ${key}.`,
      unit,
      location,
      fetchedAt,
    });
  }

  return realValue<number>({
    value,
    source: SOURCE_OPEN_METEO,
    measuredAt,
    fetchedAt,
    unit,
    location,
  });
}

export function mapResponse(
  raw: RawResponse,
  options: FetchWeatherOptions,
): WeatherPayload {
  if (raw.error) {
    throw new OpenMeteoError(raw.reason ?? 'Open-Meteo reported an error', 502);
  }

  // One timestamp for the whole payload: this is when we retrieved it.
  const fetchedAt = new Date().toISOString();

  const measuredAt = toIsoInstant(
    typeof raw.current?.time === 'string' ? raw.current.time : undefined,
    raw.utc_offset_seconds,
  );
  const location = {
    lat: raw.latitude ?? options.lat,
    lon: raw.longitude ?? options.lon,
  };

  // `is_day` arrives as 1 or 0.
  const isDayRaw = numberOrNull(raw.current?.is_day);

  const hourlyTimes = asStringArray(raw.hourly?.time);
  const hourlyTemp = asNumberArray(raw.hourly?.temperature_2m);
  const hourlyHumidity = asNumberArray(raw.hourly?.relative_humidity_2m);
  const hourlyPrecip = asNumberArray(raw.hourly?.precipitation);
  const hourlyWind = asNumberArray(raw.hourly?.wind_speed_10m);
  const hourlyCode = asNumberArray(raw.hourly?.weather_code);

  const hourly: HourlyPoint[] = hourlyTimes.map((time, index) => ({
    time,
    temperatureC: hourlyTemp[index] ?? null,
    humidityPct: hourlyHumidity[index] ?? null,
    precipitationMm: hourlyPrecip[index] ?? null,
    windSpeedKmh: hourlyWind[index] ?? null,
    weatherCode: hourlyCode[index] ?? null,
  }));

  const dailyDates = asStringArray(raw.daily?.time);
  const dailyMax = asNumberArray(raw.daily?.temperature_2m_max);
  const dailyMin = asNumberArray(raw.daily?.temperature_2m_min);
  const dailyPrecip = asNumberArray(raw.daily?.precipitation_sum);
  const dailyWindMax = asNumberArray(raw.daily?.wind_speed_10m_max);
  const dailyWindDir = asNumberArray(raw.daily?.wind_direction_10m_dominant);
  const dailyCode = asNumberArray(raw.daily?.weather_code);

  const daily: DailyPoint[] = dailyDates.map((date, index) => ({
    date,
    temperatureMaxC: dailyMax[index] ?? null,
    temperatureMinC: dailyMin[index] ?? null,
    precipitationSumMm: dailyPrecip[index] ?? null,
    windSpeedMaxKmh: dailyWindMax[index] ?? null,
    windDirectionDominantDeg: dailyWindDir[index] ?? null,
    weatherCode: dailyCode[index] ?? null,
  }));

  return {
    current: {
      temperatureC: currentEnvelope(raw, 'temperature_2m', '°C', measuredAt, fetchedAt, options),
      apparentTemperatureC: currentEnvelope(raw, 'apparent_temperature', '°C', measuredAt, fetchedAt, options),
      humidityPct: currentEnvelope(raw, 'relative_humidity_2m', '%', measuredAt, fetchedAt, options),
      windSpeedKmh: currentEnvelope(raw, 'wind_speed_10m', 'km/h', measuredAt, fetchedAt, options),
      windDirectionDeg: currentEnvelope(raw, 'wind_direction_10m', '°', measuredAt, fetchedAt, options),
      precipitationMm: currentEnvelope(raw, 'precipitation', 'mm', measuredAt, fetchedAt, options),
      weatherCode: currentEnvelope(raw, 'weather_code', null, measuredAt, fetchedAt, options),
      isDay:
        isDayRaw === null
          ? unavailableValue<boolean>({
              source: SOURCE_OPEN_METEO,
              note: 'Open-Meteo returned no day/night flag.',
              fetchedAt,
            })
          : realValue<boolean>({
              value: isDayRaw === 1,
              source: SOURCE_OPEN_METEO,
              measuredAt,
              fetchedAt,
              unit: null,
              location,
            }),
    },
    forecast: {
      hourly:
        hourly.length > 0
          ? realValue<readonly HourlyPoint[]>({
              value: hourly,
              source: SOURCE_OPEN_METEO,
              measuredAt,
              fetchedAt,
              unit: null,
              location,
            })
          : unavailableValue<readonly HourlyPoint[]>({
              source: SOURCE_OPEN_METEO,
              note: 'Open-Meteo returned no hourly series.',
              fetchedAt,
            }),
      daily:
        daily.length > 0
          ? realValue<readonly DailyPoint[]>({
              value: daily,
              source: SOURCE_OPEN_METEO,
              measuredAt,
              fetchedAt,
              unit: null,
              location,
            })
          : unavailableValue<readonly DailyPoint[]>({
              source: SOURCE_OPEN_METEO,
              note: 'Open-Meteo returned no daily series.',
              fetchedAt,
            }),
    },
    location: {
      lat: location.lat,
      lon: location.lon,
      timezone: raw.timezone ?? options.timezone,
      elevationM: numberOrNull(raw.elevation),
    },
  };
}
