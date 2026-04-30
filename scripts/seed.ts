/**
 * MedTrack Seed Script
 *
 * Seeds the database with sample medical supply data for demos.
 * Requires SUPABASE_SERVICE_ROLE_KEY in environment.
 *
 * Usage:
 *   npx tsx scripts/seed.ts
 *
 * This script:
 * 1. Creates a demo tenant
 * 2. Creates a demo admin user (must already exist in Supabase Auth)
 * 3. Creates suppliers, customers, products, lots, and sample orders
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function seed() {
  console.log('Seeding MedTrack database...\n');

  // ── Create demo auth user ──
  const demoEmail = 'demo@medtrack.io';
  const demoPassword = 'demo1234';

  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: demoEmail,
    password: demoPassword,
    email_confirm: true,
  });

  if (authErr && !authErr.message.includes('already')) {
    console.error('Auth user creation error:', authErr.message);
    process.exit(1);
  }

  const userId = authUser?.user?.id;
  if (!userId) {
    // User may already exist — try to find them
    const { data: users } = await supabase.auth.admin.listUsers();
    const existing = users?.users?.find((u) => u.email === demoEmail);
    if (!existing) { console.error('Cannot find or create demo user'); process.exit(1); }
    console.log('Using existing demo user:', existing.id);
    var finalUserId = existing.id;
  } else {
    var finalUserId = userId;
    console.log('Created demo auth user:', demoEmail);
  }

  // ── Create tenant ──
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .insert({ name: 'Apex Medical Supplies', slug: 'apex-medical-demo' })
    .select()
    .single();

  if (tenantErr) {
    console.error('Tenant error:', tenantErr.message);
    // Might already exist — try to find it
    const { data: existing } = await supabase.from('tenants').select().eq('slug', 'apex-medical-demo').single();
    if (!existing) process.exit(1);
    console.log('Using existing tenant');
    var tenantId = existing.id;
  } else {
    var tenantId = tenant.id;
    console.log('Created tenant:', tenant.name);
  }

  // ── Create user record ──
  await supabase.from('users').upsert({
    id: finalUserId,
    tenant_id: tenantId,
    email: demoEmail,
    full_name: 'Demo Admin',
    role: 'admin',
    is_active: true,
  });
  console.log('Created user record');

  // ── Suppliers ──
  const suppliers = [
    { tenant_id: tenantId, name: 'MedLine Industries', contact_name: 'Sarah Chen', email: 'orders@medline.example.com', phone: '800-555-0101', account_number: 'ML-4521' },
    { tenant_id: tenantId, name: 'Cardinal Health', contact_name: 'James Wilson', email: 'supply@cardinal.example.com', phone: '800-555-0102', account_number: 'CH-8834' },
    { tenant_id: tenantId, name: 'McKesson Medical', contact_name: 'Emily Rodriguez', email: 'orders@mckesson.example.com', phone: '800-555-0103', account_number: 'MK-2219' },
    { tenant_id: tenantId, name: 'Henry Schein', contact_name: 'Michael Park', email: 'sales@henryschein.example.com', phone: '800-555-0104', account_number: 'HS-6677' },
  ];

  const { data: supplierRows } = await supabase.from('suppliers').insert(suppliers).select();
  console.log(`Created ${supplierRows?.length} suppliers`);
  const supplierMap: Record<string, string> = {};
  supplierRows?.forEach((s) => { supplierMap[s.name] = s.id; });

  // ── Customers ──
  const customers = [
    { tenant_id: tenantId, name: 'Downtown Family Clinic', contact_name: 'Dr. Lisa Park', email: 'purchasing@downtownclinic.example.com', phone: '555-0201', ship_to_address: '123 Main St, Suite 200, Portland, OR 97201', license_type: 'Medical Facility', license_number: 'MF-2024-4412', license_expiration: '2026-12-31' },
    { tenant_id: tenantId, name: 'Riverside Urgent Care', contact_name: 'Tom Harper', email: 'orders@riversideuc.example.com', phone: '555-0202', ship_to_address: '456 River Rd, Portland, OR 97202', license_type: 'Urgent Care', license_number: 'UC-2024-1198', license_expiration: '2026-06-15' },
    { tenant_id: tenantId, name: 'Greenwood Pharmacy', contact_name: 'Nina Patel', email: 'supply@greenwoodrx.example.com', phone: '555-0203', ship_to_address: '789 Oak Ave, Portland, OR 97203', license_type: 'Pharmacy', license_number: 'PH-2024-8856', license_expiration: '2026-09-30' },
    { tenant_id: tenantId, name: 'Pacific Dental Group', contact_name: 'Dr. Kevin Wu', email: 'office@pacificdental.example.com', phone: '555-0204', ship_to_address: '321 Elm St, Portland, OR 97204', license_type: 'Dental Practice', license_number: 'DP-2024-3321', license_expiration: '2026-03-01' },
    { tenant_id: tenantId, name: 'Valley Senior Living', contact_name: 'Maria Garcia', email: 'medical@valleysenior.example.com', phone: '555-0205', ship_to_address: '555 Valley View Dr, Portland, OR 97205', license_type: 'Care Facility', license_number: 'CF-2024-7744', license_expiration: '2026-08-15' },
  ];

  const { data: customerRows } = await supabase.from('customers').insert(customers).select();
  console.log(`Created ${customerRows?.length} customers`);

  // ── Products ──
  const products = [
    { tenant_id: tenantId, name: 'Nitrile Exam Gloves (Medium)', sku: 'GLV-NIT-M', manufacturer: 'MedLine', category: 'PPE', supplier_id: supplierMap['MedLine Industries'], unit_of_measure: 'box', cost: 8.50, price: 14.99, low_stock_threshold: 20, storage_requirement: 'room_temp' as const, is_lot_tracked: true, is_serial_tracked: false, expiry_alert_days: 90 },
    { tenant_id: tenantId, name: 'Nitrile Exam Gloves (Large)', sku: 'GLV-NIT-L', manufacturer: 'MedLine', category: 'PPE', supplier_id: supplierMap['MedLine Industries'], unit_of_measure: 'box', cost: 8.50, price: 14.99, low_stock_threshold: 20, storage_requirement: 'room_temp' as const, is_lot_tracked: true, is_serial_tracked: false, expiry_alert_days: 90 },
    { tenant_id: tenantId, name: '3cc Syringe w/ 22g Needle', sku: 'SYR-3CC-22G', manufacturer: 'BD', category: 'Injection Supplies', supplier_id: supplierMap['Cardinal Health'], unit_of_measure: 'each', cost: 0.35, price: 0.89, low_stock_threshold: 500, storage_requirement: 'room_temp' as const, is_lot_tracked: true, is_serial_tracked: false, expiry_alert_days: 180 },
    { tenant_id: tenantId, name: '10cc Syringe w/ 18g Needle', sku: 'SYR-10CC-18G', manufacturer: 'BD', category: 'Injection Supplies', supplier_id: supplierMap['Cardinal Health'], unit_of_measure: 'each', cost: 0.45, price: 1.09, low_stock_threshold: 300, storage_requirement: 'room_temp' as const, is_lot_tracked: true, is_serial_tracked: false, expiry_alert_days: 180 },
    { tenant_id: tenantId, name: 'Sterile Gauze Pads 4x4', sku: 'GAU-4X4-STR', manufacturer: 'Dynarex', category: 'Wound Care', supplier_id: supplierMap['McKesson Medical'], unit_of_measure: 'pack', cost: 3.20, price: 6.49, low_stock_threshold: 50, storage_requirement: 'room_temp' as const, is_lot_tracked: true, is_serial_tracked: false, expiry_alert_days: 120 },
    { tenant_id: tenantId, name: 'Adhesive Bandages Assorted', sku: 'BND-ASSORT', manufacturer: 'Curad', category: 'Wound Care', supplier_id: supplierMap['McKesson Medical'], unit_of_measure: 'box', cost: 4.10, price: 8.99, low_stock_threshold: 30, storage_requirement: 'room_temp' as const, is_lot_tracked: true, is_serial_tracked: false, expiry_alert_days: 365 },
    { tenant_id: tenantId, name: 'Alcohol Prep Pads', sku: 'ALC-PREP', manufacturer: 'BD', category: 'Antiseptics', supplier_id: supplierMap['Cardinal Health'], unit_of_measure: 'box', cost: 2.80, price: 5.99, low_stock_threshold: 40, storage_requirement: 'room_temp' as const, is_lot_tracked: true, is_serial_tracked: false, expiry_alert_days: 120 },
    { tenant_id: tenantId, name: 'Surgical Masks (Level 2)', sku: 'MSK-SURG-L2', manufacturer: 'Halyard', category: 'PPE', supplier_id: supplierMap['MedLine Industries'], unit_of_measure: 'box', cost: 6.00, price: 12.49, low_stock_threshold: 25, storage_requirement: 'room_temp' as const, is_lot_tracked: true, is_serial_tracked: false, expiry_alert_days: 365 },
    { tenant_id: tenantId, name: 'Digital Thermometer', sku: 'THERM-DIG', manufacturer: 'Welch Allyn', category: 'Diagnostics', supplier_id: supplierMap['Henry Schein'], unit_of_measure: 'each', cost: 12.00, price: 24.99, low_stock_threshold: 10, storage_requirement: 'room_temp' as const, is_lot_tracked: true, is_serial_tracked: true, expiry_alert_days: 365 },
    { tenant_id: tenantId, name: 'Pulse Oximeter', sku: 'OXI-PULSE', manufacturer: 'Nonin', category: 'Diagnostics', supplier_id: supplierMap['Henry Schein'], unit_of_measure: 'each', cost: 45.00, price: 89.99, low_stock_threshold: 5, storage_requirement: 'room_temp' as const, is_lot_tracked: true, is_serial_tracked: true, expiry_alert_days: 365 },
    { tenant_id: tenantId, name: 'Insulin Syringes U-100', sku: 'SYR-INS-U100', manufacturer: 'BD', category: 'Injection Supplies', supplier_id: supplierMap['Cardinal Health'], unit_of_measure: 'box', cost: 15.00, price: 28.99, low_stock_threshold: 20, storage_requirement: 'room_temp' as const, is_lot_tracked: true, is_serial_tracked: false, expiry_alert_days: 180 },
    { tenant_id: tenantId, name: 'Saline Solution 0.9% 1L', sku: 'SAL-09-1L', manufacturer: 'Baxter', category: 'IV Supplies', supplier_id: supplierMap['McKesson Medical'], unit_of_measure: 'bag', cost: 3.50, price: 7.99, low_stock_threshold: 30, storage_requirement: 'room_temp' as const, is_lot_tracked: true, is_serial_tracked: false, expiry_alert_days: 90 },
    { tenant_id: tenantId, name: 'Flu Vaccine (Quadrivalent)', sku: 'VAX-FLU-QUAD', manufacturer: 'Sanofi Pasteur', category: 'Vaccines', supplier_id: supplierMap['McKesson Medical'], unit_of_measure: 'dose', cost: 18.00, price: 35.00, low_stock_threshold: 50, storage_requirement: 'refrigerated' as const, is_lot_tracked: true, is_serial_tracked: false, expiry_alert_days: 60 },
    { tenant_id: tenantId, name: 'Tetanus Toxoid Vaccine', sku: 'VAX-TET', manufacturer: 'Pfizer', category: 'Vaccines', supplier_id: supplierMap['Cardinal Health'], unit_of_measure: 'dose', cost: 22.00, price: 45.00, low_stock_threshold: 20, storage_requirement: 'refrigerated' as const, is_lot_tracked: true, is_serial_tracked: false, expiry_alert_days: 60 },
    { tenant_id: tenantId, name: 'Frozen Plasma (FFP)', sku: 'BLD-FFP', manufacturer: 'Red Cross', category: 'Blood Products', supplier_id: supplierMap['McKesson Medical'], unit_of_measure: 'unit', cost: 55.00, price: 120.00, low_stock_threshold: 5, storage_requirement: 'frozen' as const, is_lot_tracked: true, is_serial_tracked: true, expiry_alert_days: 30 },
  ];

  const { data: productRows } = await supabase.from('products').insert(products).select();
  console.log(`Created ${productRows?.length} products`);
  const productMap: Record<string, typeof productRows[0]> = {};
  productRows?.forEach((p) => { productMap[p.sku] = p; });

  // ── Lots ──
  const today = new Date();
  const daysFromNow = (d: number) => {
    const dt = new Date(today);
    dt.setDate(dt.getDate() + d);
    return dt.toISOString().split('T')[0];
  };
  const daysAgo = (d: number) => daysFromNow(-d);

  const lots = [
    // Gloves — plenty of stock, various expirations
    { tenant_id: tenantId, product_id: productMap['GLV-NIT-M'].id, lot_number: 'GLV-2024-001', expiration_date: daysFromNow(180), quantity_on_hand: 100, received_date: daysAgo(60), supplier_id: supplierMap['MedLine Industries'], cost_at_receipt: 8.50, location: 'A1-01' },
    { tenant_id: tenantId, product_id: productMap['GLV-NIT-M'].id, lot_number: 'GLV-2024-002', expiration_date: daysFromNow(45), quantity_on_hand: 30, received_date: daysAgo(120), supplier_id: supplierMap['MedLine Industries'], cost_at_receipt: 8.25, location: 'A1-02' },
    { tenant_id: tenantId, product_id: productMap['GLV-NIT-L'].id, lot_number: 'GLV-2024-003', expiration_date: daysFromNow(200), quantity_on_hand: 80, received_date: daysAgo(30), supplier_id: supplierMap['MedLine Industries'], cost_at_receipt: 8.50, location: 'A1-03' },

    // Syringes
    { tenant_id: tenantId, product_id: productMap['SYR-3CC-22G'].id, lot_number: 'SYR-2024-100', expiration_date: daysFromNow(365), quantity_on_hand: 1000, received_date: daysAgo(45), supplier_id: supplierMap['Cardinal Health'], cost_at_receipt: 0.35, location: 'B2-01' },
    { tenant_id: tenantId, product_id: productMap['SYR-10CC-18G'].id, lot_number: 'SYR-2024-101', expiration_date: daysFromNow(300), quantity_on_hand: 500, received_date: daysAgo(30), supplier_id: supplierMap['Cardinal Health'], cost_at_receipt: 0.45, location: 'B2-02' },

    // Gauze — one lot expiring soon
    { tenant_id: tenantId, product_id: productMap['GAU-4X4-STR'].id, lot_number: 'GAU-2024-050', expiration_date: daysFromNow(15), quantity_on_hand: 25, received_date: daysAgo(90), supplier_id: supplierMap['McKesson Medical'], cost_at_receipt: 3.20, location: 'C1-01' },
    { tenant_id: tenantId, product_id: productMap['GAU-4X4-STR'].id, lot_number: 'GAU-2024-051', expiration_date: daysFromNow(250), quantity_on_hand: 60, received_date: daysAgo(15), supplier_id: supplierMap['McKesson Medical'], cost_at_receipt: 3.30, location: 'C1-02' },

    // Bandages
    { tenant_id: tenantId, product_id: productMap['BND-ASSORT'].id, lot_number: 'BND-2024-010', expiration_date: daysFromNow(400), quantity_on_hand: 50, received_date: daysAgo(20), supplier_id: supplierMap['McKesson Medical'], cost_at_receipt: 4.10, location: 'C2-01' },

    // Alcohol pads
    { tenant_id: tenantId, product_id: productMap['ALC-PREP'].id, lot_number: 'ALC-2024-030', expiration_date: daysFromNow(60), quantity_on_hand: 40, received_date: daysAgo(60), supplier_id: supplierMap['Cardinal Health'], cost_at_receipt: 2.80, location: 'C3-01' },

    // Masks
    { tenant_id: tenantId, product_id: productMap['MSK-SURG-L2'].id, lot_number: 'MSK-2024-020', expiration_date: daysFromNow(500), quantity_on_hand: 45, received_date: daysAgo(30), supplier_id: supplierMap['MedLine Industries'], cost_at_receipt: 6.00, location: 'A2-01' },

    // Insulin syringes — low stock
    { tenant_id: tenantId, product_id: productMap['SYR-INS-U100'].id, lot_number: 'INS-2024-005', expiration_date: daysFromNow(150), quantity_on_hand: 8, received_date: daysAgo(90), supplier_id: supplierMap['Cardinal Health'], cost_at_receipt: 15.00, location: 'B3-01' },

    // Saline — expiring soon
    { tenant_id: tenantId, product_id: productMap['SAL-09-1L'].id, lot_number: 'SAL-2024-070', expiration_date: daysFromNow(20), quantity_on_hand: 15, received_date: daysAgo(100), supplier_id: supplierMap['McKesson Medical'], cost_at_receipt: 3.50, location: 'D1-01' },
    { tenant_id: tenantId, product_id: productMap['SAL-09-1L'].id, lot_number: 'SAL-2025-001', expiration_date: daysFromNow(300), quantity_on_hand: 50, received_date: daysAgo(5), supplier_id: supplierMap['McKesson Medical'], cost_at_receipt: 3.60, location: 'D1-02' },

    // Vaccines (refrigerated)
    { tenant_id: tenantId, product_id: productMap['VAX-FLU-QUAD'].id, lot_number: 'FLU-2025-A01', expiration_date: daysFromNow(75), quantity_on_hand: 100, received_date: daysAgo(10), supplier_id: supplierMap['McKesson Medical'], cost_at_receipt: 18.00, location: 'FRIDGE-01' },
    { tenant_id: tenantId, product_id: productMap['VAX-TET'].id, lot_number: 'TET-2025-B01', expiration_date: daysFromNow(180), quantity_on_hand: 30, received_date: daysAgo(15), supplier_id: supplierMap['Cardinal Health'], cost_at_receipt: 22.00, location: 'FRIDGE-02' },

    // Frozen plasma
    { tenant_id: tenantId, product_id: productMap['BLD-FFP'].id, lot_number: 'FFP-2025-X01', expiration_date: daysFromNow(25), quantity_on_hand: 8, received_date: daysAgo(5), supplier_id: supplierMap['McKesson Medical'], cost_at_receipt: 55.00, location: 'FREEZER-01' },
  ];

  const { data: lotRows } = await supabase.from('lots').insert(lots).select();
  console.log(`Created ${lotRows?.length} lots`);

  // ── Stock movements for receiving ──
  const movements = lotRows?.map((lot) => ({
    tenant_id: tenantId,
    product_id: lot.product_id,
    lot_id: lot.id,
    user_id: finalUserId,
    quantity: lot.quantity_on_hand,
    movement_type: 'receive' as const,
    reason: 'Initial inventory receipt',
    reference_number: lot.lot_number,
  })) || [];

  await supabase.from('stock_movements').insert(movements);
  console.log(`Created ${movements.length} stock movements`);

  // ── Serial numbers for tracked products ──
  const thermLot = lotRows?.find((l) => l.lot_number === 'SYR-2024-100'); // not right, need thermometer lot
  // Add thermometer and oximeter lots
  const { data: thermLotData } = await supabase.from('lots').insert({
    tenant_id: tenantId,
    product_id: productMap['THERM-DIG'].id,
    lot_number: 'THERM-2024-001',
    expiration_date: daysFromNow(730),
    quantity_on_hand: 10,
    received_date: daysAgo(20),
    supplier_id: supplierMap['Henry Schein'],
    cost_at_receipt: 12.00,
    location: 'E1-01',
  }).select().single();

  if (thermLotData) {
    await supabase.from('stock_movements').insert({
      tenant_id: tenantId,
      product_id: productMap['THERM-DIG'].id,
      lot_id: thermLotData.id,
      user_id: finalUserId,
      quantity: 10,
      movement_type: 'receive' as const,
      reason: 'Initial inventory receipt',
      reference_number: 'THERM-2024-001',
    });

    const serials = Array.from({ length: 10 }, (_, i) => ({
      tenant_id: tenantId,
      lot_id: thermLotData.id,
      product_id: productMap['THERM-DIG'].id,
      serial_number: `THERM-SN-${String(i + 1).padStart(4, '0')}`,
    }));
    await supabase.from('serial_numbers').insert(serials);
    console.log('Created 10 thermometer serial numbers');
  }

  console.log('\n✓ Seed complete!');
  console.log(`\nLogin credentials:\n  Email: ${demoEmail}\n  Password: ${demoPassword}`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
