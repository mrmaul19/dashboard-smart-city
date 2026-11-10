'use client';

import { cn } from '@/lib/utils/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Explains why the control is disabled, e.g. "arrives in phase 5". */
  disabledReason?: string;
  className?: string;
}

/**
 * Layer visibility toggle. Implemented as a real `role="switch"` button so it
 * is reachable and announced correctly by keyboard and screen readers.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabledReason,
  className,
}: SwitchProps) {
  const disabled = Boolean(disabledReason);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={disabled ? `${label} (${disabledReason})` : label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'group flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left transition-colors',
        'hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-45',
        className,
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs text-fg">{label}</span>
        {disabledReason ? (
          <span className="truncate text-[10px] text-dim">{disabledReason}</span>
        ) : null}
      </span>

      <span
        aria-hidden="true"
        className={cn(
          'relative h-4 w-7 shrink-0 rounded-full border transition-colors',
          checked && !disabled
            ? 'border-accent/50 bg-accent-soft'
            : 'border-border-strong bg-surface-2',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-2.5 rounded-full transition-all',
            checked && !disabled
              ? 'left-3.5 bg-accent'
              : 'left-0.5 bg-border-strong',
          )}
        />
      </span>
    </button>
  );
}
