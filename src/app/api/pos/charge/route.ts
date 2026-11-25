import { NextResponse } from 'next/server';

export function POST() {
  return NextResponse.json(
    { error: 'Card payments are unavailable. Select cash or check in the register.' },
    { status: 503 },
  );
}
