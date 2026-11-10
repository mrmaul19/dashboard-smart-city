import { SOURCE_OPEN_METEO } from '@/lib/constants/data-sources';
import { cn } from '@/lib/utils/cn';

/**
 * Required Open-Meteo attribution.
 *
 * Open-Meteo publishes its data under CC-BY 4.0 and its licence page states
 * the obligation directly: a link must appear next to any location where the
 * data is displayed. This component is how that obligation is met, so it must
 * stay mounted wherever weather values are shown. Do not remove it to tidy up
 * a layout.
 */
export function WeatherAttribution({ className }: { className?: string }) {
  return (
    <a
      href={SOURCE_OPEN_METEO.url}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        'text-[10px] text-dim underline decoration-dotted underline-offset-2 hover:text-muted',
        className,
      )}
    >
      {SOURCE_OPEN_METEO.attribution}
    </a>
  );
}
