import { create } from 'zustand';
import type { ViewId } from '@/lib/constants/navigation';

export type ThemeMode = 'dark' | 'light';

/**
 * UI shell state only. Server data never lives here — that is TanStack Query's
 * job — which keeps this store free of cache-invalidation concerns and avoids
 * re-rendering the 3D scene when a weather poll returns.
 */
interface DashboardState {
  activeView: ViewId;
  /** Desktop: sidebar collapsed to an icon rail. */
  sidebarCollapsed: boolean;
  /** Mobile/tablet: sidebar shown as an overlay drawer. */
  mobileNavOpen: boolean;
  /** Right-hand information panel. */
  infoPanelOpen: boolean;
  /** Bottom analytics panel. */
  analyticsPanelOpen: boolean;
  theme: ThemeMode;

  setActiveView: (view: ViewId) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
  toggleInfoPanel: () => void;
  toggleAnalyticsPanel: () => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

export const useDashboardStore = create<DashboardState>()((set) => ({
  activeView: 'overview',
  sidebarCollapsed: false,
  mobileNavOpen: false,
  infoPanelOpen: true,
  analyticsPanelOpen: true,
  theme: 'dark',

  setActiveView: (view) => set({ activeView: view, mobileNavOpen: false }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  toggleInfoPanel: () => set((s) => ({ infoPanelOpen: !s.infoPanelOpen })),
  toggleAnalyticsPanel: () => set((s) => ({ analyticsPanelOpen: !s.analyticsPanelOpen })),
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
}));
