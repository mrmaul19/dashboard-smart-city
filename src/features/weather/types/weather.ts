import type { DataEnvelope } from '@/types/data-envelope';

/**
 * Weather contracts.
 *
 * Every field is a `DataEnvelope`, and the envelopes are built on the server at
 * the moment of the upstream fetch (see `services/open-meteo.ts`). That is the
 * only place where a `fetchedAt` timestamp is meaningful, and it means the
 * client receives values that already carry their provenance, source, licence
 * and measurement time — it cannot render a weather number without them.
 */

export interface WeatherSnapshot {
  readonly temperatureC: DataEnvelope<number>;
  readonly apparentTemperatureC: DataEnvelope<number>;
  readonly humidityPct: DataEnvelope<number>;
  readonly windSpeedKmh: DataEnvelope<number>;
  readonly windDirectionDeg: DataEnvelope<number>;
  readonly precipitationMm: DataEnvelope<number>;
  /** WMO 4677 present-weather code; see `wmo-codes.ts`. */
  readonly weatherCode: DataEnvelope<number>;
  readonly isDay: DataEnvelope<boolean>;
}

export interface HourlyPoint {
  /** ISO 8601 local time, as returned by Open-Meteo for the requested zone. */
  readonly time: string;
  readonly temperatureC: number | null;
  readonly humidityPct: number | null;
  readonly precipitationMm: number | null;
  readonly windSpeedKmh: number | null;
  readonly weatherCode: number | null;
}

export interface DailyPoint {
  readonly date: string;
  readonly temperatureMaxC: number | null;
  readonly temperatureMinC: number | null;
  readonly precipitationSumMm: number | null;
  readonly windSpeedMaxKmh: number | null;
  readonly windDirectionDominantDeg: number | null;
  readonly weatherCode: number | null;
}

export interface WeatherForecast {
  readonly hourly: DataEnvelope<readonly HourlyPoint[]>;
  readonly daily: DataEnvelope<readonly DailyPoint[]>;
}

/** Everything the weather feature serves from one upstream request. */
export interface WeatherPayload {
  readonly current: WeatherSnapshot;
  readonly forecast: WeatherForecast;
  readonly location: {
    readonly lat: number;
    readonly lon: number;
    readonly timezone: string;
    /** Open-Meteo reports the elevation it resolved for the coordinates. */
    readonly elevationM: number | null;
  };
}

/** Error shape returned by `/api/weather` when the upstream call fails. */
export interface WeatherErrorBody {
  readonly error: string;
  readonly detail?: string;
}
