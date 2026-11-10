/**
 * WMO 4677 present-weather codes, as used by Open-Meteo's `weather_code`.
 *
 * Only the codes Open-Meteo documents are listed. An unknown code is reported
 * as such rather than being rounded to the nearest familiar condition, because
 * silently relabelling a measurement is exactly what the data-integrity rule
 * exists to prevent.
 */

export type WeatherSeverity = 'calm' | 'wet' | 'severe';

export interface WeatherCodeInfo {
  readonly label: string;
  readonly severity: WeatherSeverity;
  /** True when the code implies falling precipitation, driving the rain overlay. */
  readonly precipitating: boolean;
}

const CODES: Readonly<Record<number, WeatherCodeInfo>> = {
  0: { label: 'Clear sky', severity: 'calm', precipitating: false },
  1: { label: 'Mainly clear', severity: 'calm', precipitating: false },
  2: { label: 'Partly cloudy', severity: 'calm', precipitating: false },
  3: { label: 'Overcast', severity: 'calm', precipitating: false },
  45: { label: 'Fog', severity: 'calm', precipitating: false },
  48: { label: 'Depositing rime fog', severity: 'calm', precipitating: false },
  51: { label: 'Light drizzle', severity: 'wet', precipitating: true },
  53: { label: 'Moderate drizzle', severity: 'wet', precipitating: true },
  55: { label: 'Dense drizzle', severity: 'wet', precipitating: true },
  56: { label: 'Light freezing drizzle', severity: 'wet', precipitating: true },
  57: { label: 'Dense freezing drizzle', severity: 'wet', precipitating: true },
  61: { label: 'Slight rain', severity: 'wet', precipitating: true },
  63: { label: 'Moderate rain', severity: 'wet', precipitating: true },
  65: { label: 'Heavy rain', severity: 'severe', precipitating: true },
  66: { label: 'Light freezing rain', severity: 'wet', precipitating: true },
  67: { label: 'Heavy freezing rain', severity: 'severe', precipitating: true },
  71: { label: 'Slight snowfall', severity: 'wet', precipitating: true },
  73: { label: 'Moderate snowfall', severity: 'wet', precipitating: true },
  75: { label: 'Heavy snowfall', severity: 'severe', precipitating: true },
  77: { label: 'Snow grains', severity: 'wet', precipitating: true },
  80: { label: 'Slight rain showers', severity: 'wet', precipitating: true },
  81: { label: 'Moderate rain showers', severity: 'wet', precipitating: true },
  82: { label: 'Violent rain showers', severity: 'severe', precipitating: true },
  85: { label: 'Slight snow showers', severity: 'wet', precipitating: true },
  86: { label: 'Heavy snow showers', severity: 'severe', precipitating: true },
  95: { label: 'Thunderstorm', severity: 'severe', precipitating: true },
  96: { label: 'Thunderstorm with slight hail', severity: 'severe', precipitating: true },
  99: { label: 'Thunderstorm with heavy hail', severity: 'severe', precipitating: true },
};

const UNKNOWN: WeatherCodeInfo = {
  label: 'Unknown condition',
  severity: 'calm',
  precipitating: false,
};

export function weatherCodeInfo(code: number | null | undefined): WeatherCodeInfo {
  if (code === null || code === undefined) return UNKNOWN;
  return CODES[code] ?? { ...UNKNOWN, label: `Unrecognised code ${code}` };
}

/** Compass point for a wind bearing in degrees, e.g. 225 → "SW". */
export function windCompass(degrees: number): string {
  const points = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
  ];
  // Each of the 16 points spans 22.5°, offset by half a sector so that the
  // boundary falls between points rather than on one.
  const index = Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16;
  return points[index];
}
