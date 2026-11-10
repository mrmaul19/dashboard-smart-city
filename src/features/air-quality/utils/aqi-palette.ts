import type { AqiCategoryId } from './aqi';

/**
 * AQI category colours.
 *
 * These follow the EPA's official hue sequence — green, yellow, orange, red,
 * purple, maroon — because it is a recognised public-health scale and a
 * dashboard that recoloured it would disagree with every official source a
 * reader might cross-check.
 *
 * **Known limitation, measured not assumed.** Running this sequence through
 * the project's palette validator against the dark panel surface fails the
 * categorical adjacency checks: yellow↔orange separates by only ΔE 4.4 under
 * simulated deuteranopia and orange↔red by ΔE 9.9 even with normal colour
 * vision, against a floor of 15. That is a property of the standard's hue
 * order, not of these particular steps.
 *
 * The consequence is a hard rule for every component that uses these values:
 * **colour is never the only channel.** The numeric index and the category
 * name are always rendered alongside the colour, so a reader who cannot
 * separate the hues still gets the full answer. The steps below were chosen as
 * the variant of the official sequence that clears the 3:1 contrast
 * requirement against the dark surface for all six categories.
 */
export const AQI_COLOURS: Record<AqiCategoryId, string> = {
  good: '#2fa86d',
  moderate: '#b89a1c',
  'unhealthy-sensitive': '#cf7430',
  unhealthy: '#cf4a46',
  'very-unhealthy': '#9a5cc0',
  hazardous: '#a8365f',
};

/** Short guidance per category, paraphrased from the EPA category table. */
export const AQI_GUIDANCE: Record<AqiCategoryId, string> = {
  good: 'Air quality is satisfactory and poses little or no risk.',
  moderate:
    'Acceptable, though unusually sensitive people may want to limit prolonged exertion outdoors.',
  'unhealthy-sensitive':
    'Sensitive groups may experience health effects; the general public is less likely to be affected.',
  unhealthy:
    'Some members of the general public may experience health effects; sensitive groups more seriously.',
  'very-unhealthy':
    'Health alert: the risk of health effects is increased for everyone.',
  hazardous:
    'Health warning of emergency conditions: everyone is more likely to be affected.',
};
