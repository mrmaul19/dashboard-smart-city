import type { DailyPoint, HourlyPoint } from '../types/weather';

/**
 * Series helpers.
 *
 * Open-Meteo returns hourly and daily timestamps as **local** wall-clock
 * strings for the requested zone, with no offset suffix (`2026-11-06T20:00`).
 * Rather than reconstruct instants from them, these helpers build the same
 * kind of local key for "now" in the city's zone and compare as strings: ISO
 * date-time strings of identical shape sort chronologically, so this is both
 * correct and immune to the viewer's own time zone.
 */

/** Local `YYYY-MM-DDTHH:00` key for an instant, in the given zone. */
export function localHourKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '00';

  // `hour12: false` can render midnight as "24" in some engines.
  const hour = get('hour') === '24' ? '00' : get('hour');

  return `${get('year')}-${get('month')}-${get('day')}T${hour}:00`;
}

/** Local `YYYY-MM-DD` key for an instant, in the given zone. */
export function localDayKey(date: Date, timezone: string): string {
  return localHourKey(date, timezone).slice(0, 10);
}

/**
 * The next `count` hourly points, starting at the current local hour.
 *
 * The request asks for a day of history to feed later trend views, so the
 * series starts in the past and has to be trimmed before being shown as a
 * forecast.
 */
export function upcomingHours(
  points: readonly HourlyPoint[],
  timezone: string,
  now: Date,
  count = 24,
): readonly HourlyPoint[] {
  const key = localHourKey(now, timezone);
  const start = points.findIndex((point) => point.time >= key);

  if (start === -1) {
    // Every point is in the past: show the tail rather than nothing.
    return points.slice(-count);
  }

  return points.slice(start, start + count);
}

/** Daily points from today onward, dropping the requested history. */
export function upcomingDays(
  points: readonly DailyPoint[],
  timezone: string,
  now: Date,
): readonly DailyPoint[] {
  const key = localDayKey(now, timezone);
  const start = points.findIndex((point) => point.date >= key);
  return start === -1 ? points : points.slice(start);
}

/** Highest precipitation in a series, used to scale the rainfall bars. */
export function peakPrecipitation(points: readonly HourlyPoint[]): number {
  return points.reduce(
    (max, point) => Math.max(max, point.precipitationMm ?? 0),
    0,
  );
}
