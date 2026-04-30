import { Badge } from '@/components/ui/badge';
import type { LotStatus } from '@/types/database';

const config: Record<LotStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Active', variant: 'default' },
  expired: { label: 'Expired', variant: 'destructive' },
  recalled: { label: 'Recalled', variant: 'destructive' },
  depleted: { label: 'Depleted', variant: 'secondary' },
};

export function LotStatusBadge({ status }: { status: LotStatus }) {
  const { label, variant } = config[status] || { label: status, variant: 'outline' as const };
  return <Badge variant={variant}>{label}</Badge>;
}
