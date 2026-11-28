import { suiteProducts } from '@/lib/product-suite';
import { publicSiteOrigin } from '@/lib/public-site';
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicSiteOrigin;
  return ['/', '/demo', '/support', '/guide', '/academy', '/windows', '/plans', '/tools', '/integrations-directory', '/legal/privacy', '/legal/terms', '/suite', ...suiteProducts.map(product => `/suite/${product.slug}`)].map((path) => ({
    url: new URL(path, base).href,
  }));
}
