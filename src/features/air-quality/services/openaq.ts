import { cacheLife } from 'next/cache';
import { SOURCE_OPENAQ } from '@/lib/constants/data-sources';
import {
  realValue,
  unavailableValue,
  type DataEnvelope,
} from '@/types/data-envelope';
import {
  AVERAGING_WINDOW,
  aqiFromConcentration,
  concentrationInAqiUnit,
  overallAqi,
  pmNowCast,
  trailingMean,
  type PollutantAqi,
  type PollutantKey,
} from '../utils/aqi';
import type {
  AirQualityPayload,
  AqiSummary,
  ExcludedPollutant,
  RateLimitInfo,
  Station,
  StationSensor,
} from '../types/air-quality';

/**
 * OpenAQ v3 client. **Server-side only** — the API key must never reach the
 * browser, so this is imported solely by `src/app/api/air-quality/route.ts`.
 *
 * Validated against the provider's documentation on 2026-11-06:
 *
 * - `X-API-Key` header is mandatory; an unauthenticated request returns 401.
 * - Limits are 60 requests/minute and 2,000/hour, scoped to the key. Breaching
 *   returns 429, and the docs warn that repeated overuse can lead to a ban.
 * - `GET /v3/locations` takes `coordinates=lat,lon` with `radius` in metres,
 *   capped at 25,000. `bbox` cannot be combined with those.
 * - `GET /v3/locations/{id}/latest` returns `sensorsId` and `value` but **no
 *   unit and no parameter name**, so readings are meaningless until joined
 *   against the location's `sensors[]`. That join is the core of this module.
 * - The docs also warn that a "latest" value is not necessarily recent, which
 *   is why every reading carries its own measurement timestamp.
 */

const API_BASE = 'https://api.openaq.org/v3';

/** The API's documented maximum radius. */
export const MAX_RADIUS_M = 25_000;

/** Pollutants this project reads, matching OpenAQ's parameter names. */
const POLLUTANTS: readonly PollutantKey[] = [
  'pm25',
  'pm10',
  'o3',
  'no2',
  'so2',
  'co',
];

const POLLUTANT_SET = new Set<string>(POLLUTANTS);

function isPollutantKey(name: string): name is PollutantKey {
  return POLLUTANT_SET.has(name);
}

export class OpenAqError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'OpenAqError';
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Upstream shapes (only the fields this module reads)
// ---------------------------------------------------------------------------

interface RawSensor {
  id?: number;
  name?: string;
  parameter?: {
    name?: string;
    units?: string;
    displayName?: string;
  };
}

interface RawLocation {
  id?: number;
  name?: string;
  locality?: string | null;
  provider?: { name?: string };
  coordinates?: { latitude?: number; longitude?: number };
  distance?: number | null;
  isMonitor?: boolean;
  sensors?: RawSensor[];
  licenses?: { attribution?: { name?: string; url?: string } }[] | null;
  datetimeLast?: { utc?: string } | null;
}

interface RawLatest {
  datetime?: { utc?: string };
  value?: number;
  sensorsId?: number;
  locationsId?: number;
  coordinates?: { latitude?: number; longitude?: number };
}

interface RawHour {
  value?: number;
  period?: { datetimeFrom?: { utc?: string }; datetimeTo?: { utc?: string } };
}

