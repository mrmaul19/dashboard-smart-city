import {
  Box,
  Building2,
  Bus,
  Car,
  CloudSun,
  LayoutDashboard,
  LineChart,
  Settings,
  Wind,
  type LucideIcon,
} from 'lucide-react';

export type ViewId =
  | 'overview'
  | 'city-3d'
  | 'weather'
  | 'air-quality'
  | 'traffic'
  | 'transportation'
  | 'facilities'
  | 'analytics'
  | 'settings';

export interface NavItem {
  readonly id: ViewId;
  readonly label: string;
  /** Shown in the collapsed rail tooltip and as the view's subtitle. */
  readonly description: string;
  readonly icon: LucideIcon;
  /**
   * Development phase that delivers this view. Views from a later phase render
   * an explicit placeholder rather than fabricating content.
   */
  readonly phase: number;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'City-wide status at a glance',
    icon: LayoutDashboard,
    phase: 1,
  },
  {
    id: 'city-3d',
    label: '3D City',
    description: 'Interactive digital twin built from OpenStreetMap data',
    icon: Box,
    phase: 2,
  },
  {
    id: 'weather',
    label: 'Weather',
    description: 'Live conditions and forecast from Open-Meteo',
    icon: CloudSun,
    phase: 3,
  },
  {
    id: 'air-quality',
    label: 'Air Quality',
    description: 'Pollutant measurements from OpenAQ monitoring stations',
    icon: Wind,
    phase: 4,
  },
  {
    id: 'traffic',
    label: 'Traffic',
    description: 'Simulated vehicle flow on the real road network',
    icon: Car,
    phase: 5,
  },
  {
    id: 'transportation',
    label: 'Public Transport',
    description: 'Transjakarta routes, stops and headways',
    icon: Bus,
    phase: 5,
  },
  {
    id: 'facilities',
    label: 'Public Facilities',
    description: 'Hospitals, schools and amenities from OpenStreetMap',
    icon: Building2,
    phase: 2,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Environmental and mobility trends',
    icon: LineChart,
    phase: 6,
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Data sources, layers and display preferences',
    icon: Settings,
    phase: 1,
  },
] as const;

export const NAV_ITEM_BY_ID: Record<ViewId, NavItem> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.id, item]),
) as Record<ViewId, NavItem>;
