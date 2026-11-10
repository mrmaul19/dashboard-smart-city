import {
  SOURCE_OPENAQ,
  SOURCE_OPEN_METEO,
  SOURCE_OSM,
  SOURCE_TRANSJAKARTA_GTFS,
} from '@/lib/constants/data-sources';
import { cn } from '@/lib/utils/cn';

const SOURCES = [
  SOURCE_OSM,
  SOURCE_OPEN_METEO,
  SOURCE_OPENAQ,
  SOURCE_TRANSJAKARTA_GTFS,
];

/**
 * Required attribution (spec §5).
 *
 * OpenStreetMap's ODbL and Open-Meteo's CC-BY 4.0 both oblige us to credit the
 * source next to the data, with a link. This component is the single place that
 * obligation is met, so it must stay mounted wherever their data is displayed.
 */
export function Attribution({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <span className="panel-heading">Data</span>
      {SOURCES.map((source) => (
        <a
          key={source.name}
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          title={`${source.attribution ?? source.name} — ${source.licence}`}
          className="text-[10px] text-dim underline decoration-dotted underline-offset-2 hover:text-muted"
        >
          {source.attribution ?? source.name}
        </a>
      ))}
    </div>
  );
}
