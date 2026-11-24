import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Live product demo | Stokora WMS',
  description: 'Explore the Stokora warehouse dashboard, mobile scanner, register, and customer portal with sample data.',
  alternates: { canonical: '/demo' },
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return children;
}
