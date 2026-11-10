/**
 * Data integrity core (project spec §11).
 *
 * Every value that reaches the UI is wrapped in a `DataEnvelope`, which forces
 * a provenance classification to travel with the value itself. This is a
 * deliberate design constraint: because panels render provenance from the
 * envelope rather than from hand-written copy, it is not possible to display a
 * simulated number as if it were a real-world measurement by forgetting a
 * caption somewhere.
 */

/**
 * - `REAL`        retrieved from an actual public API (Open-Meteo, OpenAQ, OSM, GTFS).
 * - `SIMULATED`   produced by this application's simulation engine.
 * - `STATIC`      predefined application configuration, or a value derived from
 *                 configuration (e.g. a building height estimated from OSM tags).
 * - `UNAVAILABLE` no reliable source exists right now; `value` is always `null`.
 */
export type Provenance = 'REAL' | 'SIMULATED' | 'STATIC' | 'UNAVAILABLE';

/** Where a value came from, including the attribution we are obliged to show. */
export interface DataSourceRef {
  /** Human-readable source name, e.g. "Open-Meteo". */
  readonly name: string;
  /** Canonical URL for the source, used for the required attribution link. */
  readonly url: string;
  /** Licence identifier or short description, e.g. "CC-BY 4.0", "ODbL 1.0". */
  readonly licence: string;
  /**
   * Extra attribution text mandated by the provider for this specific record.
   * OpenAQ, for example, returns a per-location `licenses[].attribution`.
   */
  readonly attribution?: string;
}

/** Geographic context for a measurement, when the provider supplies one. */
export interface GeoPointRef {
  readonly lat: number;
  readonly lon: number;
  readonly label?: string;
}

export interface DataEnvelope<T> {
  readonly provenance: Provenance;
  /** `null` whenever `provenance === 'UNAVAILABLE'`. */
  readonly value: T | null;
  readonly source: DataSourceRef;
  /** ISO 8601 timestamp reported by the provider. `null` when it reports none. */
  readonly measuredAt: string | null;
  /**
   * ISO 8601 timestamp of when this application retrieved the value, or `null`
   * for values that were never fetched (static configuration, or an
   * UNAVAILABLE placeholder). Fetch-time code supplies it explicitly.
   */
  readonly fetchedAt: string | null;
  /** Unit of measurement, e.g. "°C", "µg/m³", "ppm". `null` for unitless values. */
  readonly unit: string | null;
  readonly location?: GeoPointRef;
  /** Short qualifier shown next to the value, e.g. "estimated from building:levels". */
  readonly note?: string;
}

interface EnvelopeInit<T> {
  value: T;
  source: DataSourceRef;
  measuredAt?: string | null;
  fetchedAt?: string | null;
  unit?: string | null;
  location?: GeoPointRef;
  note?: string;
}

/**
 * None of these factories read the clock.
 *
 * A factory that defaulted `fetchedAt` to `new Date()` could not be called
 * during a render — Next's Cache Components rejects an unstable value in a
 * prerender, and rightly so, since the timestamp would be baked into static
 * output. More importantly it was dishonest: only the code that actually
 * performed a fetch knows when it happened. Fetch-time code passes the
 * timestamp in; everything else leaves it null.
 */

/** Wrap a measurement actually returned by a public API. */
export function realValue<T>(init: EnvelopeInit<T>): DataEnvelope<T> {
  return {
    provenance: 'REAL',
    value: init.value,
    source: init.source,
    measuredAt: init.measuredAt ?? null,
    fetchedAt: init.fetchedAt ?? null,
    unit: init.unit ?? null,
    location: init.location,
    note: init.note,
  };
}

/** Wrap a value produced by this application's simulation engine. */
export function simulatedValue<T>(init: EnvelopeInit<T>): DataEnvelope<T> {
  return {
    provenance: 'SIMULATED',
    value: init.value,
    source: init.source,
    measuredAt: init.measuredAt ?? null,
    fetchedAt: init.fetchedAt ?? null,
    unit: init.unit ?? null,
    location: init.location,
    note: init.note,
  };
}

/** Wrap predefined configuration, or a value derived from it. */
export function staticValue<T>(init: EnvelopeInit<T>): DataEnvelope<T> {
  return {
    provenance: 'STATIC',
    value: init.value,
    source: init.source,
    measuredAt: init.measuredAt ?? null,
    fetchedAt: init.fetchedAt ?? null,
    unit: init.unit ?? null,
    location: init.location,
    note: init.note,
  };
}

/**
 * Declare that no reliable value exists. `note` should explain why, because it
 * is surfaced to the user (e.g. "no OpenAQ monitoring station within 25 km").
 */
export function unavailableValue<T>(init: {
  source: DataSourceRef;
  note: string;
  fetchedAt?: string | null;
  unit?: string | null;
  location?: GeoPointRef;
}): DataEnvelope<T> {
  return {
    provenance: 'UNAVAILABLE',
    value: null,
    source: init.source,
    measuredAt: null,
    fetchedAt: init.fetchedAt ?? null,
    unit: init.unit ?? null,
    location: init.location,
    note: init.note,
  };
}

/**
 * Type guard narrowing an envelope to one that carries a usable value, so that
 * rendering code cannot read `.value` without first handling the absent case.
 */
export function hasValue<T>(
  envelope: DataEnvelope<T>,
): envelope is DataEnvelope<T> & { value: T } {
  return envelope.provenance !== 'UNAVAILABLE' && envelope.value !== null;
}

export interface ProvenanceMeta {
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
}

export const PROVENANCE_META: Record<Provenance, ProvenanceMeta> = {
  REAL: {
    label: 'Real data',
    shortLabel: 'REAL',
    description: 'Measured value retrieved from a public API.',
  },
  SIMULATED: {
    label: 'Simulated',
    shortLabel: 'SIM',
    description: 'Generated by this application. Not a real-world measurement.',
  },
  STATIC: {
    label: 'Static / derived',
    shortLabel: 'STATIC',
    description: 'Predefined configuration or a value derived from it.',
  },
  UNAVAILABLE: {
    label: 'Unavailable',
    shortLabel: 'N/A',
    description: 'No reliable data source is available.',
  },
};
