// Database types matching the Supabase schema
// In production, generate these with: npx supabase gen types typescript

export type UserRole = 'admin' | 'manager' | 'staff';
export type StorageRequirement = 'room_temp' | 'refrigerated' | 'frozen';
export type MovementType = 'receive' | 'ship' | 'adjust' | 'return' | 'expire' | 'recall';
export type OrderStatus = 'draft' | 'confirmed' | 'picking' | 'shipped' | 'cancelled' | 'externally_fulfilled';
export type LotStatus = 'active' | 'expired' | 'recalled' | 'depleted';
export type POStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'partial' | 'received' | 'cancelled';
export type ReturnType = 'customer_return' | 'supplier_rma';
export type ReturnDisposition = 'restock' | 'quarantine' | 'destroy' | 'return_to_supplier';
export type ReturnStatus = 'pending' | 'inspecting' | 'completed' | 'cancelled';
export type CountStatus = 'planned' | 'in_progress' | 'pending_review' | 'approved' | 'cancelled';
export type QuarantineStatus = 'held' | 'released' | 'rejected' | 'destroyed';
export type NotificationType = 'low_stock' | 'expiring_lot' | 'expiring_license' | 'po_overdue' | 'temp_excursion' | 'reorder' | 'quarantine' | 'recall' | 'document_expiring' | 'general';
export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';
export type TransferStatus = 'pending' | 'in_transit' | 'received' | 'cancelled';
export type DocType = 'coa' | 'sds' | 'license' | 'dea_registration' | 'inspection' | 'invoice' | 'photo' | 'other';

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
  access_level?: 'full' | 'scanner_only';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type StockRotation = 'FIFO' | 'FEFO' | 'LIFO';

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
  stock_rotation: StockRotation;
  cycle_count_class?: 'A' | 'B' | 'C' | 'D' | null;
  cycle_count_class_locked?: boolean;
  storage_requirement: StorageRequirement;
  is_lot_tracked: boolean;
  is_serial_tracked: boolean;
  expiry_alert_days: number;
  lead_time_days: number;
  reorder_point: number | null;
  reorder_quantity: number | null;
  par_level_min: number | null;
  par_level_max: number | null;
  image_url: string | null;
  aisle: string | null;
  section: string | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

// Promotion / sale tracking
export type PromotionStatus = 'scheduled' | 'active' | 'ended' | 'cancelled';

export interface Promotion {
  id: string;
  tenant_id: string;
  product_id: string;
  name: string;
  sale_price: number;
  original_price: number;
  start_date: string;
  end_date: string;
  status: PromotionStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  product?: Product;
}

// Work Orders / Service Tickets
export type WorkOrderStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'invoiced' | 'cancelled';
export type WorkOrderLineType = 'part' | 'service';

