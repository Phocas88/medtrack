import { publicSiteOrigin } from '@/lib/public-site';
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = publicSiteOrigin;
  return {
    rules: { userAgent: '*', allow: ['/$', '/demo$', '/support$', '/guide$', '/legal/privacy$', '/legal/terms$'], disallow: '/' },
    sitemap: new URL('/sitemap.xml', base).href,
  };
}
