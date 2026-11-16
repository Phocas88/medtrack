import { NextResponse } from 'next/server';
import { requirePortalCustomer } from '@/lib/portal-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { routeError } from '@/lib/server-auth';
export async function GET(request: Request) {
  try {
    const { membership } = await requirePortalCustomer(new URL(request.url).searchParams.get('customer') || undefined);
    const db = createServiceClient();
    const { data, error } = await db.from('products').select('id,name,sku,price,unit_of_measure').eq('tenant_id', membership.tenant_id).eq('is_archived', false).order('name');
    if (error) throw error;
    const { data: prices, error: pricesError } = await db.from('customer_prices').select('product_id,custom_price,effective_date,expiration_date').eq('tenant_id', membership.tenant_id).eq('customer_id', membership.customer_id);
    if (pricesError) throw pricesError;
    const { data: customer, error: customerError } = await db.from('customers').select('tier:price_tiers(discount_percent)').eq('id', membership.customer_id).eq('tenant_id', membership.tenant_id).single();
    if (customerError) throw customerError;
    const tier = customer?.tier as unknown as { discount_percent: number } | null;
    const today = new Date().toISOString().slice(0,10);
    const products = data.map(product => {
      const special = prices?.find(price => price.product_id === product.id && price.effective_date <= today && (!price.expiration_date || price.expiration_date >= today));
      return { ...product, price: special?.custom_price ?? Number(product.price) * (1 - Number(tier?.discount_percent || 0) / 100) };
    });
    return NextResponse.json({ products }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return routeError(error); }
}
