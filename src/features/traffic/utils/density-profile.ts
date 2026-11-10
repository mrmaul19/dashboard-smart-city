/**
 * Synthetic daily traffic profile.
 *
 * **This is simulated, not measured, and not even a recording of the
 * simulation.** No open historical congestion data exists for Jakarta, and the
 * live simulation only has state for as long as the 3D view has been open — so
 * a "traffic over the day" chart has no real series behind it.
 *
 * Rather than leave the chart empty or fabricate something that looks like a
 * measurement, this produces an explicit model: a fixed twin-peak weighting by
 * hour, scaled by the dashboard's current density setting. Spec §8 permits
 * simulated history provided it is clearly labelled as simulation, which the
 * chart does.
 *
 * The shape — a sharp morning peak, a high midday plateau, and a broader,
 * later evening peak — is characteristic of Jakarta's commute, but the numbers
 * are an assumption and nothing here should be read as a measurement.
 */

/** Relative load per hour of the day, where 1.0 is the daily peak. */
const HOURLY_WEIGHT: readonly number[] = [
  0.18, 0.12, 0.1, 0.11, 0.2, 0.42, // 00–05
  0.72, 0.95, 1.0, 0.86, 0.7, 0.68, // 06–11
  0.7, 0.68, 0.66, 0.7, 0.84, 0.97, // 12–17
  1.0, 0.92, 0.74, 0.56, 0.4, 0.26, // 18–23
];

export interface DensityPoint {
  /** Hour of the day, 0–23, in the city's time zone. */
  readonly hour: number;
  /** Modelled density, 0..1. */
  readonly density: number;
}

/**
 * Daily density curve for a given baseline setting.
 *
 * The baseline acts as a ceiling: at a density setting of 0.5 the modelled
 * peak is 0.5, so the chart stays consistent with what the 3D scene is
 * actually rendering.
 */
export function diurnalDensityProfile(baseDensity: number): DensityPoint[] {
  const base = Math.min(1, Math.max(0, baseDensity));

  return HOURLY_WEIGHT.map((weight, hour) => ({
    hour,
    density: Math.round(base * weight * 1000) / 1000,
  }));
}

/** Hour of the day in a given IANA time zone. */
export function hourInZone(date: Date, timezone: string): number {
  const value = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  }).format(date);

  const hour = Number.parseInt(value, 10);
  // Some engines render midnight as "24".
  return Number.isFinite(hour) ? hour % 24 : 0;
}
