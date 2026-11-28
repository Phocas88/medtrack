'use client';

import { Analytics } from '@vercel/analytics/react';

export function SiteAnalytics() {
  return <Analytics beforeSend={event => {
    const url = new URL(event.url, window.location.origin);
    if (url.pathname.replace(/\/$/, '') === '/supplier-confirmation') return null;
    url.hash = '';
    return { ...event, url: url.href };
  }} />;
}
