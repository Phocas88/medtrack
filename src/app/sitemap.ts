import { publicSiteOrigin } from '@/lib/public-site';
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicSiteOrigin;
  return ['/', '/demo', '/support', '/guide', '/academy', '/windows', '/plans', '/tools', '/integrations-directory', '/legal/privacy', '/legal/terms'].map((path) => ({
    url: new URL(path, base).href,
  }));
}
