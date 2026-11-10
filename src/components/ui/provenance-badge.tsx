import { cn } from '@/lib/utils/cn';
import {
  PROVENANCE_META,
  type DataEnvelope,
  type Provenance,
} from '@/types/data-envelope';

const STYLES: Record<Provenance, string> = {
  REAL: 'text-real bg-real-soft border-real/35',
  SIMULATED: 'text-sim bg-sim-soft border-sim/35',
  STATIC: 'text-static bg-static-soft border-static/35',
  UNAVAILABLE: 'text-na bg-na-soft border-na/35',
};

interface ProvenanceBadgeProps {
  /** Pass an envelope (preferred) or a bare provenance for chrome labels. */
  envelope?: DataEnvelope<unknown>;
  provenance?: Provenance;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * The single place provenance is rendered (spec §11).
 *
 * Reading the classification off the envelope rather than from a prop written
 * by hand at the call site is what guarantees simulated values cannot be
 * presented as real measurements.
 */
export function ProvenanceBadge({
  envelope,
  provenance,
  size = 'sm',
  className,
}: ProvenanceBadgeProps) {
  const kind: Provenance = envelope?.provenance ?? provenance ?? 'UNAVAILABLE';
  const meta = PROVENANCE_META[kind];

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded border font-mono uppercase tracking-wider',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
        STYLES[kind],
        className,
      )}
      title={`${meta.label} — ${meta.description}`}
    >
      {meta.shortLabel}
      <span className="sr-only">{`. ${meta.description}`}</span>
    </span>
  );
}
