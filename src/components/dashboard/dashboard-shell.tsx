'use client';

import { useState } from 'react';
import { Info, X } from 'lucide-react';
import { AnalyticsPanel } from '@/components/panels/analytics-panel';
import { InfoPanel } from '@/components/panels/info-panel';
import { Sidebar } from '@/components/navigation/sidebar';
import { TopNav } from '@/components/navigation/top-nav';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils/cn';
import { useDashboardStore } from '@/stores/dashboard-store';
import { ViewRouter } from './view-router';

/**
 * Command-centre layout (spec §3).
 *
 * Responsive strategy:
 * - desktop (lg+): persistent sidebar, docked right panel, docked bottom panel.
 * - tablet (md): sidebar becomes a drawer, right and bottom panels stay docked
 *   but can be dismissed from the top bar.
 * - mobile (<md): only the main view is docked. The information panel opens as
 *   a sheet from a floating button, and analytics moves to its own nav section,
 *   because a 320px-wide chart strip is not readable.
 */
export function DashboardShell() {
  const infoPanelOpen = useDashboardStore((s) => s.infoPanelOpen);
  const analyticsPanelOpen = useDashboardStore((s) => s.analyticsPanelOpen);
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-100 focus:rounded focus:bg-surface-2 focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to main content
      </a>

      <TopNav />

      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <main
            id="main-content"
            className="relative min-h-0 flex-1 overflow-hidden"
          >
            <ViewRouter />
          </main>

          {analyticsPanelOpen ? (
            <section
              aria-label="Analytics"
              className="hidden h-48 shrink-0 border-t border-border-subtle bg-surface/60 backdrop-blur md:block xl:h-56"
            >
              <AnalyticsPanel />
            </section>
          ) : null}
        </div>

        {/* Docked information panel: tablet and desktop. */}
        {infoPanelOpen ? (
          <aside
            aria-label="Selected feature information"
            className="hidden w-72 shrink-0 border-l border-border-subtle bg-surface/60 backdrop-blur md:block xl:w-80"
          >
            <InfoPanel />
          </aside>
        ) : null}
      </div>

      {/* Mobile: the same panel as a dismissible sheet. */}
      <button
        type="button"
        onClick={() => setMobileInfoOpen(true)}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border border-accent/40 bg-surface-2 px-4 py-2.5 text-xs text-accent-text shadow-lg md:hidden"
      >
        <Info className="size-4" aria-hidden="true" />
        Details
      </button>

      <div
        className={cn(
          'fixed inset-0 z-50 md:hidden',
          mobileInfoOpen ? 'block' : 'hidden',
        )}
      >
        <button
          type="button"
          aria-label="Close details"
          onClick={() => setMobileInfoOpen(false)}
          className="absolute inset-0 bg-black/60"
        />
        <aside
          aria-label="Selected feature information"
          className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col rounded-t-xl border-t border-border-subtle bg-surface"
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-3">
            <span className="panel-heading">Details</span>
            <IconButton
              icon={X}
              label="Close details"
              onClick={() => setMobileInfoOpen(false)}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <InfoPanel />
          </div>
        </aside>
      </div>
    </div>
  );
}
