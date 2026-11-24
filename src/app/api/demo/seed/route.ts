import { NextResponse } from 'next/server';

export function POST() {
  return NextResponse.json({ error: 'Public demo seeding is disabled.' }, { status: 410 });
}
