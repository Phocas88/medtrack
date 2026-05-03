import dynamic from 'next/dynamic';

/**
 * Lazy-load heavy components with code splitting.
 * Usage:
 *   const HeavyChart = lazyLoad(() => import('@/components/charts/revenue-chart'))
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyLoad<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  loading?: React.ReactNode
) {
  return dynamic(importFn, {
    loading: () => (loading || null) as React.ReactElement | null,
    ssr: false,
  });
}
