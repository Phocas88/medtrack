import { requireUser, routeError } from '@/lib/server-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { NextResponse } from 'next/server';
import { schedulePickup, buyPickup, isShippingConfigured, type ShippingAddress } from '@/lib/shipping';

export async function POST(request: Request) {
  try {
    const authorizedUser = await requireUser(['admin', 'manager'], true);
    if (!isShippingConfigured()) {
      return NextResponse.json({ error: 'Shipping not configured' }, { status: 400 });
    }

    const { shipment_id, address, date, carrier, service } = await request.json() as {
      shipment_id: string;
      address: ShippingAddress;
      date: string;
      carrier: string;
      service: string;
    };

    if (!shipment_id || !address || !date) {
      return NextResponse.json({ error: 'shipment_id, address, and date required' }, { status: 400 });
    }

    const { data: quote, error: quoteError } = await createServiceClient().from('shipping_quotes').select('shipment_id').eq('shipment_id', shipment_id).eq('tenant_id', authorizedUser.tenant_id).single();
    if (quoteError || !quote) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });

    // Schedule the pickup
    const pickup = await schedulePickup(shipment_id, address, date, date);

    // Buy the pickup if carrier/service provided
    if (carrier && service && pickup.id) {
      await buyPickup(pickup.id, carrier, service);
    }

    return NextResponse.json({
      pickup_id: pickup.id,
      status: pickup.status,
      confirmation: pickup.confirmation || null,
    });
  } catch (err) {
    return routeError(err);
  }
}
