import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Tailwind-aware classNames helper. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
