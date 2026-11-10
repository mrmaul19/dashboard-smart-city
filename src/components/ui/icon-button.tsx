'use client';

import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Required: the button has no visible text, so this is its accessible name. */
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
}

export function IconButton({
  icon: Icon,
  label,
  active = false,
  size = 'md',
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center justify-center rounded border border-transparent text-muted transition-colors',
        'hover:border-border-subtle hover:bg-surface-2 hover:text-fg',
        'disabled:pointer-events-none disabled:opacity-40',
        active && 'border-accent/40 bg-accent-soft text-accent-text',
        size === 'sm' ? 'size-7' : 'size-8',
        className,
      )}
      {...props}
    >
      <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} aria-hidden="true" />
    </button>
  );
}
