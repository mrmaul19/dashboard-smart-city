'use client';

import { cn } from '@/lib/utils/cn';

export type LiveStatusKind = 'live' | 'standby' | 'degraded';

const COPY: Record<LiveStatusKind, { label: string; description: string }> = {
  live: { label: 'Live', description: 'At least one real data source is streaming.' },
  standby: {
    label: 'Standby',
    description: 'No live data source is connected yet.',
  },
  degraded: {
    label: 'Degraded',
    description: 'One or more data sources are failing or unavailable.',
  },
};

interface LiveStatusProps {
  status: LiveStatusKind;
  /** How many REAL sources are currently connected. */
  sourceCount: number;
  className?: string;
}

/**
 * Live data status for the top bar. It reports the number of connected real
 * sources rather than a decorative "online" light, so the indicator cannot
 * claim the dashboard is live while every panel is showing placeholder states.
 */
export function LiveStatus({ status, sourceCount, className }: LiveStatusProps) {
  const copy = COPY[status];

  return (
    <div
      className={cn('flex items-center gap-2', className)}
      title={copy.description}
    >
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          status === 'live' && 'live-dot',
          status === 'standby' && 'bg-na',
          status === 'degraded' && 'bg-warn',
        )}
        aria-hidden="true"
      />
      <span className="panel-heading hidden sm:inline">
        {copy.label}
        <span className="sr-only">. {copy.description}</span>
      </span>
      <span className="readout hidden text-[10px] text-dim md:inline">
        {sourceCount} src
      </span>
    </div>
  );
}
