import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2, Lock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Loading, empty and error states (spec §10). These are shared so that every
 * data surface in the dashboard fails and waits in the same, legible way.
 */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded bg-surface-2', className)}
      aria-hidden="true"
    />
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2 p-6 text-sm text-muted"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

interface MessageStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: MessageStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 p-6 text-center',
        className,
      )}
    >
      <Inbox className="size-5 text-dim" aria-hidden="true" />
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? (
        <p className="max-w-prose text-xs text-muted">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action,
  className,
}: MessageStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 p-6 text-center',
        className,
      )}
      role="alert"
    >
      <AlertTriangle className="size-5 text-danger" aria-hidden="true" />
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? (
        <p className="max-w-prose text-xs text-muted">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/**
 * Shown for a view whose data source is not wired up yet. It names the phase
 * that delivers it rather than rendering invented placeholder content, which
 * would conflict with the data-integrity rule in spec §11.
 */
export function PhasePendingState({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: number;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <Lock className="size-5 text-dim" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="mx-auto max-w-md text-xs leading-relaxed text-muted">
          {description}
        </p>
      </div>
      <p className="panel-heading">Arrives in phase {phase}</p>
    </div>
  );
}
