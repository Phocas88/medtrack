import { cn } from '@/lib/utils';

interface LogoProps {
  variant?: 'full' | 'mark' | 'text';
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
}

/**
 * Stokora WMS logo component.
 * - "full": icon + wordmark (default)
 * - "mark": just the S hexagon icon
 * - "text": just the wordmark
 *
 * theme:
 * - "light": dark text (for white/light backgrounds)
 * - "dark": white text (for dark backgrounds)
 * - "auto": uses CSS dark mode detection
 */
export function StokoraLogo({ variant = 'full', theme = 'auto', className }: LogoProps) {
  // Brand colors from logo: navy #1a2744, teal #14b8a6
  const navy = theme === 'dark' ? '#ffffff' : theme === 'light' ? '#1a2744' : undefined;
  const teal = '#14b8a6';

  if (variant === 'mark') {
    return (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn('shrink-0', className)}>
        <path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" fill={navy} className={!navy ? 'fill-slate-900 dark:fill-white' : ''} />
        <path d="M20 6L32 13V27L20 34L8 27V13L20 6Z" fill="none" stroke={teal} strokeWidth="1.5" />
        <rect x="15" y="15" width="4" height="4" rx="0.5" fill={teal} />
        <rect x="21" y="15" width="4" height="4" rx="0.5" fill={teal} opacity="0.7" />
        <rect x="18" y="20" width="4" height="4" rx="0.5" fill={teal} opacity="0.5" />
      </svg>
    );
  }

  if (variant === 'text') {
    return (
      <span className={cn('font-bold tracking-tight', className)} style={navy ? { color: navy } : undefined}>
        <span className={!navy ? 'text-slate-900 dark:text-white' : ''}>Stokora</span>
        <span style={{ color: teal }} className="ml-1 font-medium text-[0.7em]">WMS</span>
      </span>
    );
  }

  // Full: mark + text
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <StokoraLogo variant="mark" theme={theme} className="h-7 w-7" />
      <StokoraLogo variant="text" theme={theme} className="text-lg" />
    </div>
  );
}
