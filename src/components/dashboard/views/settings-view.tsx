'use client';

import { Panel, PanelHeader } from '@/components/ui/panel';
import { Switch } from '@/components/ui/switch';
import { Attribution } from '@/components/panels/attribution';
import { DataSourceStatus } from '@/components/panels/data-source-status';
import { LayerControls } from '@/components/panels/layer-controls';
import { DEFAULT_CITY } from '@/lib/constants/cities';
import { PROVENANCE_META, type Provenance } from '@/types/data-envelope';
import { ProvenanceBadge } from '@/components/ui/provenance-badge';
import { useDashboardStore } from '@/stores/dashboard-store';

const PROVENANCE_ORDER: readonly Provenance[] = [
  'REAL',
  'SIMULATED',
  'STATIC',
  'UNAVAILABLE',
];

export function SettingsView() {
  const theme = useDashboardStore((s) => s.theme);
  const setTheme = useDashboardStore((s) => s.setTheme);
  const analyticsPanelOpen = useDashboardStore((s) => s.analyticsPanelOpen);
  const toggleAnalyticsPanel = useDashboardStore((s) => s.toggleAnalyticsPanel);
  const infoPanelOpen = useDashboardStore((s) => s.infoPanelOpen);
  const toggleInfoPanel = useDashboardStore((s) => s.toggleInfoPanel);

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto p-3 xl:grid-cols-2">
      <Panel flush>
        <PanelHeader title="Display" />
        <div className="flex flex-col gap-1 p-2">
          <Switch
            label="Dark theme"
            checked={theme === 'dark'}
            onChange={(checked) => setTheme(checked ? 'dark' : 'light')}
          />
          <Switch
            label="Show information panel"
            checked={infoPanelOpen}
            onChange={toggleInfoPanel}
          />
          <Switch
            label="Show analytics panel"
            checked={analyticsPanelOpen}
            onChange={toggleAnalyticsPanel}
          />
        </div>
      </Panel>

      <Panel flush>
        <PanelHeader title="Map layers" />
        <div className="p-2">
          <LayerControls currentPhase={1} />
        </div>
      </Panel>

      <Panel flush>
        <PanelHeader title="Data integrity legend" subtitle="Spec §11" />
        <ul className="flex flex-col gap-2 p-3">
          {PROVENANCE_ORDER.map((provenance) => (
            <li key={provenance} className="flex items-start gap-2">
              <ProvenanceBadge provenance={provenance} className="mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs text-fg">{PROVENANCE_META[provenance].label}</p>
                <p className="text-[11px] leading-snug text-muted">
                  {PROVENANCE_META[provenance].description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel flush>
        <PanelHeader title="Sources and city" subtitle={DEFAULT_CITY.timezone} />
        <DataSourceStatus />
        <div className="p-3">
          <Attribution />
        </div>
      </Panel>
    </div>
  );
}
