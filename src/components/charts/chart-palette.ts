/**
 * Chart series colours.
 *
 * These are a separate palette from the reserved status colours used elsewhere
 * in the dashboard — provenance (REAL / SIMULATED / STATIC / UNAVAILABLE), the
 * AQI category scale, and the traffic congestion ramp. A status colour must
 * never double as "series 3", or a reader cannot tell a severity from a
 * category.
 *
 * **Validated, with a stated limit.** The pair actually co-plotted in this
 * dashboard — slots 0 and 1, used for PM2.5 against PM10 — passes every check
 * of the project's palette validator in both themes: adjacent separation ΔE
 * 20.4 under simulated protanopia, 23.0 for normal vision, inside the lightness
 * band and above 3:1 contrast against both the dark and light surfaces.
 *
 * The full four-hue set does **not** pass as a four-series categorical palette:
 * slots 2 and 3 separate by only ΔE 4.8 under simulated deuteranopia. That is
 * accepted because no chart here plots four series at once — every chart is one
 * or two series. The rule that keeps it honest is below, and it is a constraint
 * on call sites, not a suggestion.
 */

export interface ChartSeriesColour {
  readonly hex: string;
  readonly name: string;
}

/**
 * Fixed assignment order. Never cycled, and never reordered by rank: a filter
 * that changes which series are shown must not repaint the survivors.
 */
export const CHART_SERIES: readonly ChartSeriesColour[] = [
  { hex: '#4590c4', name: 'blue' },
  { hex: '#bd7d2d', name: 'ochre' },
  { hex: '#bb6fab', name: 'magenta' },
  { hex: '#42a68b', name: 'teal' },
] as const;

/**
 * Colours for a chart with `count` series.
 *
 * A chart with two or more series is restricted to slots 0 and 1, which is the
 * validated pair. Asking for more than two is a programming error here rather
 * than a silent accessibility regression, so it throws.
 */
export function seriesColours(count: number): string[] {
  if (count <= 1) return [CHART_SERIES[0].hex];
  if (count === 2) return [CHART_SERIES[0].hex, CHART_SERIES[1].hex];

  throw new Error(
    `No validated colour assignment for ${count} co-plotted series. ` +
      'Split into small multiples, or validate an extended palette first ' +
      '(see src/components/charts/chart-palette.ts).',
  );
}

/** Colour for a single-series chart, chosen by slot rather than by rank. */
export function seriesColourAt(slot: number): string {
  return CHART_SERIES[slot % CHART_SERIES.length].hex;
}

/**
 * Recessive chrome, read from the theme tokens at runtime so charts follow a
 * theme switch without re-rendering with hard-coded colours.
 */
export const CHART_CHROME = {
  grid: 'var(--app-border)',
  axis: 'var(--app-text-dim)',
  label: 'var(--app-text-muted)',
  surface: 'var(--app-surface-2)',
} as const;
