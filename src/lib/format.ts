import { format, formatDistanceToNow, differenceInDays } from 'date-fns';

export function formatDate(date: string | Date | null): string {
  if (!date) return '—';
  return format(new Date(date), 'MMM d, yyyy');
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return '—';
  return format(new Date(date), 'MMM d, yyyy h:mm a');
}

export function formatRelativeDate(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

export function daysUntilExpiry(date: string | null): number | null {
  if (!date) return null;
  return differenceInDays(new Date(date), new Date());
}

export function expiryStatus(date: string | null): 'ok' | 'warning' | 'danger' | 'expired' | null {
  const days = daysUntilExpiry(date);
  if (days === null) return null;
  if (days < 0) return 'expired';
  if (days <= 30) return 'danger';
  if (days <= 90) return 'warning';
  return 'ok';
}

export function storageLabel(req: string): string {
  switch (req) {
    case 'room_temp': return 'Room Temp';
    case 'refrigerated': return 'Refrigerated';
    case 'frozen': return 'Frozen';
    default: return req;
  }
}

export function movementTypeLabel(type: string): string {
  switch (type) {
    case 'receive': return 'Received';
    case 'ship': return 'Shipped';
    case 'adjust': return 'Adjusted';
    case 'return': return 'Returned';
    case 'expire': return 'Expired';
    case 'recall': return 'Recalled';
    default: return type;
  }
}

export function orderStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
