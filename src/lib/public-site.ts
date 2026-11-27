const production = 'https://stokora.vercel.app';

export const publicSiteOrigin = (() => {
  try {
    const configured = new URL(process.env.NEXT_PUBLIC_APP_URL || production);
    return ['http:', 'https:'].includes(configured.protocol) ? configured.origin : production;
  } catch {
    return production;
  }
})();

export function safeReturnTo(value: string | null) {
  if (value && /^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(value)) return value;
  return '/dashboard';
}

function emailAddress(value: string | undefined) {
  const address = value?.trim();
  return address && /^[^\s<>"@]+@[^\s<>"@]+\.[^\s<>"@]+$/.test(address) ? address : undefined;
}

export const publicSupportAddress = emailAddress(process.env.NEXT_PUBLIC_SUPPORT_EMAIL);
export const publicPrivacyAddress = emailAddress(process.env.NEXT_PUBLIC_PRIVACY_EMAIL);
