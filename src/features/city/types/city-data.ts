/**
 * Snapshot data contracts, shared by the build-time generator and the runtime
 * renderer.
 *
 * This module intentionally contains **types only and no imports**, because the
 * generator in `scripts/` runs under plain Node and cannot resolve the `@/`
 * path alias. Keeping the contract dependency-free is what lets both sides
 * agree on the shape of the data.
 *
 * Geometry is stored pre-projected into local scene metres (see
 * `src/lib/geo/projection.ts`), as flat `[x, z, x, z, …]` arrays rather than
 * arrays of objects: it parses faster, is far smaller on the wire, and is the
 * layout the geometry builders need anyway.
 */

export type BuildingCategory =
  | 'residential'
  | 'commercial'
  | 'office'
  | 'industrial'
  | 'public'
  | 'other';

/**
 * How a building's height was determined.
 *
 * Only 1.4% of Jakarta's OSM footprints carry `building:levels` and 0.04%
 * carry `height`, so `DERIVED` is the overwhelmingly common case. The
 * distinction is carried all the way to the UI, where derived heights are
 * labelled as estimates rather than presented as measurements.
 */
export type HeightSource = 'OSM_HEIGHT' | 'OSM_LEVELS' | 'DERIVED';

export interface SnapshotBuilding {
  /** Stable id, `w<osmId>` or `r<osmId>`. */
  readonly id: string;
  readonly osmId: number;
  readonly osmType: 'way' | 'relation';
  /** Closed outer ring, flat `[x, z, …]` in metres. No repeated last point. */
  readonly ring: readonly number[];
  readonly heightM: number;
  readonly heightSource: HeightSource;
  readonly category: BuildingCategory;
  /** Footprint centroid in metres, used for labels and camera focus. */
  readonly centroid: readonly [number, number];
  /** Footprint centroid in degrees, for display and for the inverse lookup. */
  readonly centroidLatLon: readonly [number, number];
  readonly areaM2: number;
  /** Whitelisted OSM tags, shown verbatim in the information panel. */
  readonly tags: Readonly<Record<string, string>>;
}

export type RoadClass =
  | 'motorway'
  | 'trunk'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'residential'
  | 'service'
  | 'pedestrian';

export interface SnapshotRoad {
  readonly id: string;
  readonly osmId: number;
  /** Polyline, flat `[x, z, …]` in metres. */
  readonly path: readonly number[];
  readonly roadClass: RoadClass;
  readonly name: string | null;
  readonly lanes: number | null;
  readonly oneway: boolean;
  /** Rendered carriageway width in metres, derived from class and lanes. */
  readonly widthM: number;
}

export type GreenKind = 'park' | 'garden' | 'forest' | 'grass' | 'water' | 'pitch';

export interface SnapshotGreenArea {
  readonly id: string;
  readonly osmId: number;
  readonly ring: readonly number[];
  readonly kind: GreenKind;
  readonly name: string | null;
  readonly areaM2: number;
}

export type FacilityCategory =
  | 'hospital'
  | 'clinic'
  | 'school'
  | 'university'
  | 'place_of_worship'
  | 'restaurant'
  | 'market'
  | 'police'
  | 'fire_station'
  | 'government'
  | 'transport'
  | 'other';

export interface SnapshotFacility {
  readonly id: string;
  readonly osmId: number;
  readonly osmType: 'node' | 'way' | 'relation';
  readonly category: FacilityCategory;
  readonly name: string | null;
  /** Position in metres. */
  readonly position: readonly [number, number];
  readonly latLon: readonly [number, number];
  readonly tags: Readonly<Record<string, string>>;
}

/** One geometry tile. Tiles are square and aligned to the study-area grid. */
export interface CityTile {
  /** Tile key, `<col>_<row>`, matching the manifest. */
  readonly key: string;
  readonly buildings: readonly SnapshotBuilding[];
  readonly roads: readonly SnapshotRoad[];
  readonly green: readonly SnapshotGreenArea[];
  readonly facilities: readonly SnapshotFacility[];
}

export interface CityTileRef {
  readonly key: string;
  readonly col: number;
  readonly row: number;
  /** Tile centre in local metres, used for distance-based loading. */
  readonly centre: readonly [number, number];
  readonly file: string;
  readonly counts: {
    readonly buildings: number;
    readonly roads: number;
    readonly green: number;
    readonly facilities: number;
  };
}

/**
 * Index of a generated snapshot. The renderer reads this first and then pulls
 * only the tiles it needs, which is what makes area-based loading possible
 * without a server.
 */
export interface CityManifest {
  readonly city: string;
  readonly generatedAt: string;
  /** Projection origin — geometry is meaningless without it. */
  readonly origin: { readonly lat: number; readonly lon: number };
  readonly bbox: {
    readonly minLat: number;
    readonly minLon: number;
    readonly maxLat: number;
    readonly maxLon: number;
  };
  readonly tileSizeM: number;
  readonly extentM: number;
  /** Which adapter produced the data, and the attribution it carries. */
  readonly source: {
    readonly adapter: 'overpass' | 'osm-map-api';
    readonly endpoint: string;
    readonly licence: string;
    readonly attribution: string;
  };
  readonly counts: {
    readonly buildings: number;
    readonly roads: number;
    readonly green: number;
    readonly facilities: number;
  };
  /** Share of buildings whose height came from an OSM tag rather than a heuristic. */
  readonly heightTagCoverage: {
    readonly osmHeight: number;
    readonly osmLevels: number;
    readonly derived: number;
  };
  readonly tiles: readonly CityTileRef[];
}
