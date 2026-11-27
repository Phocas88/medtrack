import { BRAND_LOGO_PATH, BRAND_LOGO_WHITE_PATH, PRODUCT_NAME } from '@/lib/brand';
import { cn } from '@/lib/utils';

const sizeClasses = {
  sm: 'max-w-[8.75rem] text-base sm:max-w-[10rem]',
  md: 'max-w-[11rem] text-lg sm:max-w-[13rem]',
  lg: 'max-w-[16rem] text-2xl sm:max-w-[18rem]',
  xl: 'max-w-[20rem] text-3xl sm:max-w-[26rem]',
};

export function InvexiqsLogo({ size = 'md', theme = 'light', className }: {
  size?: keyof typeof sizeClasses;
  theme?: 'light' | 'dark';
  className?: string;
}) {
  return (
    <span className={cn(
      'inline-flex w-full min-w-0 items-center align-middle',
      sizeClasses[size],
      theme === 'dark' ? 'rounded-md bg-brand-white' : 'dark:rounded-md dark:bg-brand-white',
      className,
    )}>
      {/* Serve the approved PNG directly to preserve its original bytes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={theme === 'dark' ? BRAND_LOGO_WHITE_PATH : BRAND_LOGO_PATH}
        alt={PRODUCT_NAME}
        width={1530}
        height={422}
        className="block h-auto w-full object-contain"
      />
    </span>
  );
}

export function InvexiqsNavigationLogo() {
  return <InvexiqsLogo size="sm" />;
}
