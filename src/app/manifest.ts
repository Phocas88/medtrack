import type { MetadataRoute } from 'next';
import { BRAND_COLOR, BRAND_ICON_PATH, BRAND_PALETTE, BRAND_TAGLINE, PRODUCT_NAME } from '@/lib/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAME,
    short_name: PRODUCT_NAME,
    description: BRAND_TAGLINE,
    id: '/scanner',
    scope: '/',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: BRAND_PALETTE.white,
    theme_color: BRAND_COLOR,
    shortcuts: [
      { name: 'Warehouse Workspace', url: '/dashboard' },
      { name: 'Mobile Scanner', url: '/scan' },
    ],
    icons: [
      { src: BRAND_ICON_PATH, sizes: 'any', type: 'image/svg+xml' },
      { src: '/branding/invexiqs-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/branding/invexiqs-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
