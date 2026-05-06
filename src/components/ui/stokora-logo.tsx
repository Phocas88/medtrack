import { cn } from '@/lib/utils';

interface LogoProps {
  variant?: 'full' | 'mark' | 'text';
  theme?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { mark: 'h-6', text: 'text-sm', gap: 'gap-1.5' },
  md: { mark: 'h-7', text: 'text-lg', gap: 'gap-2' },
  lg: { mark: 'h-10', text: 'text-2xl', gap: 'gap-3' },
};

export function StokoraLogo({ variant = 'full', theme = 'light', size = 'md', className }: LogoProps) {
  const s = SIZES[size];
  const teal = '#14b8a6';

  if (variant === 'mark') {
    // Use actual PNG logo mark — on dark bg, wrap in white rounded pill
    if (theme === 'dark') {
      return (
        <div className={cn('bg-white rounded-md p-0.5 shrink-0 flex items-center justify-center', className)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/stokora-logo.png" alt="Stokora" className={cn(s.mark, 'w-auto')} />
        </div>
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/stokora-logo.png" alt="Stokora" className={cn(s.mark, 'w-auto shrink-0', className)} />
    );
  }

  if (variant === 'text') {
    const color = theme === 'dark' ? '#ffffff' : '#1a2744';
    return (
      <span className={cn('font-bold tracking-tight', s.text, className)} style={{ color }}>
        Stokora<span style={{ color: teal }} className="ml-1 font-medium text-[0.7em]">WMS</span>
      </span>
    );
  }

  // Full: PNG logo (already has icon + text in the image)
  if (theme === 'dark') {
    return (
      <div className={cn('bg-white/95 rounded-lg px-2 py-1 shrink-0', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/stokora-logo.png" alt="Stokora WMS" className={cn(s.mark, 'w-auto')} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/stokora-logo.png" alt="Stokora WMS" className={cn(s.mark, 'w-auto shrink-0', className)} />
  );
}
