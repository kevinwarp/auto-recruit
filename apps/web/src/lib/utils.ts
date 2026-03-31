import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function outreachStatusColor(status: string): string {
  switch (status) {
    case 'responded': return 'text-green-700 bg-green-100';
    case 'bounced':   return 'text-red-700 bg-red-100';
    case 'sent':      return 'text-blue-700 bg-blue-100';
    case 'drafted':   return 'text-yellow-700 bg-yellow-100';
    default:          return 'text-gray-500 bg-gray-100';
  }
}
