'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Attribution } from './attribution';

interface AnalyticsTab {
  readonly id: string;
  readonly label: string;
  /** Named so the placeholder can say exactly where the series will come from. */
  readonly source: string;
  readonly phase: number;
}

const TABS: readonly AnalyticsTab[] = [
  {
    id: 'temperature',
    label: 'Temperature',
    source: 'Open-Meteo hourly forecast and ERA5 archive',
    phase: 3,
  },
  {
    id: 'air-quality',
    label: 'Air quality',
    source: 'OpenAQ hourly sensor aggregates',
    phase: 4,
  },
  {
    id: 'traffic',
    label: 'Traffic density',
    source: 'the local traffic simulation (not a measurement)',
    phase: 5,
  },
  {
    id: 'environment',
    label: 'Environmental trends',
    source: 'Open-Meteo and OpenAQ history',
    phase: 6,
  },
] as const;

/**
 * Bottom analytics panel (spec §3). Charts arrive with their data in phases
 * 3-6; until a real series exists, each tab names its future source rather
 * than rendering invented sample data.
 */
export function AnalyticsPanel() {
  const [activeTab, setActiveTab] = useState<string>(TABS[0].id);
  const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border-subtle px-2"
        role="tablist"
        aria-label="Analytics series"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === activeTab}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'shrink-0 border-b-2 px-2.5 py-2 text-xs transition-colors',
              t.id === activeTab
                ? 'border-accent text-accent-text'
                : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
        <Attribution className="ml-auto hidden pr-1 lg:flex" />
      </div>

      <div
        role="tabpanel"
        className="flex flex-1 items-center justify-center p-4 text-center"
      >
        <div className="space-y-1">
          <p className="text-xs text-muted">
            {tab.label} chart will be drawn from {tab.source}.
          </p>
          <p className="panel-heading">Arrives in phase {tab.phase}</p>
        </div>
      </div>
    </div>
  );
}
