import { NextResponse } from 'next/server';
import { getRates, isShippingConfigured, type ShippingAddress, type Parcel } from '@/lib/shipping';

export async function POST(request: Request) {
  try {
    if (!isShippingConfigured()) {
      return NextResponse.json({ error: 'Shipping not configured. Add EASYPOST_API_KEY to environment variables.' }, { status: 400 });
    }

    const { from, to, parcel } = await request.json() as {
      from: ShippingAddress;
      to: ShippingAddress;
      parcel: Parcel;
    };

    if (!from?.street1 || !to?.street1 || !parcel?.weight) {
      return NextResponse.json({ error: 'From address, to address, and parcel weight are required' }, { status: 400 });
    }

    const result = await getRates(from, to, parcel);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to get rates' }, { status: 500 });
  }
}
