import { NextResponse } from 'next/server';

export function POST() {
  return NextResponse.json(
    { error: 'Online billing is unavailable. Contact Stokora for help with your plan.' },
    { status: 503 },
  );
}
