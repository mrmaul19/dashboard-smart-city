'use client';

import type { ReactNode } from 'react';
import { Layers, MapPin } from 'lucide-react';
import { EmptyState } from '@/components/ui/states';
import { BuildingDetails } from '@/features/city/components/building-details';
import { AirQualityPanelSection } from '@/features/air-quality/components/air-quality-panel';
import { WeatherPanelSection } from '@/features/weather/components/weather-panel';
import { useCityStore } from '@/stores/city-store';
import { Attribution } from './attribution';
import { DataSourceStatus } from './data-source-status';
import { LayerControls } from './layer-controls';

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof MapPin;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border-subtle p-3 last:border-b-0">
      <h3 className="panel-heading mb-2 flex items-center gap-1.5">
        <Icon className="size-3.5" aria-hidden="true" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Right-hand information panel (spec §3). Hosts the current selection, the
 * layer controls and the data-source status list; weather, air quality and
 * traffic sections are added by their own phases.
 */
export function InfoPanel() {
  const selected = useCityStore((s) => s.selected);
  const selectedBuilding = useCityStore((s) => s.selectedBuilding);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Section title="Selection" icon={MapPin}>
        {selected ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm text-fg">{selected.label}</p>
              <p className="readout text-[11px] text-dim">
                {selected.kind} · {selected.id}
              </p>
            </div>

            {selectedBuilding ? (
              <BuildingDetails building={selectedBuilding} />
            ) : null}
          </div>
        ) : (
          <EmptyState
            title="Nothing selected"
            description="Click a building or a facility marker in the 3D city to inspect its OpenStreetMap properties."
            className="p-2"
          />
        )}
      </Section>

      <WeatherPanelSection />

      <AirQualityPanelSection />

      <Section title="Layers" icon={Layers}>
        <LayerControls currentPhase={5} />
      </Section>

      <DataSourceStatus />

      <div className="mt-auto border-t border-border-subtle p-3">
        <Attribution />
      </div>
    </div>
  );
}
