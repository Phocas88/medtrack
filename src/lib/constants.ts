// App branding
export const APP_NAME = 'Stokora WMS';
export const APP_FALLBACK_NAME = 'Stokora WMS';

// localStorage keys
export const STORAGE_KEYS = {
  FEATURES: 'stokora_features',
  ONBOARDING: 'stokora_onboarding',
  RECON_PREFIX: 'stokora_recon_',
  CART: 'stokora_cart',
} as const;

// API endpoints
export const API_ROUTES = {
  SIGNUP: '/api/auth/signup',
  NOTIFICATION_CHECK: '/api/notifications/check',
  NOTIFICATION_EMAIL: '/api/notifications/send-email',
  PORTAL_INVITE: '/api/portal/invite',
} as const;

// Default values
export const DEFAULTS = {
  TIMEZONE: 'America/New_York',
  DATE_FORMAT: 'MM/DD/YYYY',
  CURRENCY: 'USD',
  EXPIRY_ALERT_DAYS: 90,
  LOW_STOCK_THRESHOLD: 10,
  REORDER_POINT: 10,
} as const;
