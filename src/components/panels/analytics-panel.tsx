'use client';

import { useState } from 'react';
import { ProvenanceBadge } from '@/components/ui/provenance-badge';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import {
  usePollutantTrend,
  useTrafficTrend,
  useWeatherTrend,
} from '@/features/analytics/hooks/use-trends';
import { cn } from '@/lib/utils/cn';
import type { Provenance } from '@/types/data-envelope';
import { Attribution } from './attribution';

type TabId = 'temperature' | 'air-quality' | 'traffic' | 'humidity';

interface AnalyticsTab {
  readonly id: TabId;
  readonly label: string;
  readonly provenance: Provenance;
}

const TABS: readonly AnalyticsTab[] = [
  { id: 'temperature', label: 'Temperature', provenance: 'REAL' },
  { id: 'humidity', label: 'Humidity', provenance: 'REAL' },
  { id: 'air-quality', label: 'Air quality', provenance: 'REAL' },
  { id: 'traffic', label: 'Traffic density', provenance: 'SIMULATED' },
] as const;

/**
 * Bottom analytics panel.
 *
 * A compact companion to the Analytics view, sharing its series through the
 * same hooks so the two can never disagree. The table toggle is kept even at
 * this size: it is the accessible path to the values, not a convenience.
 *
 * Each tab carries the provenance of what it plots, because they differ — the
 * traffic tab is a model, the others are measurements.
 */
export function AnalyticsPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('temperature');
  const tab = TABS.find((item) => item.id === activeTab) ?? TABS[0];

  // The panel always shows 24 hours; the full view offers the range control.
  const { rows: weatherRows } = useWeatherTrend('24h');
  const pollutants = usePollutantTrend('24h');
  const trafficRows = useTrafficTrend();

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border-subtle px-2"
        role="tablist"
        aria-label="Analytics series"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === activeTab}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              'shrink-0 border-b-2 px-2.5 py-2 text-xs transition-colors',
              item.id === activeTab
                ? 'border-accent text-accent-text'
                : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {item.label}
          </button>
        ))}
        <div className="ml-auto flex shrink-0 items-center gap-2 pr-1">
          <ProvenanceBadge provenance={tab.provenance} />
          <Attribution className="hidden xl:flex" />
        </div>
      </div>

      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {tab.id === 'temperature' ? (
          <TimeSeriesChart
            rows={weatherRows}
            series={[{ key: 'temperature', label: 'Temperature', unit: '°C' }]}
            height={104}
            maxTicks={6}
            footnote="Open-Meteo hourly, last 24 h"
          />
        ) : null}

        {tab.id === 'humidity' ? (
          <TimeSeriesChart
            rows={weatherRows}
            series={[{ key: 'humidity', label: 'Humidity', unit: '%' }]}
            precision={0}
            height={104}
            maxTicks={6}
            footnote="Open-Meteo hourly, last 24 h"
          />
        ) : null}

        {tab.id === 'air-quality' ? (
          pollutants.series.length > 0 ? (
            <TimeSeriesChart
              rows={pollutants.rows}
              series={pollutants.series}
              height={104}
              maxTicks={6}
              footnote="OpenAQ hourly means from the nearest reporting station"
            />
          ) : (
            <p className="p-3 text-center text-[11px] text-dim">
              {pollutants.emptyReason ?? 'Loading station history…'}
            </p>
          )
        ) : null}

        {tab.id === 'traffic' ? (
          <TimeSeriesChart
            rows={trafficRows}
            series={[{ key: 'density', label: 'Density', unit: '%' }]}
            precision={0}
            height={104}
            maxTicks={8}
            footnote="Modelled daily profile — not a measurement or a recording"
          />
        ) : null}
      </div>
    </div>
  );
}
