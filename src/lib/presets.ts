// Tenant preset system — drives UI branching for lite/3pl/full experiences

export type TenantPreset = 'lite' | '3pl' | 'full';

interface PresetDefinition {
  displayName: string;
  description: string;
  sidebarSections: string[]; // which sidebar section titles to show
  enabledModules: string[];  // which module keys are on by default
  labelOverrides: Record<string, string>; // UI label replacements
}

export const PRESET_DEFINITIONS: Record<TenantPreset, PresetDefinition> = {
  lite: {
    displayName: 'Lite (Shopify)',
    description: 'For Shopify merchants — focused on inventory, orders, and reporting',
    sidebarSections: ['Overview', 'Inventory', 'Orders & Fulfillment', 'Sales & Customers', 'Integrations', 'Admin'],
    enabledModules: [
      'products', 'lots', 'movements', 'expiration',
      'purchase-orders', 'receive', 'ship', 'returns', 'reorder',
      'customers', 'suppliers', 'pricing', 'promotions',
      'reports', 'analytics', 'metrics',
      'shopify', 'settings', 'profile', 'admin/users',
    ],
    labelOverrides: {},
  },
  '3pl': {
    displayName: '3PL',
    description: 'For third-party logistics — multi-client warehousing and billing',
    sidebarSections: ['Overview', 'Inventory', 'Orders & Fulfillment', 'Warehouse', 'Sales & Customers', 'Tools & Reports', 'Admin'],
    enabledModules: [
      'products', 'lots', 'movements', 'product-matrix', 'expiration', 'custom-fields',
      'purchase-orders', 'receive', 'put-away', 'wave-picking', 'ship', 'returns', 'reorder',
      'work-orders', 'services',
      'locations', 'bins', 'transfers', 'cycle-counts', 'quarantine', 'scanner', 'task-board',
      'customers', 'suppliers', 'pricing', 'customer-portal',
      'reports', 'analytics', 'metrics', 'labor', 'abc-analysis',
      'audit', 'notifications',
      'billing', 'settings', 'profile', 'admin/users',
    ],
    labelOverrides: {
      'Customer': 'Client',
      'Customers': 'Clients',
      'customer': 'client',
      'customers': 'clients',
      'Customer Portal': 'Client Portal',
    },
  },
  full: {
    displayName: 'Full WMS',
    description: 'Complete warehouse management — all features enabled',
    sidebarSections: [
      'Overview', 'Inventory', 'Orders & Fulfillment', 'Warehouse',
      'Sales & Customers', 'Suppliers', 'Compliance',
      'Tools & Reports', 'Integrations', 'Admin',
    ],
    enabledModules: [], // empty = show everything (no filtering)
    labelOverrides: {},
  },
};

/**
 * Get the preset config for a tenant.
 * Merges preset defaults with tenant-specific overrides from enabled_modules.
 */
export function getPresetConfig(preset: TenantPreset, enabledModulesOverride?: Record<string, boolean>): PresetDefinition {
  const base = PRESET_DEFINITIONS[preset];

  if (!enabledModulesOverride || Object.keys(enabledModulesOverride).length === 0) {
    return base;
  }

  // Merge: preset defaults + explicit adds - explicit removes
  const modules = new Set(base.enabledModules);
  for (const [key, enabled] of Object.entries(enabledModulesOverride)) {
    if (enabled) modules.add(key);
    else modules.delete(key);
  }

  return { ...base, enabledModules: Array.from(modules) };
}

/**
 * Check if a sidebar section should be visible for a given preset.
 */
export function isSectionVisible(sectionTitle: string, preset: TenantPreset): boolean {
  if (preset === 'full') return true; // full shows everything
  return PRESET_DEFINITIONS[preset].sidebarSections.includes(sectionTitle);
}

/**
 * Get a label, applying preset-specific overrides.
 */
export function getLabel(label: string, preset: TenantPreset): string {
  return PRESET_DEFINITIONS[preset].labelOverrides[label] || label;
}
