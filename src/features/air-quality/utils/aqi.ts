/**
 * US EPA Air Quality Index.
 *
 * Transcribed from the EPA "Technical Assistance Document for the Reporting of
 * Daily Air Quality – the Air Quality Index (AQI)", updated May 2026, Table 6
 * and Equation 1. The PM2.5 breakpoints are the revised values whose lowest
 * category ends at 9.0 µg/m³ (not the older 12.0).
 *
 * The project rule (spec §7) is that an AQI may only be shown when it is
 * computed with a documented standard and enough data. This module therefore
 * returns `null` rather than a number whenever:
 *
 * - the concentration is above the highest documented breakpoint (the AQI-500
 *   anchor concentrations for PM2.5 and PM10 could not be read from the
 *   source document, so they are deliberately not guessed);
 * - the required averaging window does not have enough valid hours;
 * - the reported unit is not the one the breakpoints are defined in, and
 *   converting it would require assumptions (see `concentrationInAqiUnit`).
 */

export type PollutantKey = 'pm25' | 'pm10' | 'o3' | 'no2' | 'so2' | 'co';

export type AqiCategoryId =
  | 'good'
  | 'moderate'
  | 'unhealthy-sensitive'
  | 'unhealthy'
  | 'very-unhealthy'
  | 'hazardous';

export interface AqiCategory {
  readonly id: AqiCategoryId;
  readonly label: string;
  /** Official EPA colour name for the category. */
  readonly colourName: string;
  readonly min: number;
  /** `null` for the open-ended Hazardous category. */
  readonly max: number | null;
}

/** Category table, verbatim from airnow.gov/aqi/aqi-basics. */
export const AQI_CATEGORIES: readonly AqiCategory[] = [
  { id: 'good', label: 'Good', colourName: 'Green', min: 0, max: 50 },
  { id: 'moderate', label: 'Moderate', colourName: 'Yellow', min: 51, max: 100 },
  {
    id: 'unhealthy-sensitive',
    label: 'Unhealthy for Sensitive Groups',
    colourName: 'Orange',
    min: 101,
    max: 150,
  },
  { id: 'unhealthy', label: 'Unhealthy', colourName: 'Red', min: 151, max: 200 },
  {
    id: 'very-unhealthy',
    label: 'Very Unhealthy',
    colourName: 'Purple',
    min: 201,
    max: 300,
  },
  {
    id: 'hazardous',
    label: 'Hazardous',
    colourName: 'Maroon',
    min: 301,
    max: null,
  },
] as const;

export function aqiCategory(aqi: number): AqiCategory {
  for (const category of AQI_CATEGORIES) {
    if (category.max === null || aqi <= category.max) return category;
  }
  return AQI_CATEGORIES[AQI_CATEGORIES.length - 1];
}

/** Unit each pollutant's breakpoints are defined in. */
export const AQI_UNIT: Record<PollutantKey, 'µg/m³' | 'ppm' | 'ppb'> = {
  pm25: 'µg/m³',
  pm10: 'µg/m³',
  o3: 'ppm',
  co: 'ppm',
  no2: 'ppb',
  so2: 'ppb',
};

/**
 * Decimal places each concentration is truncated to before the calculation,
 * per the TAD. Truncation, not rounding: 9.09 becomes 9.0.
 */
const TRUNCATION_DECIMALS: Record<PollutantKey, number> = {
  o3: 3,
  pm25: 1,
  pm10: 0,
  co: 1,
  so2: 0,
  no2: 0,
};

/** Averaging window the index for each pollutant is defined over. */
export const AVERAGING_WINDOW: Record<PollutantKey, string> = {
  pm25: 'NowCast (12 h weighted)',
  pm10: 'NowCast (12 h weighted)',
  o3: '8-hour mean',
  co: '8-hour mean',
  no2: '1-hour',
  so2: '1-hour',
};

interface Segment {
  readonly cLow: number;
  readonly cHigh: number;
  readonly iLow: number;
  readonly iHigh: number;
}

/**
 * Table 6. Concentrations are in the units given by `AQI_UNIT`.
 *
 * The table stops at the top documented numeric range for each pollutant.
 * Anything above it is reported as Hazardous with no index value, rather than
 * extrapolated.
 */
