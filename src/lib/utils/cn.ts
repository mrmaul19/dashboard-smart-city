import { clsx, type ClassValue } from 'clsx';

/** Conditional class-name join. Thin wrapper so call sites stay terse. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
