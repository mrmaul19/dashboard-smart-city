'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_CITY } from '@/lib/constants/cities';
import { formatDate, formatTime, timezoneLabel } from '@/lib/utils/format';

/**
 * Current date and time in the selected city's time zone.
 *
 * The wall clock is an external system, so it is consumed with
 * `useSyncExternalStore` rather than an effect that calls `setState`: the
 * snapshot is whole seconds, so React re-renders exactly once per tick and
 * only when the displayed value actually changes.
 *
 * `getServerSnapshot` returns `null` so that nothing time-dependent is
 * evaluated during the prerender — which Next's Cache Components would reject,
 * and which would bake a build-time clock into the static HTML.
 */
function subscribe(onStoreChange: () => void): () => void {
  const id = window.setInterval(onStoreChange, 1000);
  return () => window.clearInterval(id);
}

/** Whole seconds since the epoch; a stable value within a given second. */
function getSnapshot(): number {
  return Math.floor(Date.now() / 1000);
}

function getServerSnapshot(): null {
  return null;
}

export function LiveClock() {
  const epochSeconds = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const now = epochSeconds === null ? null : new Date(epochSeconds * 1000);
  const timezone = DEFAULT_CITY.timezone;

  return (
    <div className="flex flex-col items-end leading-tight">
      <time
        className="readout text-sm text-fg"
        dateTime={now?.toISOString()}
        suppressHydrationWarning
      >
        {now ? formatTime(now, timezone) : '--:--:--'}
      </time>
      <span className="hidden text-[10px] text-dim sm:block">
        {now ? `${formatDate(now, timezone)} · ${timezoneLabel(timezone, now)}` : ''}
      </span>
    </div>
  );
}
