import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface PanelProps {
  children: ReactNode;
  className?: string;
  /** Removes the default padding, for panels that host their own scroll area. */
  flush?: boolean;
}

export function Panel({ children, className, flush }: PanelProps) {
  return (
    <section className={cn('panel', !flush && 'p-3', className)}>
      {children}
    </section>
  );
}

interface PanelHeaderProps {
  title: string;
  /** Short qualifier rendered after the title, e.g. a station name. */
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function PanelHeader({
  title,
  subtitle,
  actions,
  className,
}: PanelHeaderProps) {
  return (
    <header
      className={cn(
        'flex min-h-8 items-center justify-between gap-2 border-b border-border-subtle px-3 py-2',
        className,
      )}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="panel-heading truncate">{title}</h2>
        {subtitle ? (
          <span className="truncate text-xs text-dim">{subtitle}</span>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
    </header>
  );
}