interface RawList<T> {
  meta?: { found?: number | string };
  results?: T[];
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

interface ApiResult<T> {
  data: T;
  rateLimit: RateLimitInfo;
}

function readRateLimit(headers: Headers): RateLimitInfo {
  const toNumber = (raw: string | null): number | null => {
    if (raw === null) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  };

  // Documented header names are lowercase.
  return {
    limit: toNumber(headers.get('x-ratelimit-limit')),
    remaining: toNumber(headers.get('x-ratelimit-remaining')),
    resetSeconds: toNumber(headers.get('x-ratelimit-reset')),
  };
}

async function apiGet<T>(
  path: string,
  apiKey: string,
  timeoutMs = 10_000,
): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new OpenAqError(
      `Could not reach OpenAQ: ${cause instanceof Error ? cause.message : 'network error'}`,
      502,
    );
  }

  const rateLimit = readRateLimit(response.headers);

  if (response.status === 401) {
    throw new OpenAqError(
      'OpenAQ rejected the API key. Check OPENAQ_API_KEY in .env.local.',
      401,
    );
  }

  if (response.status === 429) {
    throw new OpenAqError(
      `OpenAQ rate limit reached (limit ${rateLimit.limit ?? 'unknown'}, resets in ${rateLimit.resetSeconds ?? 'unknown'}s).`,
      429,
    );
  }

  if (!response.ok) {
    throw new OpenAqError(`OpenAQ returned HTTP ${response.status}`, 502);
  }

  return { data: (await response.json()) as T, rateLimit };
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function mapStation(raw: RawLocation): Station | null {
  if (typeof raw.id !== 'number') return null;

  const sensors: Partial<Record<PollutantKey, StationSensor>> = {};
  const otherParameters: string[] = [];

  for (const sensor of raw.sensors ?? []) {
    const name = sensor.parameter?.name;
    if (typeof sensor.id !== 'number' || !name) continue;

    if (isPollutantKey(name)) {
      sensors[name] = {
        sensorId: sensor.id,
        units: sensor.parameter?.units ?? '',
        displayName: sensor.parameter?.displayName ?? name,
      };
    } else {
      otherParameters.push(name);
    }
  }

  const licence = raw.licenses?.[0]?.attribution;

  return {
    id: raw.id,
    name: raw.name ?? `Station ${raw.id}`,
    locality: raw.locality ?? null,
    provider: raw.provider?.name ?? null,
    distanceM:
      typeof raw.distance === 'number' ? Math.round(raw.distance) : null,
    coordinates:
      typeof raw.coordinates?.latitude === 'number' &&
      typeof raw.coordinates?.longitude === 'number'
        ? { lat: raw.coordinates.latitude, lon: raw.coordinates.longitude }
        : null,
    attribution: licence?.name ?? null,
    attributionUrl: licence?.url ?? null,
    datetimeLast: raw.datetimeLast?.utc ?? null,
    isMonitor: raw.isMonitor ?? false,
    sensors,
    otherParameters,
  };
}

/** Source reference carrying a station's own attribution, when it has one. */
function stationSource(station: Station) {
  return station.attribution
    ? {
        ...SOURCE_OPENAQ,
        attribution: station.attribution,
        url: station.attributionUrl ?? SOURCE_OPENAQ.url,
      }
    : SOURCE_OPENAQ;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface FetchAirQualityOptions {
  lat: number;
  lon: number;
  radiusM?: number;
  apiKey: string;
}

/**
 * Build the full air-quality payload for a point.
 *
 * Request budget per cache window: one `/locations` call, one `/latest` call,
 * and at most one `/hours` call per AQI-eligible pollutant at the chosen
 * station — eight upstream requests at worst. Against a 2,000/hour allowance
 * and a 15-minute cache, that is roughly 32 requests an hour in total.
 */
/**
 * Build the air-quality payload, cached.
 *
 * Caching is via `use cache` rather than `next: { revalidate }` on each
 * fetch, following Next's guidance for Cache Components. This matters more
 * here than for weather: one call to this function can make up to eight
 * upstream requests, and the key's quota is shared by every visitor, so the
 * cache has to cover the whole operation rather than each request separately.
 */
export async function fetchAirQuality({
  lat,
  lon,
  radiusM = MAX_RADIUS_M,
  apiKey,
}: FetchAirQualityOptions): Promise<AirQualityPayload> {
  'use cache';
  cacheLife({
    stale: 300,
    revalidate: 900,
    expire: 7_200,
  });

  const radius = Math.min(Math.max(1, Math.round(radiusM)), MAX_RADIUS_M);
  // One retrieval timestamp for the whole payload.
  const fetchedAt = new Date().toISOString();

  const locations = await apiGet<RawList<RawLocation>>(
    `/locations?coordinates=${lat.toFixed(4)},${lon.toFixed(4)}&radius=${radius}&limit=100`,
    apiKey,
  );

  const stations = (locations.data.results ?? [])
    .map(mapStation)
    .filter((station): station is Station => station !== null)
    .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));

  let rateLimit = locations.rateLimit;

  // No station in range is a legitimate outcome, not an error: the whole
  // feature reports UNAVAILABLE and says why (spec §5B).
  if (stations.length === 0) {
    return {
      keyConfigured: true,
      searchRadiusM: radius,
      stationCount: 0,
      stations: [],
      primaryStationId: null,
      readings: {},
      aqi: unavailableValue<AqiSummary>({
        fetchedAt,
        source: SOURCE_OPENAQ,
        note: `No OpenAQ monitoring station within ${(radius / 1000).toFixed(0)} km of this location.`,
      }),
      excluded: [],
      rateLimit,
    };
  }

  // Headline readings come from the nearest station that measures at least one
  // pollutant we use; mixing stations would produce a reading that describes
  // no single place.
  const primary =
    stations.find((station) => Object.keys(station.sensors).length > 0) ?? null;

  if (!primary) {
    return {
      keyConfigured: true,
      searchRadiusM: radius,
      stationCount: stations.length,
      stations,
      primaryStationId: null,
      readings: {},
      aqi: unavailableValue<AqiSummary>({
        fetchedAt,
        source: SOURCE_OPENAQ,
        note: `${stations.length} station(s) in range, but none measure PM2.5, PM10, O₃, NO₂, SO₂ or CO.`,
      }),
      excluded: [],
      rateLimit,
    };
  }

  // Latest values carry no parameter name, so build sensorId -> pollutant from
  // the station metadata first.
  const pollutantBySensorId = new Map<number, PollutantKey>();
  for (const pollutant of POLLUTANTS) {
    const sensor = primary.sensors[pollutant];
    if (sensor) pollutantBySensorId.set(sensor.sensorId, pollutant);
  }

  const latest = await apiGet<RawList<RawLatest>>(
    `/locations/${primary.id}/latest`,
    apiKey,
  );
  rateLimit = latest.rateLimit;

  const readings: Partial<Record<PollutantKey, DataEnvelope<number>>> = {};
  const source = stationSource(primary);
  const location = primary.coordinates
    ? {
        lat: primary.coordinates.lat,
        lon: primary.coordinates.lon,
        label: primary.name,
      }
    : undefined;

  for (const row of latest.data.results ?? []) {
    if (typeof row.sensorsId !== 'number' || typeof row.value !== 'number') {
      continue;
    }

    const pollutant = pollutantBySensorId.get(row.sensorsId);
    if (!pollutant) continue;

    readings[pollutant] = realValue<number>({
      value: row.value,
      source,
      fetchedAt,
      measuredAt: row.datetime?.utc ?? null,
      unit: primary.sensors[pollutant]?.units ?? null,
      location,
    });
  }

  // Pollutants the station advertises but that returned no latest value.
  for (const pollutant of POLLUTANTS) {
    if (primary.sensors[pollutant] && !readings[pollutant]) {
      readings[pollutant] = unavailableValue<number>({
        source,
        fetchedAt,
        note: 'The station lists this sensor but reported no recent value.',
        unit: primary.sensors[pollutant]?.units ?? null,
        location,
      });
    }
  }

  const { aqi, excluded, rateLimit: aqiRateLimit } = await computeAqi(
    primary,
    apiKey,
    source,
    location,
    fetchedAt,
  );

  return {
    keyConfigured: true,
    searchRadiusM: radius,
    stationCount: stations.length,
    stations,
    primaryStationId: primary.id,
    readings,
    aqi,
    excluded,
    rateLimit: aqiRateLimit ?? rateLimit,
  };
}

