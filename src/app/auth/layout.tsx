import type { Metadata } from 'next';
import { PRODUCT_NAME } from '@/lib/brand';

export const metadata: Metadata = { title: `Account access | ${PRODUCT_NAME}`, robots: { index: false } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
