import { digestCsv } from '@/lib/analytics-digest';
import { uuid } from '@/lib/security';
import { HttpError, requireUser, routeError } from '@/lib/server-auth';
import { createClient } from '@/lib/supabase/server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = uuid.parse((await params).id);
    const user = await requireUser();
    const db = await createClient();
    const { data: enabled, error: accessError } = await db.rpc('suite_has_access', { p_product: 'analytics' });
    if (accessError) throw accessError;
    if (!enabled) throw new HttpError(403, 'Analytics add-on required');
    const { data, error } = await db.from('analytics_digest_history').select('report_date,late_purchase_orders,overdue_counts,aging_orders,carrier_exceptions')
      .eq('tenant_id', user.tenant_id).eq('user_id', user.id).eq('export_id', id).eq('csv_export', true).maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'Report not found');
    return new Response(digestCsv(data), { headers: {
      'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="invexiqs-exceptions-${data.report_date}.csv"`,
      'Cache-Control': 'private, no-store',
    } });
  } catch (error) { return routeError(error); }
}
