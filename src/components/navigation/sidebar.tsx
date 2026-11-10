'use client';

import { useEffect } from 'react';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { NAV_ITEMS } from '@/lib/constants/navigation';
import { cn } from '@/lib/utils/cn';
import { useDashboardStore } from '@/stores/dashboard-store';

function NavList({ collapsed }: { collapsed: boolean }) {
  const activeView = useDashboardStore((s) => s.activeView);
  const setActiveView = useDashboardStore((s) => s.setActiveView);

  return (
    <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeView === item.id;

        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setActiveView(item.id)}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex w-full items-center gap-2.5 rounded px-2 py-2 text-left text-[13px] transition-colors',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-accent-soft text-accent-text'
                  : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {!collapsed ? (
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="truncate">{item.label}</span>
                  {item.phase > 1 ? (
                    <span
                      className="readout shrink-0 text-[10px] text-dim"
                      title={`Delivered in phase ${item.phase}`}
                    >
                      P{item.phase}
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="sr-only">{item.label}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar() {
  const collapsed = useDashboardStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useDashboardStore((s) => s.toggleSidebar);
  const mobileNavOpen = useDashboardStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useDashboardStore((s) => s.setMobileNavOpen);

  // Escape closes the mobile drawer, as expected of a modal overlay.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileNavOpen, setMobileNavOpen]);

  return (
    <>
      {/* Desktop and tablet: a persistent rail that can collapse to icons. */}
      <nav
        aria-label="Dashboard sections"
        className={cn(
          'hidden shrink-0 flex-col border-r border-border-subtle bg-surface/60 transition-[width] lg:flex',
          collapsed ? 'w-14' : 'w-56',
        )}
      >
        <NavList collapsed={collapsed} />
        <div className="border-t border-border-subtle p-2">
          <IconButton
            icon={collapsed ? PanelLeftOpen : PanelLeftClose}
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleSidebar}
          />
        </div>
      </nav>

      {/* Mobile and small tablet: an overlay drawer. */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <nav
            aria-label="Dashboard sections"
            className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border-subtle bg-surface"
          >
            <div className="flex h-14 items-center justify-between border-b border-border-subtle px-3">
              <span className="panel-heading">Sections</span>
              <IconButton
                icon={X}
                label="Close navigation"
                onClick={() => setMobileNavOpen(false)}
              />
            </div>
            <NavList collapsed={false} />
          </nav>
        </div>
      ) : null}
    </>
  );
}
