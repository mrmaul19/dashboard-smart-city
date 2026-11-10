'use client';

import { useMemo } from 'react';
import { Instance, Instances } from '@react-three/drei';
import type { LoadedTile } from '@/features/city/hooks/use-city-data';
import type {
  FacilityCategory,
  SnapshotFacility,
} from '@/features/city/types/city-data';

/**
 * Public facility markers.
 *
 * Grouping: OSM gives a dozen facility categories, which is far too many to
 * tell apart by colour. They are folded into four groups that each get one
 * hue, and the exact category is always named in the information panel on
 * click, so identity never rests on colour alone.
 *
 * The four hues were checked with the data-visualisation palette validator
 * against this theme's dark surface (#060910): worst adjacent pair ΔE 10.9
 * under simulated protanopia and 18.2 for normal vision, all four inside the
 * dark-mode lightness band with contrast above 3:1. They are deliberately
 * distinct from the reserved provenance colours.
 */

export type FacilityGroup = 'health' | 'education' | 'worship' | 'civic';

export const FACILITY_GROUP_COLOURS: Record<FacilityGroup, string> = {
  health: '#e4526e',
  education: '#8a6ef2',
  worship: '#36a383',
  civic: '#c07f2a',
};

export const FACILITY_GROUP_LABELS: Record<FacilityGroup, string> = {
  health: 'Health',
  education: 'Education',
  worship: 'Places of worship',
  civic: 'Civic and services',
};

const GROUP_BY_CATEGORY: Record<FacilityCategory, FacilityGroup> = {
  hospital: 'health',
  clinic: 'health',
  school: 'education',
  university: 'education',
  place_of_worship: 'worship',
  police: 'civic',
  fire_station: 'civic',
  government: 'civic',
  market: 'civic',
  restaurant: 'civic',
  transport: 'civic',
  other: 'civic',
};

export function facilityGroup(category: FacilityCategory): FacilityGroup {
  return GROUP_BY_CATEGORY[category];
}

interface FacilityMarkersProps {
  tiles: readonly LoadedTile[];
  onSelect: (facility: SnapshotFacility) => void;
}

/**
 * Markers are drawn as instanced inverted cones whose tip sits on the ground,
 * so the point of the marker reads as its exact position. All facilities share
 * one instanced mesh: a single draw call regardless of count.
 */
export function FacilityMarkers({ tiles, onSelect }: FacilityMarkersProps) {
  const facilities = useMemo(
    () => tiles.flatMap((tile) => tile.facilities),
    [tiles],
  );

  if (facilities.length === 0) return null;

  return (
    <Instances
      // `limit` sizes the instance buffer; `range` keeps the draw call to the
      // instances actually in use.
      limit={Math.max(facilities.length, 1)}
      range={facilities.length}
      name="facilities"
    >
      <coneGeometry args={[4, 11, 6]} />
      <meshLambertMaterial />

      {facilities.map((facility) => (
        <Instance
          key={facility.id}
          // Cone geometry is centred on its own height, and rotating by PI
          // puts the tip at the bottom; the position lifts it so the tip rests
          // just above the ground plane.
          position={[facility.position[0], 7.5, facility.position[1]]}
          rotation={[Math.PI, 0, 0]}
          color={FACILITY_GROUP_COLOURS[facilityGroup(facility.category)]}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(facility);
          }}
          onPointerOver={() => {
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'auto';
          }}
        />
      ))}
    </Instances>
  );
}
