import { Badge } from '@/components/ui/badge';
import { expiryStatus, daysUntilExpiry } from '@/lib/format';

interface ExpiryBadgeProps {
  date: string | null;
  showDays?: boolean;
}

export function ExpiryBadge({ date, showDays = true }: ExpiryBadgeProps) {
  const status = expiryStatus(date);
  const days = daysUntilExpiry(date);

  if (!status || days === null) return <span className="text-muted-foreground">—</span>;

  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    ok: 'secondary',
    warning: 'outline',
    danger: 'destructive',
    expired: 'destructive',
  };

  const labels: Record<string, string> = {
    ok: showDays ? `${days}d` : 'OK',
    warning: showDays ? `${days}d` : 'Soon',
    danger: showDays ? `${days}d` : 'Urgent',
    expired: 'Expired',
  };

  return (
    <Badge
      variant={variants[status]}
      className={status === 'warning' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : ''}
    >
      {labels[status]}
    </Badge>
  );
}
