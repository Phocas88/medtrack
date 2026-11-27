'use client';

import { BRAND_PALETTE, PRODUCT_NAME } from '@/lib/brand';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', margin: 0, background: BRAND_PALETTE.lavender, color: BRAND_PALETTE.charcoal }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: BRAND_PALETTE.royalPlum }}>{PRODUCT_NAME}</p>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>Something went wrong</h1>
          <p style={{ color: BRAND_PALETTE.mutedGray, marginBottom: '1rem' }}>
            {error.digest ? `Error ID: ${error.digest}` : 'An unexpected error occurred'}
          </p>
          <button
            onClick={reset}
            style={{ padding: '0.5rem 1.5rem', borderRadius: '6px', border: 'none', background: BRAND_PALETTE.royalPlum, color: BRAND_PALETTE.white, cursor: 'pointer', fontSize: '14px' }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