const BREAKPOINTS: Record<PollutantKey, readonly Segment[]> = {
  pm25: [
    { cLow: 0.0, cHigh: 9.0, iLow: 0, iHigh: 50 },
    { cLow: 9.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
    { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
    { cLow: 55.5, cHigh: 125.4, iLow: 151, iHigh: 200 },
    { cLow: 125.5, cHigh: 225.4, iLow: 201, iHigh: 300 },
  ],
  pm10: [
    { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
    { cLow: 55, cHigh: 154, iLow: 51, iHigh: 100 },
    { cLow: 155, cHigh: 254, iLow: 101, iHigh: 150 },
    { cLow: 255, cHigh: 354, iLow: 151, iHigh: 200 },
    { cLow: 355, cHigh: 424, iLow: 201, iHigh: 300 },
  ],
  o3: [
    { cLow: 0.0, cHigh: 0.054, iLow: 0, iHigh: 50 },
    { cLow: 0.055, cHigh: 0.07, iLow: 51, iHigh: 100 },
    { cLow: 0.071, cHigh: 0.085, iLow: 101, iHigh: 150 },
    { cLow: 0.086, cHigh: 0.105, iLow: 151, iHigh: 200 },
    { cLow: 0.106, cHigh: 0.2, iLow: 201, iHigh: 300 },
  ],
  co: [
    { cLow: 0.0, cHigh: 4.4, iLow: 0, iHigh: 50 },
    { cLow: 4.5, cHigh: 9.4, iLow: 51, iHigh: 100 },
    { cLow: 9.5, cHigh: 12.4, iLow: 101, iHigh: 150 },
    { cLow: 12.5, cHigh: 15.4, iLow: 151, iHigh: 200 },
    { cLow: 15.5, cHigh: 30.4, iLow: 201, iHigh: 300 },
  ],
  // The upper end of the SO2 index is defined on the 24-hour average rather
  // than the 1-hour maximum, so values above 304 ppb need a different input
  // than this function receives and are reported without an index.
  so2: [
    { cLow: 0, cHigh: 35, iLow: 0, iHigh: 50 },
    { cLow: 36, cHigh: 75, iLow: 51, iHigh: 100 },
    { cLow: 76, cHigh: 185, iLow: 101, iHigh: 150 },
    { cLow: 186, cHigh: 304, iLow: 151, iHigh: 200 },
  ],
  no2: [
    { cLow: 0, cHigh: 53, iLow: 0, iHigh: 50 },
    { cLow: 54, cHigh: 100, iLow: 51, iHigh: 100 },
    { cLow: 101, cHigh: 360, iLow: 101, iHigh: 150 },
    { cLow: 361, cHigh: 649, iLow: 151, iHigh: 200 },
    { cLow: 650, cHigh: 1249, iLow: 201, iHigh: 300 },
  ],
};

/** Truncate toward zero to a number of decimal places. */
export function truncateConcentration(
  pollutant: PollutantKey,
  value: number,
): number {
  const decimals = TRUNCATION_DECIMALS[pollutant];
  const factor = 10 ** decimals;
  return Math.trunc(value * factor) / factor;
}

export interface AqiResult {
  /** `null` when the concentration is above the documented table. */
  readonly aqi: number | null;
  readonly category: AqiCategory;
  readonly pollutant: PollutantKey;
  /** The truncated concentration actually used. */
  readonly concentration: number;
  readonly unit: string;
  readonly note?: string;
}

/**
 * Equation 1 from the TAD:
 *
 *   Ip = (IHi − ILo) / (BPHi − BPLo) × (Cp − BPLo) + ILo
 *
 * then rounded to the nearest integer.
 */
export function aqiFromConcentration(
  pollutant: PollutantKey,
  rawConcentration: number,
): AqiResult | null {
  if (!Number.isFinite(rawConcentration) || rawConcentration < 0) return null;

  const concentration = truncateConcentration(pollutant, rawConcentration);
  const table = BREAKPOINTS[pollutant];

  for (const segment of table) {
    if (concentration <= segment.cHigh) {
      const span = segment.cHigh - segment.cLow;
      // A zero-width segment would divide by zero; it cannot occur in Table 6,
      // but guarding keeps a future table edit from producing Infinity.
      const index =
        span === 0
          ? segment.iLow
          : ((segment.iHigh - segment.iLow) / span) *
              (concentration - segment.cLow) +
            segment.iLow;

      const aqi = Math.round(index);
      return {
        aqi,
        category: aqiCategory(aqi),
        pollutant,
        concentration,
        unit: AQI_UNIT[pollutant],
      };
    }
  }

  // Above the highest documented breakpoint.
  return {
    aqi: null,
    category: AQI_CATEGORIES[AQI_CATEGORIES.length - 1],
    pollutant,
    concentration,
    unit: AQI_UNIT[pollutant],
    note:
      pollutant === 'so2'
        ? 'Above 304 ppb the SO₂ index is defined on the 24-hour average, which is not available here.'
        : 'Concentration is above the highest breakpoint documented by the EPA table.',
  };
}

export interface NowCastResult {
  readonly value: number;
  /** The weight factor, between 0.5 and 1. Lower means more variable air. */
  readonly weight: number;
  readonly hoursUsed: number;
}

/**
 * PM NowCast, per the TAD (same method for PM2.5 and PM10).
 *
 * `hourly` must be ordered **most recent first**. The steps are the document's
 * own: take the last 12 hours, derive a weight factor of
 * `1 − (max − min) / max` clamped to a 0.5 floor, weight each hour by
 * `weight^hoursAgo`, and divide by the sum of the weights used.
 *
 * Returns `null` when fewer than 2 of the most recent 3 hours are valid, which
 * is the document's stated completeness requirement.
 */
export function pmNowCast(
  hourly: readonly (number | null)[],
): NowCastResult | null {
  const window = hourly.slice(0, 12);

  const isValid = (value: number | null | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;

  const recentThreeValid = window.slice(0, 3).filter(isValid).length;
  if (recentThreeValid < 2) return null;

  const valid = window.filter(isValid);
  if (valid.length === 0) return null;

  const max = Math.max(...valid);
  const min = Math.min(...valid);

  // All-zero window: the scaled rate of change is undefined (0/0), and the
  // NowCast of a flat zero series is zero.
  if (max === 0) {
    return { value: 0, weight: 1, hoursUsed: valid.length };
  }

  const scaledRateOfChange = (max - min) / max;
  const weight = Math.min(1, Math.max(0.5, 1 - scaledRateOfChange));

  let numerator = 0;
  let denominator = 0;

  window.forEach((value, hoursAgo) => {
    if (!isValid(value)) return;
    const factor = weight ** hoursAgo;
    numerator += value * factor;
    denominator += factor;
  });

  if (denominator === 0) return null;

  return {
    value: numerator / denominator,
    weight,
    hoursUsed: valid.length,
  };
}

/**
 * Mean of the most recent `hours` valid values, used for the 8-hour O3 and CO
 * windows. Requires at least 75% of the window to be present, which is the
 * usual completeness convention for an 8-hour average.
 */
export function trailingMean(
  hourly: readonly (number | null)[],
  hours: number,
): number | null {
  const window = hourly.slice(0, hours);
  const valid = window.filter(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0,
  );

  if (valid.length < Math.ceil(hours * 0.75)) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

/**
 * Convert a reported concentration into the unit the AQI breakpoints use.
 *
 * OpenAQ reports particulates in µg/m³ and gases in ppm, while the EPA
 * breakpoints for NO2 and SO2 are in ppb — a pure ×1000 conversion. A gas
 * reported in µg/m³ is a different matter: converting it to a volume mixing
 * ratio requires the temperature and pressure at the sensor, which the API
 * does not provide, so that case returns `null` and the pollutant is excluded
 * from the AQI rather than converted on an assumption.
 */
export function concentrationInAqiUnit(
  pollutant: PollutantKey,
  value: number,
  reportedUnit: string,
): number | null {
  const target = AQI_UNIT[pollutant];
  const unit = reportedUnit.trim().toLowerCase();

  const isMicrogram =
    unit === 'µg/m³' || unit === 'ug/m3' || unit === 'µg/m3' || unit === 'ugm3';
  const isPpm = unit === 'ppm';
  const isPpb = unit === 'ppb';

  if (target === 'µg/m³') return isMicrogram ? value : null;
  if (target === 'ppm') {
    if (isPpm) return value;
    if (isPpb) return value / 1000;
    return null;
  }
  // target === 'ppb'
  if (isPpb) return value;
  if (isPpm) return value * 1000;
  return null;
}

export interface PollutantAqi extends AqiResult {
  /** Which averaging window produced the concentration. */
  readonly window: string;
}

/**
 * Overall AQI: the highest pollutant index, with the pollutant that drove it.
 *
 * Pollutants with insufficient data, an unconvertible unit, or a concentration
 * beyond the table contribute nothing, and are listed separately so the UI can
 * say what was excluded instead of silently narrowing the basis.
 */
export interface OverallAqi {
  readonly aqi: number;
  readonly category: AqiCategory;
  readonly dominant: PollutantKey;
  readonly contributing: readonly PollutantAqi[];
}

export function overallAqi(
  results: readonly PollutantAqi[],
): OverallAqi | null {
  const scored = results.filter(
    (result): result is PollutantAqi & { aqi: number } => result.aqi !== null,
  );
  if (scored.length === 0) return null;

  const worst = scored.reduce((max, result) =>
    result.aqi > max.aqi ? result : max,
  );

  return {
    aqi: worst.aqi,
    category: worst.category,
    dominant: worst.pollutant,
    contributing: scored,
  };
}
