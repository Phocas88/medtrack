import { NextResponse } from 'next/server';
import { schedulePickup, buyPickup, isShippingConfigured, type ShippingAddress } from '@/lib/shipping';

export async function POST(request: Request) {
  try {
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
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Pickup scheduling failed' }, { status: 500 });
  }
}
