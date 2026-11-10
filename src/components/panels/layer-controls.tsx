'use client';

import { Switch } from '@/components/ui/switch';
import { LAYERS, useCityStore } from '@/stores/city-store';

/** Layer visibility controls (spec §4). */
export function LayerControls({ currentPhase = 1 }: { currentPhase?: number }) {
  const layers = useCityStore((s) => s.layers);
  const setLayer = useCityStore((s) => s.setLayer);

  return (
    <div className="flex flex-col gap-0.5">
      {LAYERS.map((layer) => (
        <Switch
          key={layer.id}
          label={layer.label}
          checked={layers[layer.id]}
          onChange={(checked) => setLayer(layer.id, checked)}
          disabledReason={
            layer.phase > currentPhase ? `arrives in phase ${layer.phase}` : undefined
          }
        />
      ))}
    </div>
  );
}
