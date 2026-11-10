'use client';

import { ExternalLink } from 'lucide-react';
import { DataValue } from '@/components/ui/data-value';
import { SOURCE_OSM } from '@/lib/constants/data-sources';
import { formatCoordinates, formatInteger, formatNumber } from '@/lib/utils/format';
import { realValue, staticValue } from '@/types/data-envelope';
import type { HeightSource, SnapshotBuilding } from '../types/city-data';

/**
 * Details for a selected building (spec §4).
 *
 * The height's provenance depends on how it was obtained, and the three cases
 * are genuinely different claims:
 *
 * - `OSM_HEIGHT`  a surveyed height tag — a real measurement.
 * - `OSM_LEVELS`  a real storey count, multiplied by an assumed 3.2 m floor
 *                 height, so the metre figure is derived, not measured.
 * - `DERIVED`     no height information at all; inferred from the building's
 *                 category and footprint area.
 */
const HEIGHT_NOTE: Record<HeightSource, string> = {
  OSM_HEIGHT: 'Surveyed height tag from OpenStreetMap',
  OSM_LEVELS: 'Derived from building:levels × 3.2 m assumed floor height',
  DERIVED: 'Estimated from building category and footprint area — not measured',
};

function heightEnvelope(building: SnapshotBuilding) {
  const note = HEIGHT_NOTE[building.heightSource];

  if (building.heightSource === 'OSM_HEIGHT') {
    return realValue<number>({
      value: building.heightM,
      source: SOURCE_OSM,
      unit: 'm',
      note,
      location: {
        lat: building.centroidLatLon[0],
        lon: building.centroidLatLon[1],
      },
    });
  }

  return staticValue<number>({
    value: building.heightM,
    source: SOURCE_OSM,
    unit: 'm',
    note,
  });
}

export function BuildingDetails({ building }: { building: SnapshotBuilding }) {
  const [lat, lon] = building.centroidLatLon;
  const osmUrl = `https://www.openstreetmap.org/${building.osmType}/${building.osmId}`;
  const tagEntries = Object.entries(building.tags);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <DataValue
          label="Estimated height"
          envelope={heightEnvelope(building)}
          format={(value) => formatNumber(value, 1)}
          showProvenanceFooter={false}
        />
        <DataValue
          label="Footprint area"
          envelope={realValue<number>({
            value: building.areaM2,
            source: SOURCE_OSM,
            unit: 'm²',
          })}
          format={(value) => formatInteger(value)}
          showProvenanceFooter={false}
        />
      </div>

      <p className="text-[11px] leading-snug text-dim">
        {HEIGHT_NOTE[building.heightSource]}
      </p>

      <dl className="readout space-y-1 text-[11px]">
        <div className="flex justify-between gap-2">
          <dt className="text-dim">Category</dt>
          <dd className="text-muted">{building.category}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-dim">Coordinates</dt>
          <dd className="text-right text-muted">
            {formatCoordinates(lat, lon)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-dim">OSM id</dt>
          <dd className="text-muted">
            <a
              href={osmUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-fg"
            >
              {building.osmType}/{building.osmId}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </dd>
        </div>
      </dl>

      <div>
        <h4 className="panel-heading mb-1.5">
          OpenStreetMap tags ({tagEntries.length})
        </h4>
        {tagEntries.length > 0 ? (
          <dl className="readout space-y-0.5 text-[11px]">
            {tagEntries.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-2">
                <dt className="shrink-0 text-dim">{key}</dt>
                <dd className="truncate text-right text-muted" title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-[11px] text-dim">
            This footprint carries no tags beyond `building`, which is the case
            for most buildings in Jakarta.
          </p>
        )}
      </div>
    </div>
  );
}
