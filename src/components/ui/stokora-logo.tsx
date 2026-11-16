import { cn } from '@/lib/utils';

interface LogoProps {
  theme?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES = {
  sm: 'h-8',
  md: 'h-10',
  lg: 'h-14',
  xl: 'h-20',
};

/** Fit the supplied artwork's large white margins into a compact navigation slot. */
export function StokoraNavigationLogo() {
  return (
    <span className="relative inline-block h-11 w-[124px] shrink-0 overflow-hidden bg-white align-middle">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/stokora-logo.png" alt="Stokora WMS" width={156} height={104} className="absolute -left-4 -top-7 h-[104px] w-[156px] max-w-none" />
    </span>
  );
}

export function StokoraLogo({ theme = 'light', size = 'md', className }: LogoProps) {
  const h = SIZES[size];

  // All variants use the PNG — it already has the icon + wordmark
  if (theme === 'dark') {
    return (
      <div className={cn('bg-white rounded-lg px-2 py-1 shrink-0 inline-flex items-center', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/stokora-logo.png" alt="Stokora WMS" className={cn(h, 'w-auto')} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/stokora-logo.png" alt="Stokora WMS" className={cn(h, 'w-auto shrink-0', className)} />
  );
}
