import { create } from 'zustand';
import type { SnapshotBuilding } from '@/features/city/types/city-data';

/** Toggleable map layers (project spec §4). */
export type LayerId =
  | 'buildings'
  | 'roads'
  | 'green'
  | 'facilities'
  | 'traffic'
  | 'transit'
  | 'weather'
  | 'airQuality';

export type LayerVisibility = Record<LayerId, boolean>;

export interface LayerDescriptor {
  readonly id: LayerId;
  readonly label: string;
  /** Phase that delivers the layer; earlier phases render it disabled. */
  readonly phase: number;
}

export const LAYERS: readonly LayerDescriptor[] = [
  { id: 'buildings', label: 'Buildings', phase: 2 },
  { id: 'roads', label: 'Roads', phase: 2 },
  { id: 'green', label: 'Green spaces', phase: 2 },
  { id: 'facilities', label: 'Public facilities', phase: 2 },
  { id: 'traffic', label: 'Traffic (simulated)', phase: 5 },
  { id: 'transit', label: 'Transjakarta routes', phase: 5 },
  { id: 'weather', label: 'Weather', phase: 3 },
  { id: 'airQuality', label: 'Air quality', phase: 4 },
] as const;

/** The selection the right-hand information panel describes. */
export interface SelectedFeature {
  readonly kind: 'building' | 'facility' | 'road' | 'station';
  readonly id: string;
  readonly label: string;
}

interface CityState {
  cityId: string;
  layers: LayerVisibility;
  selected: SelectedFeature | null;
  /**
   * Full record for a selected building.
   *
   * Held alongside the summary so the information panel can show the OSM tags
   * and derived height without re-reading the tile that contained it. The 3D
   * scene already has the object in hand when the click happens, so passing it
   * through the store is cheaper than a lookup.
   */
  selectedBuilding: SnapshotBuilding | null;
  /** Scene point the camera should fly to, in local metres. */
  focusTarget: readonly [number, number, number] | null;
  /** 0..1, drives the simulated vehicle count. Simulation only. */
  trafficDensity: number;
  /** Incremented to ask the 3D scene to return to its default camera. */
  cameraResetNonce: number;

  toggleLayer: (id: LayerId) => void;
  setLayer: (id: LayerId, visible: boolean) => void;
  select: (feature: SelectedFeature | null) => void;
  selectBuilding: (building: SnapshotBuilding | null) => void;
  focusOn: (point: readonly [number, number, number] | null) => void;
  setTrafficDensity: (density: number) => void;
  resetCamera: () => void;
}

const DEFAULT_LAYERS: LayerVisibility = {
  buildings: true,
  roads: true,
  green: true,
  facilities: true,
  traffic: true,
  transit: true,
  weather: true,
  airQuality: true,
};

/** Prefer a readable name over a bare OSM id when one is tagged. */
function buildingLabel(building: SnapshotBuilding): string {
  return (
    building.tags.name ??
    building.tags['name:en'] ??
    building.tags['name:id'] ??
    `${building.category} building ${building.osmId}`
  );
}

export const useCityStore = create<CityState>()((set) => ({
  cityId: 'jakarta',
  layers: DEFAULT_LAYERS,
  selected: null,
  selectedBuilding: null,
  focusTarget: null,
  trafficDensity: 0.5,
  cameraResetNonce: 0,

  toggleLayer: (id) =>
    set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
  setLayer: (id, visible) =>
    set((s) => ({ layers: { ...s.layers, [id]: visible } })),
  select: (feature) => set({ selected: feature, selectedBuilding: null }),
  selectBuilding: (building) =>
    set(
      building
        ? {
            selected: {
              kind: 'building',
              id: building.id,
              label: buildingLabel(building),
            },
            selectedBuilding: building,
          }
        : { selected: null, selectedBuilding: null },
    ),
  focusOn: (point) => set({ focusTarget: point }),
  setTrafficDensity: (density) =>
    set({ trafficDensity: Math.min(1, Math.max(0, density)) }),
  resetCamera: () =>
    set((s) => ({ cameraResetNonce: s.cameraResetNonce + 1, focusTarget: null })),
}));
