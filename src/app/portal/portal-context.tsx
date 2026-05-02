'use client';

import { createContext, useContext } from 'react';

export interface CustomerInfo {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  price_tier_id: string | null;
  notes: string | null;
}

export interface PortalContextType {
  customer: CustomerInfo;
  tenantId: string;
}

export const PortalContext = createContext<PortalContextType | null>(null);

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used within PortalLayout');
  return ctx;
}
