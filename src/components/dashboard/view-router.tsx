'use client';

import { AirQualityView } from '@/features/air-quality/components/air-quality-view';
import { AnalyticsView } from '@/features/analytics/components/analytics-view';
import { CityView } from '@/features/city/components/city-view';
import { TrafficView } from '@/features/traffic/components/traffic-view';
import { TransportationView } from '@/features/transportation/components/transportation-view';
import { WeatherView } from '@/features/weather/components/weather-view';
import { useDashboardStore } from '@/stores/dashboard-store';
import { OverviewView } from './views/overview-view';
import { PendingView } from './views/pending-view';
import { SettingsView } from './views/settings-view';

/**
 * Renders the active view.
 *
 * Views are selected from store state rather than from the URL for now. Moving
 * to real routes is deliberately deferred: the 3D scene must survive view
 * switches without being unmounted and re-initialised, so the canvas will be
 * hoisted above the router before any route-based navigation is introduced.
 */
export function ViewRouter() {
  const activeView = useDashboardStore((s) => s.activeView);

  switch (activeView) {
    case 'overview':
      return <OverviewView />;
    case 'city-3d':
      return <CityView />;
    // Facilities are rendered as markers inside the same scene, so this
    // section shows the city with the facility layer rather than a second,
    // near-identical view.
    case 'facilities':
      return <CityView />;
    case 'weather':
      return <WeatherView />;
    case 'air-quality':
      return <AirQualityView />;
    case 'traffic':
      return <TrafficView />;
    case 'transportation':
      return <TransportationView />;
    case 'analytics':
      return <AnalyticsView />;
    case 'settings':
      return <SettingsView />;
    default:
      return <PendingView viewId={activeView} />;
  }
}
