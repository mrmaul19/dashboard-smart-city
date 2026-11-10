import type {
  BuildingCategory,
  FacilityCategory,
  GreenKind,
  RoadClass,
} from '../types/city-data';

/**
 * OSM tag to application category mapping.
 *
 * OSM tagging is open-ended, so these mappings are deliberately conservative:
 * anything unrecognised falls through to `other` rather than being guessed into
 * a category it might not belong to. Type-only imports keep this module usable
 * from the Node-run snapshot generator.
 */

const RESIDENTIAL_BUILDINGS = new Set([
  'residential',
  'house',
  'apartments',
  'detached',
  'semidetached_house',
  'terrace',
  'dormitory',
  'bungalow',
  'hut',
  'cabin',
]);

const COMMERCIAL_BUILDINGS = new Set([
  'commercial',
  'retail',
  'shop',
  'supermarket',
  'mall',
  'kiosk',
  'hotel',
  'restaurant',
]);

const INDUSTRIAL_BUILDINGS = new Set([
  'industrial',
  'warehouse',
  'factory',
  'manufacture',
  'hangar',
  'storage_tank',
]);

const PUBLIC_BUILDINGS = new Set([
  'public',
  'civic',
  'government',
  'hospital',
  'school',
  'university',
  'college',
  'kindergarten',
  'mosque',
  'church',
  'temple',
  'cathedral',
  'chapel',
  'religious',
  'train_station',
  'transportation',
  'museum',
  'stadium',
  'sports_hall',
  'fire_station',
  'police',
]);

const PUBLIC_AMENITIES = new Set([
  'hospital',
  'clinic',
  'school',
  'university',
  'college',
  'place_of_worship',
  'police',
  'fire_station',
  'townhall',
]);

export function classifyBuilding(
  tags: Readonly<Record<string, string>>,
): BuildingCategory {
  const building = tags.building ?? '';

  // Function tags are more reliable than the `building` value, which is very
  // often just `yes`, so they are checked first.
  if (tags.office) return 'office';
  if (tags.shop || tags.craft) return 'commercial';
  if (tags.amenity && PUBLIC_AMENITIES.has(tags.amenity)) return 'public';
  if (tags.tourism === 'hotel' || tags.amenity === 'restaurant') {
    return 'commercial';
  }

  if (building === 'office') return 'office';
  if (RESIDENTIAL_BUILDINGS.has(building)) return 'residential';
  if (COMMERCIAL_BUILDINGS.has(building)) return 'commercial';
  if (INDUSTRIAL_BUILDINGS.has(building)) return 'industrial';
  if (PUBLIC_BUILDINGS.has(building)) return 'public';

  // `building=yes` carries no information: treat it as unclassified rather
  // than assuming residential, even though that is statistically likely.
  return 'other';
}

const ROAD_CLASSES = new Set<RoadClass>([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'service',
  'pedestrian',
]);

const NON_CARRIAGEWAY = new Set([
  'footway',
  'path',
  'steps',
  'cycleway',
  'track',
  'corridor',
  'bridleway',
  'raceway',
  'construction',
  'proposed',
]);

/**
 * Map an OSM `highway` value to a rendered road class, or `null` for ways that
 * are not a carriageway (footpaths, cycleways, steps, raceways and so on).
 */
export function classifyRoad(
  tags: Readonly<Record<string, string>>,
): RoadClass | null {
  const highway = tags.highway ?? '';

  // Link roads are ramps: render them as their parent class.
  const base = highway.endsWith('_link') ? highway.slice(0, -5) : highway;

  if (NON_CARRIAGEWAY.has(base)) return null;
  if (base === 'living_street' || base === 'unclassified') return 'residential';

  return ROAD_CLASSES.has(base as RoadClass) ? (base as RoadClass) : null;
}

/** Nominal carriageway width per class, in metres, used when `lanes` is absent. */
const DEFAULT_WIDTH_M: Record<RoadClass, number> = {
  motorway: 16,
  trunk: 14,
  primary: 12,
  secondary: 10,
  tertiary: 8,
  residential: 6,
  service: 4.5,
  pedestrian: 5,
};

const METRES_PER_LANE = 3.25;

/**
 * Rendered road width. `lanes` is used when tagged, since it is far more
 * accurate than a per-class default, and is clamped so that a mis-tagged value
 * cannot produce a road wider than a city block.
 */
