'use client';

import { Menu, PanelBottom, PanelRight, Radio } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { DEFAULT_CITY } from '@/lib/constants/cities';
import { useLiveSources } from '@/lib/hooks/use-live-sources';
import { useDashboardStore } from '@/stores/dashboard-store';
import { LiveClock } from './live-clock';
import { LiveStatus } from './live-status';
import { ThemeToggle } from './theme-toggle';

export function TopNav() {
  const setMobileNavOpen = useDashboardStore((s) => s.setMobileNavOpen);
  const infoPanelOpen = useDashboardStore((s) => s.infoPanelOpen);
  const toggleInfoPanel = useDashboardStore((s) => s.toggleInfoPanel);
  const analyticsPanelOpen = useDashboardStore((s) => s.analyticsPanelOpen);
  const toggleAnalyticsPanel = useDashboardStore((s) => s.toggleAnalyticsPanel);
  const liveSources = useLiveSources();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface/80 px-2 backdrop-blur sm:gap-4 sm:px-4">
      <IconButton
        icon={Menu}
        label="Open navigation"
        className="lg:hidden"
        onClick={() => setMobileNavOpen(true)}
      />

      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="grid size-8 shrink-0 place-items-center rounded border border-accent/40 bg-accent-soft"
          aria-hidden="true"
        >
          <Radio className="size-4 text-accent-text" />
        </span>
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-[13px] font-semibold tracking-wide text-fg">
            SMART CITY DIGITAL TWIN
          </h1>
          <p className="truncate text-[11px] text-muted">
            {DEFAULT_CITY.name}, {DEFAULT_CITY.country}
          </p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        {/*
          Derived from live query state, so the indicator reports "degraded"
          when a source is failing instead of implying a healthy feed.
        */}
        <LiveStatus
          status={liveSources.status}
          sourceCount={liveSources.count}
        />
        <LiveClock />

        <div className="flex items-center gap-1 border-l border-border-subtle pl-2 sm:pl-3">
          <IconButton
            icon={PanelRight}
            label="Toggle information panel"
            active={infoPanelOpen}
            onClick={toggleInfoPanel}
            className="hidden md:inline-flex"
          />
          <IconButton
            icon={PanelBottom}
            label="Toggle analytics panel"
            active={analyticsPanelOpen}
            onClick={toggleAnalyticsPanel}
            className="hidden md:inline-flex"
          />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
