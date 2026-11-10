import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatRelativeAge } from '@/lib/utils/format';
import { hasValue, type DataEnvelope } from '@/types/data-envelope';
import { ProvenanceBadge } from './provenance-badge';

interface StatTileProps<T> {
  /** Sentence case, no trailing colon. */
  label: string;
  envelope: DataEnvelope<T>;
  format?: (value: T) => string;
  icon?: LucideIcon;
  /** Signed change against a named period, e.g. `{ value: -1.4, period: '1 h' }`. */
  delta?: { value: number; period: string };
  /** Which direction counts as an improvement, for the delta colour. */
  deltaGoodDirection?: 'up' | 'down';
  className?: string;
}

/**
 * A single headline number. Values use the font's proportional figures rather
 * than tabular ones: at display sizes `tabular-nums` makes a number like 121
 * look loose. Tabular figures are reserved for the clock and timestamp columns.
 */
export function StatTile<T>({
  label,
  envelope,
  format,
  icon: Icon,
  delta,
  deltaGoodDirection = 'up',
  className,
}: StatTileProps<T>) {
  const available = hasValue(envelope);
  const rendered = available
    ? (format?.(envelope.value) ?? String(envelope.value))
    : '—';

  // Colour encodes whether the change is good, not merely its sign.
  const deltaIsGood =
    delta === undefined
      ? null
      : delta.value === 0
        ? null
        : (delta.value > 0) === (deltaGoodDirection === 'up');

  return (
    <div className={cn('panel flex flex-col gap-2 p-3', className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
          {Icon ? (
            <Icon className="size-3.5 shrink-0 text-dim" aria-hidden="true" />
          ) : null}
          <span className="truncate">{label}</span>
        </span>
        <ProvenanceBadge envelope={envelope} />
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            'text-2xl leading-none font-semibold',
            available ? 'text-fg' : 'text-dim',
          )}
        >
          {rendered}
        </span>
        {available && envelope.unit ? (
          <span className="text-xs text-muted">{envelope.unit}</span>
        ) : null}
      </div>

      {delta && available ? (
        <p className="text-[11px] text-muted">
          <span
            className={cn(
              'font-medium',
              deltaIsGood === null
                ? 'text-muted'
                : deltaIsGood
                  ? 'text-ok'
                  : 'text-danger',
            )}
          >
            {delta.value > 0 ? '+' : ''}
            {delta.value}
          </span>{' '}
          vs last {delta.period}
        </p>
      ) : null}

      {!available && envelope.note ? (
        <p className="text-[11px] leading-snug text-dim">{envelope.note}</p>
      ) : null}

      {available && envelope.measuredAt ? (
        <p className="readout text-[10px] text-dim">
          {formatRelativeAge(envelope.measuredAt)}
        </p>
      ) : null}
    </div>
  );
}
