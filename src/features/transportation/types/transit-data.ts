/**
 * Transjakarta transit snapshot contracts.
 *
 * Type-only and import-free, so the Node-run GTFS generator in `scripts/` can
 * load it without resolving the `@/` path alias.
 *
 * **Provenance note.** Everything in this file describes *real* data from the
 * operator's published GTFS feed: route identities, colours, stop positions and
 * service headways. The only simulated part of the transport feature is where a
 * bus is at this instant — there is no official GTFS-Realtime feed — and that
 * is computed at runtime, never stored here.
 */

export interface TransitStop {
  readonly id: string;
  readonly name: string;
  /** Position in local scene metres. */
  readonly position: readonly [number, number];
  readonly latLon: readonly [number, number];
  /** GTFS `wheelchair_boarding`: 0 unknown, 1 accessible, 2 not accessible. */
  readonly wheelchairBoarding: number | null;
}

/**
 * One contiguous run of a route's shape inside the study area.
 *
 * City-wide routes are clipped to the rendered area, and a route that leaves
 * and re-enters produces several fragments rather than a straight line across
 * the gap, which would draw a road that does not exist.
 */
export interface RouteFragment {
  /** Polyline in local metres, flat `[x, z, …]`. */
  readonly path: readonly number[];
  /** Length of this fragment in metres, for headway-based spacing. */
  readonly lengthM: number;
}

export interface TransitRoute {
  readonly id: string;
  readonly shortName: string;
  readonly longName: string;
  /** GTFS `route_color`, as `#rrggbb`. */
  readonly colour: string;
  readonly textColour: string;
  /** GTFS route_type (3 = bus). */
  readonly routeType: number;
  /**
   * Service headway in seconds, from `frequencies.txt`. This is **real
   * scheduled data**, and it is what drives the simulated bus spacing.
   */
  readonly headwaySec: number | null;
  /** Number of headway entries the value was derived from. */
  readonly headwaySamples: number;
  readonly fragments: readonly RouteFragment[];
  /** Stop ids served by this route that fall inside the study area. */
  readonly stopIds: readonly string[];
}

export interface TransitManifest {
  readonly city: string;
  readonly generatedAt: string;
  /** When the operator last regenerated the feed, from the HTTP response. */
  readonly feedLastModified: string | null;
  readonly origin: { readonly lat: number; readonly lon: number };
  readonly agency: {
    readonly name: string;
    readonly url: string;
    readonly timezone: string;
  };
  readonly source: {
    readonly url: string;
    readonly licence: string;
    readonly attribution: string;
  };
  /** Totals in the whole feed, before clipping to the study area. */
  readonly feedTotals: {
    readonly routes: number;
    readonly stops: number;
    readonly trips: number;
    readonly shapePoints: number;
    readonly frequencies: number;
  };
  /** Totals after clipping. */
  readonly counts: {
    readonly routes: number;
    readonly stops: number;
    readonly fragments: number;
  };
}

export interface TransitSnapshot {
  readonly manifest: TransitManifest;
  readonly routes: readonly TransitRoute[];
  readonly stops: readonly TransitStop[];
}
