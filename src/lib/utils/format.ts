import { DEFAULT_CITY } from '@/lib/constants/cities';

/**
 * Formatting helpers.
 *
 * Every timestamp the dashboard shows is rendered in the selected city's time
 * zone, not the viewer's, so that a measurement timestamp means the same thing
 * to an operator in Jakarta and a reviewer elsewhere. The time zone is always
 * displayed alongside the value.
 */

const LOCALE = 'en-GB';

export function formatTime(
  date: Date | string,
  timezone: string = DEFAULT_CITY.timezone,
): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(new Date(date));
}

export function formatDate(
  date: Date | string,
  timezone: string = DEFAULT_CITY.timezone,
): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: timezone,
  }).format(new Date(date));
}

export function formatDateTime(
  date: Date | string,
  timezone: string = DEFAULT_CITY.timezone,
): string {
  return `${formatDate(date, timezone)} ${formatTime(date, timezone)}`;
}

/** Short time-zone label, e.g. "GMT+7", for display next to a timestamp. */
export function timezoneLabel(
  timezone: string = DEFAULT_CITY.timezone,
  date: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat(LOCALE, {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
  }).formatToParts(date);
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timezone;
}

/**
 * Compact "how old is this measurement" label. Measurement age matters here:
 * OpenAQ's own docs warn that a station's "latest" value is not necessarily
 * recent, so the UI always shows how stale a reading is.
 */
export function formatRelativeAge(
  from: Date | string,
  now: Date = new Date(),
): string {
  const ms = now.getTime() - new Date(from).getTime();
  const seconds = Math.round(ms / 1000);

  if (!Number.isFinite(seconds)) return 'unknown';
  if (seconds < 0) return 'in the future';
  if (seconds < 45) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

export function formatNumber(
  value: number,
  fractionDigits = 1,
): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(value);
}

/** Format a coordinate pair for display, e.g. "6.2088° S, 106.8456° E". */
export function formatCoordinates(lat: number, lon: number): string {
  const latHem = lat >= 0 ? 'N' : 'S';
  const lonHem = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latHem}, ${Math.abs(lon).toFixed(4)}° ${lonHem}`;
}