export interface ServiceItem {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  default_price: number;
  estimated_minutes: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkOrder {
  id: string;
  tenant_id: string;
  order_number: string;
  customer_id: string | null;
  customer_name: string | null;
  status: WorkOrderStatus;
  priority: number;
  description: string | null;
  asset_info: string | null; // vehicle, equipment, serial — flexible text
  assigned_to: string | null;
  scheduled_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  parts_total: number;
  labor_total: number;
  tax: number;
  grand_total: number;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  assigned_user?: User;
  lines?: WorkOrderLine[];
}

export interface WorkOrderLine {
  id: string;
  tenant_id: string;
  work_order_id: string;
  line_type: WorkOrderLineType;
  product_id: string | null;
  service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
  product?: Product;
  service?: ServiceItem;
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
  price_tier_id: string | null;
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
  location_id: string | null;
  zone_id: string | null;
  status: LotStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  product?: Product;
  lot?: Lot;
  user?: User;
}

export type FulfillmentType = 'warehouse' | 'dropship';

export interface SalesOrder {
  id: string;
  tenant_id: string;
  order_number: string;
  customer_id: string;
  status: OrderStatus;
  fulfillment_type: FulfillmentType;
  ship_date: string | null;
  tracking_number: string | null;
  carrier: string | null;
  shipping_label_url: string | null;
  shipping_rate: number | null;
  ship_to_name: string | null;
  ship_to_address: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
  product?: Product;
  lot?: Lot;
}

// ── v2 Types ──

export interface Location {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  address: string | null;
  location_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Zone {
  id: string;
  tenant_id: string;
  location_id: string;
  name: string;
  code: string;
  storage_requirement: StorageRequirement;
  temperature_min: number | null;
  temperature_max: number | null;
  notes: string | null;
  created_at: string;
  location?: Location;
}

export interface Transfer {
  id: string;
  tenant_id: string;
  transfer_number: string;
  from_location_id: string;
  to_location_id: string;
  status: TransferStatus;
  initiated_by: string | null;
  received_by: string | null;
  shipped_at: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  from_location?: Location;
  to_location?: Location;
  lines?: TransferLine[];
}

export interface TransferLine {
  id: string;
  tenant_id: string;
  transfer_id: string;
  product_id: string;
  lot_id: string | null;
  quantity: number;
  quantity_received: number;
  created_at: string;
  product?: Product;
  lot?: Lot;
}

export interface PurchaseOrder {
  id: string;
  tenant_id: string;
  po_number: string;
  supplier_id: string;
  status: POStatus;
  order_date: string;
  expected_date: string | null;
  location_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  total_amount: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  supplier?: Supplier;
  location?: Location;
  lines?: POLine[];
}

export interface POLine {
  id: string;
  tenant_id: string;
  po_id: string;
  product_id: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  notes: string | null;
  created_at: string;
  product?: Product;
}

export interface Return {
  id: string;
  tenant_id: string;
  return_number: string;
  return_type: ReturnType;
  status: ReturnStatus;
  customer_id: string | null;
  supplier_id: string | null;
  reason: string | null;
  disposition: ReturnDisposition | null;
  credit_amount: number;
  inspected_by: string | null;
  inspected_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  supplier?: Supplier;
  lines?: ReturnLine[];
}

export interface ReturnLine {
  id: string;
  tenant_id: string;
  return_id: string;
  product_id: string;
  lot_id: string | null;
  quantity: number;
  disposition: ReturnDisposition | null;
  reason: string | null;
  created_at: string;
  product?: Product;
  lot?: Lot;
}

export interface CycleCount {
  plan_id?: string | null;
  id: string;
  tenant_id: string;
  count_number: string;
  location_id: string | null;
  status: CountStatus;
  count_type: string;
  is_blind: boolean;
  planned_date: string | null;
  completed_date: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  location?: Location;
  lines?: CycleCountLine[];
}

export interface CycleCountLine {
  id: string;
  tenant_id: string;
  count_id: string;
  product_id: string;
  lot_id: string | null;
  location: string | null;
  system_quantity: number;
  counted_quantity: number | null;
  variance: number | null;
  reason_code: string | null;
  counted_by: string | null;
  counted_at: string | null;
  notes: string | null;
  created_at: string;
  product?: Product;
  lot?: Lot;
}

export interface QuarantineHold {
  id: string;
  tenant_id: string;
  lot_id: string;
  product_id: string;
  status: QuarantineStatus;
  reason: string;
  quantity: number;
  held_by: string | null;
  held_at: string;
  released_by: string | null;
  released_at: string | null;
  disposition: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  lot?: Lot;
  product?: Product;
}

export interface Document {
  id: string;
  tenant_id: string;
  doc_type: DocType;
  title: string;
  file_name: string | null;
  file_url: string | null;
  file_size: number | null;
  mime_type: string | null;
  entity_type: string;
  entity_id: string;
  expiration_date: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string | null;
  notification_type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  read_at: string | null;
  is_email_sent: boolean;
  created_at: string;
}

export interface NotificationPreference {
  id: string;
  tenant_id: string;
  user_id: string;
  notification_type: NotificationType;
  in_app: boolean;
  email: boolean;
  created_at: string;
}

export interface PriceTier {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  discount_percent: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerPrice {
  id: string;
  tenant_id: string;
  customer_id: string;
  product_id: string;
  custom_price: number;
  effective_date: string;
  expiration_date: string | null;
  notes: string | null;
  created_at: string;
  customer?: Customer;
  product?: Product;
}

export interface Kit {
  id: string;
  tenant_id: string;
  product_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product?: Product;
  components?: KitComponent[];
}

export interface KitComponent {
  id: string;
  tenant_id: string;
  kit_id: string;
  component_product_id: string;
  quantity: number;
  created_at: string;
  product?: Product;
}

export interface KitAssembly {
  id: string;
  tenant_id: string;
  kit_id: string;
  quantity_assembled: number;
  assembled_by: string | null;
  assembled_at: string;
  lot_number: string | null;
  notes: string | null;
  created_at: string;
  kit?: Kit;
  lots?: KitAssemblyLot[];
}

export interface KitAssemblyLot {
  id: string;
  tenant_id: string;
  assembly_id: string;
  component_product_id: string;
  lot_id: string;
  quantity_used: number;
  created_at: string;
  product?: Product;
  lot?: Lot;
}

export interface CustomFieldDefinition {
  id: string;
  tenant_id: string;
  entity_type: string;
  field_name: string;
  field_label: string;
  field_type: string;
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
  created_at: string;
}

export interface CustomFieldValue {
  id: string;
  tenant_id: string;
  field_id: string;
  entity_id: string;
  value: string | null;
  created_at: string;
  updated_at: string;
  definition?: CustomFieldDefinition;
}

export interface TemperatureLog {
  id: string;
  tenant_id: string;
  zone_id: string;
  temperature: number;
  is_excursion: boolean;
  recorded_by: string | null;
  recorded_at: string;
  notes: string | null;
  zone?: Zone;
}

// ── UOM & Multi-Part Types ──

export interface ProductUomConversion {
  id: string;
  tenant_id: string;
  product_id: string;
  uom_name: string;
  conversion_factor: number;
  barcode: string | null;
  is_default: boolean;
  is_orderable: boolean;
  is_sellable: boolean;
  weight: number | null;
  dimensions: string | null;
  created_at: string;
  updated_at: string;
  product?: Product;
}

export interface ProductPart {
  id: string;
  tenant_id: string;
  product_id: string;
  part_number: number;
  total_parts: number;
  part_description: string | null;
  part_sku: string | null;
  weight: number | null;
  dimensions: string | null;
  barcode: string | null;
  notes: string | null;
  created_at: string;
  product?: Product;
}

// ── Bins & Scanner Types ──

export type BinType = 'primary' | 'secondary' | 'bulk' | 'staging' | 'returns';
export type ScanTaskType = 'verify_stock' | 'verify_bin' | 'cycle_count' | 'bin_to_bin' | 'replenish' | 'putaway' | 'pick';
export type ScanTaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';

export interface Bin {
  id: string;
  tenant_id: string;
  location_id: string;
  zone_id: string | null;
  bin_code: string;
  bin_type: BinType;
  description: string | null;
  is_active: boolean;
  max_weight: number | null;
  max_volume: number | null;
  created_at: string;
  updated_at: string;
  location?: Location;
  zone?: Zone;
}

export interface BinInventory {
  id: string;
  tenant_id: string;
  bin_id: string;
  product_id: string;
  lot_id: string | null;
  quantity: number;
  created_at: string;
  updated_at: string;
  bin?: Bin;
  product?: Product;
  lot?: Lot;
}

export interface ProductBinAssignment {
  id: string;
  tenant_id: string;
  product_id: string;
  bin_id: string;
  bin_role: string;
  min_quantity: number;
  max_quantity: number;
  reorder_point: number;
  unit_of_measure: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product?: Product;
  bin?: Bin;
}

export interface ScanTask {
  cycle_count_line_id?: string | null;
  pick_batch_id?: string | null;
  pick_order_id?: string | null;
  pick_tote_code?: string | null;
  id: string;
  tenant_id: string;
  task_type: ScanTaskType;
  status: ScanTaskStatus;
  priority: number;
  title: string;
  instructions: string | null;
  assigned_to: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  location_id: string | null;
  bin_id: string | null;
  product_id: string | null;
  lot_id: string | null;
  source_bin_id: string | null;
  target_bin_id: string | null;
  requested_quantity: number | null;
  scanned_quantity: number | null;
  variance: number | null;
  result_notes: string | null;
  completed_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assigned_user?: User;
  location?: Location;
  bin?: Bin;
  product?: Product;
}

export interface ScanLog {
  id: string;
  tenant_id: string;
  task_id: string | null;
  scanned_by: string | null;
  scan_type: string;
  scanned_value: string;
  resolved_bin_id: string | null;
  resolved_product_id: string | null;
  resolved_lot_id: string | null;
  quantity: number | null;
  notes: string | null;
  scanned_at: string;
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
