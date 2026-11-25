import { NextResponse } from 'next/server';

export function POST() {
  return NextResponse.json(
    { error: 'Self-service organization registration is unavailable. Request a pilot from the homepage.' },
    { status: 503 },
  );
}
