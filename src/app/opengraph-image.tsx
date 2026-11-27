import { ImageResponse } from 'next/og';
import { BRAND_COLOR, BRAND_PALETTE, BRAND_TAGLINE, PRODUCT_NAME } from '@/lib/brand';

export const alt = PRODUCT_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{
      display: 'flex', width: '100%', height: '100%', flexDirection: 'column',
      justifyContent: 'center', padding: 90, background: BRAND_PALETTE.lavender, color: BRAND_COLOR,
    }}>
      <div style={{ width: 88, height: 10, background: BRAND_PALETTE.coral, marginBottom: 44 }} />
      <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: '-0.045em' }}>{PRODUCT_NAME}</div>
      <div style={{ fontSize: 38, marginTop: 24, color: BRAND_PALETTE.deepPlum }}>{BRAND_TAGLINE}</div>
    </div>,
    size,
  );
}