/**
 * Compute the AQI from hourly aggregates.
 *
 * Hourly means are requested rather than reusing the instantaneous `/latest`
 * values, because every EPA index is defined over an averaging window: PM uses
 * the 12-hour NowCast, O3 and CO use an 8-hour mean, NO2 and SO2 use the
 * 1-hour value. Computing an index from a single spot reading would not be the
 * documented standard, which spec §7 requires.
 */
async function computeAqi(
  station: Station,
  apiKey: string,
  source: ReturnType<typeof stationSource>,
  location: { lat: number; lon: number; label?: string } | undefined,
  fetchedAt: string,
): Promise<{
  aqi: DataEnvelope<AqiSummary>;
  excluded: ExcludedPollutant[];
  rateLimit: RateLimitInfo | null;
}> {
  const excluded: ExcludedPollutant[] = [];
  const contributions: PollutantAqi[] = [];
  let rateLimit: RateLimitInfo | null = null;
  let newestMeasurement: string | null = null;

  // 13 hours covers the 12-hour NowCast window with a margin for a late hour.
  const from = new Date(Date.now() - 13 * 3_600_000)
    .toISOString()
    .slice(0, 19);

  const eligible = POLLUTANTS.filter((pollutant) => station.sensors[pollutant]);

  for (const pollutant of eligible) {
    const sensor = station.sensors[pollutant];
    if (!sensor) continue;

    let hours: RawHour[];
    try {
      const response = await apiGet<RawList<RawHour>>(
        `/sensors/${sensor.sensorId}/hours?date_from=${from}&limit=24`,
        apiKey,
      );
      rateLimit = response.rateLimit;
      hours = response.data.results ?? [];
    } catch (error) {
      // One sensor failing must not sink the whole AQI.
      excluded.push({
        pollutant,
        reason:
          error instanceof OpenAqError && error.status === 429
            ? 'Rate limit reached before hourly data could be read.'
            : 'Hourly data could not be retrieved.',
      });
      continue;
    }

    // Order most recent first, as the NowCast expects.
    const ordered = [...hours]
      .filter((hour) => typeof hour.value === 'number')
      .sort((a, b) => {
        const left = a.period?.datetimeTo?.utc ?? '';
        const right = b.period?.datetimeTo?.utc ?? '';
        return right.localeCompare(left);
      });

    if (ordered.length === 0) {
      excluded.push({ pollutant, reason: 'No hourly aggregates available.' });
      continue;
    }

    const newest = ordered[0]?.period?.datetimeTo?.utc ?? null;
    if (newest && (!newestMeasurement || newest > newestMeasurement)) {
      newestMeasurement = newest;
    }

    const series = ordered.map((hour) =>
      typeof hour.value === 'number' ? hour.value : null,
    );

    // Reduce the series to the concentration the index is defined on.
    let concentration: number | null = null;
    if (pollutant === 'pm25' || pollutant === 'pm10') {
      concentration = pmNowCast(series)?.value ?? null;
      if (concentration === null) {
        excluded.push({
          pollutant,
          reason:
            'NowCast needs at least 2 valid hours among the most recent 3.',
        });
        continue;
      }
    } else if (pollutant === 'o3' || pollutant === 'co') {
      concentration = trailingMean(series, 8);
      if (concentration === null) {
        excluded.push({
          pollutant,
          reason: 'An 8-hour mean needs at least 6 of the last 8 hours.',
        });
        continue;
      }
    } else {
      concentration = series[0];
      if (concentration === null) {
        excluded.push({ pollutant, reason: 'No valid most-recent hour.' });
        continue;
      }
    }

    // Unit reconciliation. OpenAQ reports gases in ppm while the EPA defines
    // NO2 and SO2 in ppb; a gas reported in µg/m³ cannot be converted without
    // temperature and pressure, so it is excluded rather than assumed.
    const converted = concentrationInAqiUnit(
      pollutant,
      concentration,
      sensor.units,
    );
    if (converted === null) {
      excluded.push({
        pollutant,
        reason: `Reported in ${sensor.units || 'an unknown unit'}, which cannot be converted to the ${pollutant === 'no2' || pollutant === 'so2' ? 'ppb' : 'index'} unit without assuming temperature and pressure.`,
      });
      continue;
    }

    const result = aqiFromConcentration(pollutant, converted);
    if (!result) {
      excluded.push({ pollutant, reason: 'Concentration was not usable.' });
      continue;
    }

    if (result.aqi === null) {
      excluded.push({
        pollutant,
        reason: result.note ?? 'Above the documented breakpoint table.',
      });
      continue;
    }

    contributions.push({ ...result, window: AVERAGING_WINDOW[pollutant] });
  }

  const overall = overallAqi(contributions);

  if (!overall) {
    return {
      aqi: unavailableValue<AqiSummary>({
        source,
        fetchedAt,
        note:
          excluded.length > 0
            ? 'No pollutant had enough hourly data to compute an AQI with the EPA standard.'
            : 'This station provides no pollutant usable for an AQI.',
        location,
      }),
      excluded,
      rateLimit,
    };
  }

  const summary: AqiSummary = {
    aqi: overall.aqi,
    categoryId: overall.category.id,
    categoryLabel: overall.category.label,
    dominant: overall.dominant,
    standard: 'US_EPA',
    contributing: overall.contributing.map((item) => ({
      pollutant: item.pollutant,
      aqi: item.aqi as number,
      concentration: item.concentration,
      unit: item.unit,
      window: item.window,
    })),
  };

  return {
    aqi: realValue<AqiSummary>({
      value: summary,
      source,
      fetchedAt,
      measuredAt: newestMeasurement,
      unit: 'AQI',
      location,
      note: 'US EPA AQI, computed from hourly aggregates at this station.',
    }),
    excluded,
    rateLimit,
  };
}

/** Payload used when no API key is configured. Everything is UNAVAILABLE. */
export function unconfiguredPayload(radiusM = MAX_RADIUS_M): AirQualityPayload {
  return {
    keyConfigured: false,
    searchRadiusM: radiusM,
    stationCount: 0,
    stations: [],
    primaryStationId: null,
    readings: {},
    aqi: unavailableValue<AqiSummary>({
      source: SOURCE_OPENAQ,
      note: 'OPENAQ_API_KEY is not set, so no air-quality data can be requested. Register free at explore.openaq.org/register.',
    }),
    excluded: [],
    rateLimit: null,
  };
}
