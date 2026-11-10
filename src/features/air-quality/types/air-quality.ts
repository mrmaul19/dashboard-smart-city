import type { DataEnvelope } from '@/types/data-envelope';
import type { AqiCategoryId, PollutantKey } from '../utils/aqi';

export type { PollutantKey } from '../utils/aqi';

/** One pollutant sensor at a monitoring station. */
export interface StationSensor {
  readonly sensorId: number;
  readonly units: string;
  readonly displayName: string;
}

export interface Station {
  readonly id: number;
  readonly name: string;
  readonly locality: string | null;
  readonly provider: string | null;
  /** Straight-line distance from the city centre, in metres. */
  readonly distanceM: number | null;
  readonly coordinates: { readonly lat: number; readonly lon: number } | null;
  /**
   * Per-station attribution. OpenAQ aggregates third-party networks, so this
   * is the binding credit — not a blanket "OpenAQ" label.
   */
  readonly attribution: string | null;
  readonly attributionUrl: string | null;
  /** Last time the station reported anything, per OpenAQ. */
  readonly datetimeLast: string | null;
  readonly isMonitor: boolean;
  /** Only the pollutants this project uses. */
  readonly sensors: Partial<Record<PollutantKey, StationSensor>>;
  /** Parameter names the station measures that this project does not use. */
  readonly otherParameters: readonly string[];
}

export interface AqiSummary {
  readonly aqi: number;
  readonly categoryId: AqiCategoryId;
  readonly categoryLabel: string;
  readonly dominant: PollutantKey;
  /** Names the standard applied, as spec §7 requires. */
  readonly standard: 'US_EPA';
  /** Per-pollutant index values and the averaging window each used. */
  readonly contributing: readonly {
    readonly pollutant: PollutantKey;
    readonly aqi: number;
    readonly concentration: number;
    readonly unit: string;
    readonly window: string;
  }[];
}

/** Why a pollutant could not contribute to the AQI. */
export interface ExcludedPollutant {
  readonly pollutant: PollutantKey;
  readonly reason: string;
}

export interface RateLimitInfo {
  readonly limit: number | null;
  readonly remaining: number | null;
  readonly resetSeconds: number | null;
}

export interface AirQualityPayload {
  /** False when `OPENAQ_API_KEY` is not set; everything is then UNAVAILABLE. */
  readonly keyConfigured: boolean;
  readonly searchRadiusM: number;
  readonly stationCount: number;
  readonly stations: readonly Station[];
  /** The station the headline readings come from. */
  readonly primaryStationId: number | null;
  readonly readings: Partial<Record<PollutantKey, DataEnvelope<number>>>;
  readonly aqi: DataEnvelope<AqiSummary>;
  /** Pollutants left out of the AQI, with the reason for each. */
  readonly excluded: readonly ExcludedPollutant[];
  readonly rateLimit: RateLimitInfo | null;
}

export interface AirQualityErrorBody {
  readonly error: string;
  readonly detail?: string;
}