export function roadWidthM(roadClass: RoadClass, lanes: number | null): number {
  if (lanes !== null && lanes > 0 && lanes <= 12) {
    return Math.max(3, lanes * METRES_PER_LANE);
  }
  return DEFAULT_WIDTH_M[roadClass];
}

export function parseLanes(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number.parseInt(raw.split(/[;,]/)[0] ?? '', 10);
  return Number.isFinite(value) && value > 0 && value <= 12 ? value : null;
}

export function isOneway(tags: Readonly<Record<string, string>>): boolean {
  const value = tags.oneway;
  return value === 'yes' || value === '1' || value === '-1';
}

/**
 * Classify a green or water area. Returns `null` for areas that should not be
 * rendered as green space.
 */
export function classifyGreen(
  tags: Readonly<Record<string, string>>,
): GreenKind | null {
  if (tags.leisure === 'park') return 'park';
  if (tags.leisure === 'garden') return 'garden';
  if (tags.leisure === 'pitch' || tags.leisure === 'sports_centre') {
    return 'pitch';
  }
  if (tags.landuse === 'forest' || tags.natural === 'wood') return 'forest';
  if (tags.landuse === 'grass' || tags.natural === 'grassland') return 'grass';
  if (tags.leisure === 'recreation_ground' || tags.landuse === 'village_green') {
    return 'grass';
  }
  if (tags.natural === 'water' || tags.waterway === 'riverbank') return 'water';
  if (tags.landuse === 'reservoir') return 'water';
  return null;
}

const FACILITY_BY_AMENITY: Readonly<Record<string, FacilityCategory>> = {
  hospital: 'hospital',
  clinic: 'clinic',
  doctors: 'clinic',
  dentist: 'clinic',
  pharmacy: 'clinic',
  school: 'school',
  kindergarten: 'school',
  university: 'university',
  college: 'university',
  place_of_worship: 'place_of_worship',
  restaurant: 'restaurant',
  cafe: 'restaurant',
  fast_food: 'restaurant',
  food_court: 'restaurant',
  marketplace: 'market',
  police: 'police',
  fire_station: 'fire_station',
  townhall: 'government',
  courthouse: 'government',
  embassy: 'government',
  bus_station: 'transport',
  ferry_terminal: 'transport',
};

/** Classify a public facility. Returns `null` when the feature is not one. */
export function classifyFacility(
  tags: Readonly<Record<string, string>>,
): FacilityCategory | null {
  const amenity = tags.amenity;
  if (amenity && amenity in FACILITY_BY_AMENITY) {
    return FACILITY_BY_AMENITY[amenity];
  }

  if (tags.healthcare) return 'clinic';
  if (tags.shop === 'supermarket' || tags.shop === 'mall') return 'market';
  if (tags.public_transport === 'station' || tags.railway === 'station') {
    return 'transport';
  }
  if (tags.highway === 'bus_stop') return 'transport';
  if (tags.office === 'government') return 'government';

  return null;
}

/**
 * Tags kept in the snapshot and shown in the information panel.
 *
 * A whitelist rather than everything: OSM features can carry dozens of tags
 * (source references, import metadata, per-language names) that would bloat the
 * snapshot without telling the user anything useful.
 */
export const KEPT_TAGS: readonly string[] = [
  'name',
  'name:en',
  'name:id',
  'building',
  'building:levels',
  'roof:levels',
  'height',
  'amenity',
  'shop',
  'office',
  'tourism',
  'leisure',
  'landuse',
  'natural',
  'healthcare',
  'religion',
  'operator',
  'brand',
  'cuisine',
  'addr:street',
  'addr:housenumber',
  'addr:city',
  'addr:postcode',
  'highway',
  'lanes',
  'oneway',
  'maxspeed',
  'surface',
  'bridge',
  'layer',
  'public_transport',
  'railway',
  'website',
  'phone',
  'opening_hours',
  'wheelchair',
  'start_date',
] as const;

const KEPT_TAG_SET = new Set(KEPT_TAGS);

export function pickTags(
  tags: Readonly<Record<string, string>>,
): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (KEPT_TAG_SET.has(key)) picked[key] = value;
  }
  return picked;
}
