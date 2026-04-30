// Database types matching the Supabase schema
// In production, generate these with: npx supabase gen types typescript

export type UserRole = 'admin' | 'manager' | 'staff';
export type StorageRequirement = 'room_temp' | 'refrigerated' | 'frozen';
export type MovementType = 'receive' | 'ship' | 'adjust' | 'return' | 'expire' | 'recall';
export type OrderStatus = 'draft' | 'confirmed' | 'picking' | 'shipped' | 'cancelled';
export type LotStatus = 'active' | 'expired' | 'recalled' | 'depleted';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  tenant_id: string;
  name: string;
  sku: string;
  manufacturer: string | null;
  category: string | null;
  supplier_id: string | null;
  unit_of_measure: string;
  cost: number;
  price: number;
  low_stock_threshold: number;
  storage_requirement: StorageRequirement;
  is_lot_tracked: boolean;
  is_serial_tracked: boolean;
  expiry_alert_days: number;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  account_number: string | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  ship_to_address: string | null;
  license_type: string | null;
  license_number: string | null;
  license_expiration: string | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Lot {
  id: string;
  tenant_id: string;
  product_id: string;
  lot_number: string;
  expiration_date: string | null;
  quantity_on_hand: number;
  received_date: string;
  supplier_id: string | null;
  cost_at_receipt: number;
  location: string | null;
  status: LotStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  product?: Product;
  supplier?: Supplier;
}

export interface SerialNumber {
  id: string;
  tenant_id: string;
  lot_id: string;
  product_id: string;
  serial_number: string;
  is_shipped: boolean;
  shipped_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface StockMovement {
  id: string;
  tenant_id: string;
  product_id: string;
  lot_id: string | null;
  user_id: string;
  quantity: number;
  movement_type: MovementType;
  reason: string | null;
  reference_number: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  // Joined fields
  product?: Product;
  lot?: Lot;
  user?: User;
}

export interface SalesOrder {
  id: string;
  tenant_id: string;
  order_number: string;
  customer_id: string;
  status: OrderStatus;
  ship_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  customer?: Customer;
  lines?: SalesOrderLine[];
}

export interface SalesOrderLine {
  id: string;
  tenant_id: string;
  order_id: string;
  product_id: string;
  quantity_ordered: number;
  quantity_shipped: number;
  unit_price: number;
  created_at: string;
  // Joined fields
  product?: Product;
}

export interface Shipment {
  id: string;
  tenant_id: string;
  order_id: string;
  customer_id: string;
  shipped_by: string | null;
  shipped_at: string;
  tracking_number: string | null;
  notes: string | null;
  created_at: string;
  // Joined fields
  order?: SalesOrder;
  customer?: Customer;
  lines?: ShipmentLine[];
}

export interface ShipmentLine {
  id: string;
  tenant_id: string;
  shipment_id: string;
  product_id: string;
  lot_id: string | null;
  serial_number_id: string | null;
  quantity: number;
  created_at: string;
  // Joined fields
  product?: Product;
  lot?: Lot;
}

// View types
export interface ProductStockSummary {
  product_id: string;
  tenant_id: string;
  name: string;
  sku: string;
  low_stock_threshold: number;
  total_on_hand: number;
  active_lot_count: number;
  nearest_expiration: string | null;
}

export interface ExpiringLot {
  id: string;
  tenant_id: string;
  product_id: string;
  lot_number: string;
  expiration_date: string;
  quantity_on_hand: number;
  location: string | null;
  status: LotStatus;
  product_name: string;
  product_sku: string;
  expiry_alert_days: number;
  days_until_expiry: number;
}

// Supabase Database type for typed client
export interface Database {
  public: {
    Tables: {
      tenants: { Row: Tenant; Insert: Partial<Tenant> & { name: string; slug: string }; Update: Partial<Tenant> };
      users: { Row: User; Insert: Partial<User> & { id: string; tenant_id: string; email: string; full_name: string }; Update: Partial<User> };
      products: { Row: Product; Insert: Partial<Product> & { tenant_id: string; name: string; sku: string }; Update: Partial<Product> };
      suppliers: { Row: Supplier; Insert: Partial<Supplier> & { tenant_id: string; name: string }; Update: Partial<Supplier> };
      customers: { Row: Customer; Insert: Partial<Customer> & { tenant_id: string; name: string }; Update: Partial<Customer> };
      lots: { Row: Lot; Insert: Partial<Lot> & { tenant_id: string; product_id: string; lot_number: string }; Update: Partial<Lot> };
      serial_numbers: { Row: SerialNumber; Insert: Partial<SerialNumber> & { tenant_id: string; lot_id: string; product_id: string; serial_number: string }; Update: Partial<SerialNumber> };
      stock_movements: { Row: StockMovement; Insert: Partial<StockMovement> & { tenant_id: string; product_id: string; user_id: string; quantity: number; movement_type: MovementType }; Update: never };
      sales_orders: { Row: SalesOrder; Insert: Partial<SalesOrder> & { tenant_id: string; order_number: string; customer_id: string }; Update: Partial<SalesOrder> };
      sales_order_lines: { Row: SalesOrderLine; Insert: Partial<SalesOrderLine> & { tenant_id: string; order_id: string; product_id: string; quantity_ordered: number }; Update: Partial<SalesOrderLine> };
      shipments: { Row: Shipment; Insert: Partial<Shipment> & { tenant_id: string; order_id: string; customer_id: string }; Update: Partial<Shipment> };
      shipment_lines: { Row: ShipmentLine; Insert: Partial<ShipmentLine> & { tenant_id: string; shipment_id: string; product_id: string; quantity: number }; Update: Partial<ShipmentLine> };
    };
    Views: {
      product_stock_summary: { Row: ProductStockSummary };
      expiring_lots: { Row: ExpiringLot };
    };
  };
}
