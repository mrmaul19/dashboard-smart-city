import { cn } from '@/lib/utils/cn';
import { formatRelativeAge } from '@/lib/utils/format';
import { hasValue, type DataEnvelope } from '@/types/data-envelope';
import { ProvenanceBadge } from './provenance-badge';

interface DataValueProps<T> {
  envelope: DataEnvelope<T>;
  /** Sentence case, no trailing colon. */
  label: string;
  format?: (value: T) => string;
  /** Show the source name and measurement age beneath the value. */
  showProvenanceFooter?: boolean;
  className?: string;
}

/**
 * Renders one measurement together with everything spec §11 requires: the
 * value, its unit, its provenance, the provider's measurement timestamp and
 * the source name. The UNAVAILABLE case is handled here rather than at call
 * sites, so a missing station or failed request degrades uniformly.
 */
export function DataValue<T>({
  envelope,
  label,
  format,
  showProvenanceFooter = true,
  className,
}: DataValueProps<T>) {
  const available = hasValue(envelope);
  const rendered = available
    ? (format?.(envelope.value) ?? String(envelope.value))
    : '—';

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{label}</span>
        <ProvenanceBadge envelope={envelope} />
      </div>

      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            'text-xl font-semibold',
            available ? 'text-fg' : 'text-dim',
          )}
        >
          {rendered}
        </span>
        {available && envelope.unit ? (
          <span className="text-xs text-muted">{envelope.unit}</span>
        ) : null}
      </div>

      {!available && envelope.note ? (
        <p className="text-[11px] leading-snug text-dim">{envelope.note}</p>
      ) : null}

      {showProvenanceFooter ? (
        <p className="readout text-[10px] text-dim">
          {envelope.source.name}
          {envelope.measuredAt
            ? ` · measured ${formatRelativeAge(envelope.measuredAt)}`
            : ''}
        </p>
      ) : null}
    </div>
  );
}
