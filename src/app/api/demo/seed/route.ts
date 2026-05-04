import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const DEMO_EMAIL = 'demo@phocas-wms.com';
const DEMO_PASSWORD = 'demo1234!';
const DEMO_TENANT_NAME = 'Apex Distribution Co.';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function uuid() {
  return crypto.randomUUID();
}

export async function POST() {
  try {
    const supabase = svc();

    // Check if demo user exists
    const { data: existingUsers } = await supabase
      .from('users')
      .select('id, tenant_id')
      .eq('email', DEMO_EMAIL)
      .limit(1);

    if (existingUsers && existingUsers.length > 0) {
      // Demo already exists — just return success
      return NextResponse.json({ status: 'ready', message: 'Demo already seeded' });
    }

    // ── Create demo tenant ──
    const tenantId = uuid();
    await supabase.from('tenants').insert({
      id: tenantId,
      name: DEMO_TENANT_NAME,
      slug: 'apex-distribution-demo',
      settings: {
        onboarding_completed: true,
        enabled_modules: {
          kitting: true,
          consignment: true,
          controlled_substances: true,
          dscsa_tracking: true,
        },
      },
    });

    // ── Create demo auth user ──
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });

    if (authErr || !authData.user) {
      return NextResponse.json({ error: authErr?.message || 'Failed to create demo user' }, { status: 500 });
    }

    const userId = authData.user.id;

    // ── Create user record ──
    await supabase.from('users').insert({
      id: userId,
      tenant_id: tenantId,
      email: DEMO_EMAIL,
      full_name: 'Demo Manager',
      role: 'admin',
      is_active: true,
    });

    // Create staff users
    const staffIds = [uuid(), uuid(), uuid()];
    const staffNames = ['Maria Santos', 'James Cooper', 'Lin Wei'];
    for (let i = 0; i < 3; i++) {
      const { data: staffAuth } = await supabase.auth.admin.createUser({
        email: `staff${i + 1}@${tenantId.slice(0, 8)}.wms.local`,
        password: 'staff1234!',
        email_confirm: true,
      });
      if (staffAuth?.user) {
        staffIds[i] = staffAuth.user.id;
        await supabase.from('users').insert({
          id: staffIds[i],
          tenant_id: tenantId,
          email: `staff${i + 1}@${tenantId.slice(0, 8)}.wms.local`,
          full_name: staffNames[i],
          role: i === 0 ? 'manager' : 'staff',
          is_active: true,
        });
      }
    }

    // ── Suppliers ──
    const supplierIds = [uuid(), uuid(), uuid()];
    const suppliers = [
      { id: supplierIds[0], name: 'Global Packaging Inc.', contact_name: 'Sarah Johnson', email: 'orders@globalpack.com', phone: '555-0101' },
      { id: supplierIds[1], name: 'MedSupply Direct', contact_name: 'Tom Richards', email: 'sales@medsupply.com', phone: '555-0202' },
      { id: supplierIds[2], name: 'FreshSource Wholesale', contact_name: 'Amy Chen', email: 'orders@freshsource.com', phone: '555-0303' },
    ];
    await supabase.from('suppliers').insert(suppliers.map((s) => ({ ...s, tenant_id: tenantId })));

    // ── Customers ──
    const customerIds = [uuid(), uuid(), uuid(), uuid()];
    const customers = [
      { id: customerIds[0], name: 'Metro Hospital Group', contact_name: 'Dr. Williams', email: 'purchasing@metrohospital.com', phone: '555-1001' },
      { id: customerIds[1], name: 'Quick Stop Pharmacy', contact_name: 'Mike Lee', email: 'orders@quickstop.com', phone: '555-1002' },
      { id: customerIds[2], name: 'City Grocery Chain', contact_name: 'Jenny Park', email: 'supply@citygrocery.com', phone: '555-1003' },
      { id: customerIds[3], name: 'EcoClean Distributors', contact_name: 'Pat Green', email: 'orders@ecoclean.com', phone: '555-1004' },
    ];
    await supabase.from('customers').insert(customers.map((c) => ({ ...c, tenant_id: tenantId })));

    // ── Locations ──
    const locIds = [uuid(), uuid(), uuid()];
    await supabase.from('locations').insert([
      { id: locIds[0], tenant_id: tenantId, name: 'Main Warehouse', code: 'WH-A', type: 'warehouse', is_active: true },
      { id: locIds[1], tenant_id: tenantId, name: 'Cold Storage', code: 'COLD-1', type: 'cold_storage', is_active: true },
      { id: locIds[2], tenant_id: tenantId, name: 'Overflow Area', code: 'OVF-1', type: 'overflow', is_active: true },
    ]);

    // ── Products (20 realistic items) ──
    const products = [
      { name: 'Nitrile Exam Gloves (M)', sku: 'GLV-NIT-M', category: 'PPE', cost: 8.50, price: 14.99, low_stock_threshold: 50, unit_of_measure: 'box', is_lot_tracked: true, aisle: '3', section: 'A' },
      { name: 'Hand Sanitizer 8oz', sku: 'SAN-HS-8', category: 'Hygiene', cost: 2.10, price: 4.99, low_stock_threshold: 100, unit_of_measure: 'each', is_lot_tracked: true, aisle: '3', section: 'B' },
      { name: 'Surgical Masks (50pk)', sku: 'MSK-SUR-50', category: 'PPE', cost: 6.00, price: 12.99, low_stock_threshold: 80, unit_of_measure: 'box', is_lot_tracked: true, aisle: '3', section: 'A' },
      { name: 'Disinfectant Wipes', sku: 'CLN-DW-80', category: 'Cleaning', cost: 3.50, price: 7.99, low_stock_threshold: 60, unit_of_measure: 'canister', is_lot_tracked: true, aisle: '4', section: 'C' },
      { name: 'Bandage Rolls 4"', sku: 'BND-RL-4', category: 'First Aid', cost: 1.80, price: 4.49, low_stock_threshold: 200, unit_of_measure: 'each', is_lot_tracked: true, aisle: '5', section: 'A' },
      { name: 'Isopropyl Alcohol 16oz', sku: 'CHM-IPA-16', category: 'Chemicals', cost: 3.20, price: 6.99, low_stock_threshold: 40, unit_of_measure: 'bottle', is_lot_tracked: true, aisle: '6', section: 'B' },
      { name: 'Toilet Paper 12-Roll', sku: 'PPR-TP-12', category: 'Paper Goods', cost: 5.50, price: 11.99, low_stock_threshold: 100, unit_of_measure: 'pack', is_lot_tracked: false, aisle: '1', section: 'A' },
      { name: 'Paper Towels Jumbo', sku: 'PPR-PT-JMB', category: 'Paper Goods', cost: 3.00, price: 6.99, low_stock_threshold: 80, unit_of_measure: 'roll', is_lot_tracked: false, aisle: '1', section: 'B' },
      { name: 'All-Purpose Cleaner 1gal', sku: 'CLN-APC-1G', category: 'Cleaning', cost: 4.50, price: 9.99, low_stock_threshold: 30, unit_of_measure: 'gallon', is_lot_tracked: false, aisle: '4', section: 'A' },
      { name: 'Latex-Free Bandages', sku: 'BND-LF-100', category: 'First Aid', cost: 2.50, price: 5.99, low_stock_threshold: 150, unit_of_measure: 'box', is_lot_tracked: true, aisle: '5', section: 'B' },
      { name: 'Disposable Gowns (L)', sku: 'PPE-GWN-L', category: 'PPE', cost: 12.00, price: 24.99, low_stock_threshold: 25, unit_of_measure: 'each', is_lot_tracked: true, aisle: '3', section: 'C' },
      { name: 'Saline Solution 500ml', sku: 'MED-SAL-500', category: 'Medical', cost: 1.50, price: 3.99, low_stock_threshold: 200, unit_of_measure: 'bottle', is_lot_tracked: true, expiry_alert_days: 90, aisle: '7', section: 'A' },
      { name: 'Hydrogen Peroxide 16oz', sku: 'CHM-HP-16', category: 'Chemicals', cost: 1.80, price: 3.49, low_stock_threshold: 60, unit_of_measure: 'bottle', is_lot_tracked: true, aisle: '6', section: 'A' },
      { name: 'Trash Bags 33gal (100ct)', sku: 'CLN-TB-33', category: 'Cleaning', cost: 8.00, price: 16.99, low_stock_threshold: 20, unit_of_measure: 'box', is_lot_tracked: false, aisle: '2', section: 'A' },
      { name: 'Face Shield', sku: 'PPE-FS-01', category: 'PPE', cost: 3.50, price: 7.99, low_stock_threshold: 50, unit_of_measure: 'each', is_lot_tracked: false, aisle: '3', section: 'D' },
      { name: 'Thermometer Digital', sku: 'MED-THERM-D', category: 'Medical', cost: 8.00, price: 15.99, low_stock_threshold: 30, unit_of_measure: 'each', is_lot_tracked: false, aisle: '7', section: 'B' },
      { name: 'Bleach 1gal', sku: 'CLN-BLC-1G', category: 'Cleaning', cost: 2.50, price: 5.49, low_stock_threshold: 40, unit_of_measure: 'gallon', is_lot_tracked: false, aisle: '4', section: 'B' },
      { name: 'Gauze Pads 4x4 (200ct)', sku: 'BND-GP-4X4', category: 'First Aid', cost: 6.00, price: 12.99, low_stock_threshold: 100, unit_of_measure: 'box', is_lot_tracked: true, aisle: '5', section: 'C' },
      { name: 'Sharps Container 1qt', sku: 'MED-SHP-1Q', category: 'Medical', cost: 4.00, price: 8.99, low_stock_threshold: 50, unit_of_measure: 'each', is_lot_tracked: false, aisle: '7', section: 'C' },
      { name: 'Cold Pack Instant', sku: 'FA-CP-INST', category: 'First Aid', cost: 0.80, price: 2.49, low_stock_threshold: 100, unit_of_measure: 'each', is_lot_tracked: true, aisle: '5', section: 'D' },
    ];

    const productIds: string[] = [];
    for (const p of products) {
      const id = uuid();
      productIds.push(id);
      await supabase.from('products').insert({
        id,
        tenant_id: tenantId,
        supplier_id: supplierIds[Math.floor(Math.random() * 3)],
        storage_requirement: 'room_temp',
        is_serial_tracked: false,
        expiry_alert_days: p.expiry_alert_days || 60,
        lead_time_days: Math.floor(Math.random() * 10) + 3,
        reorder_point: Math.floor(p.low_stock_threshold * 1.5),
        reorder_quantity: Math.floor(p.low_stock_threshold * 3),
        ...p,
      });
    }

    // ── Bins ──
    const binIds: string[] = [];
    const binCodes = ['A-01-01', 'A-01-02', 'A-02-01', 'A-02-02', 'B-01-01', 'B-01-02', 'B-02-01', 'B-02-02', 'C-01-01', 'C-01-02', 'RECV-01', 'RECV-02', 'SHIP-01', 'SHIP-02', 'QC-01'];
    for (const code of binCodes) {
      const id = uuid();
      binIds.push(id);
      const binType = code.startsWith('RECV') ? 'receiving' : code.startsWith('SHIP') ? 'shipping' : code.startsWith('QC') ? 'quarantine' : 'pick';
      await supabase.from('bins').insert({
        id,
        tenant_id: tenantId,
        bin_code: code,
        bin_type: binType,
        location_id: locIds[0],
        zone: code.charAt(0),
        is_active: true,
      });
    }

    // ── Lots + bin inventory ──
    const now = new Date();
    for (let i = 0; i < productIds.length; i++) {
      if (!products[i].is_lot_tracked && Math.random() > 0.3) continue;

      const lotCount = Math.floor(Math.random() * 3) + 1;
      for (let j = 0; j < lotCount; j++) {
        const qty = Math.floor(Math.random() * 200) + 10;
        const expDate = new Date(now);
        expDate.setDate(expDate.getDate() + Math.floor(Math.random() * 365) + 30);
        const lotId = uuid();

        await supabase.from('lots').insert({
          id: lotId,
          tenant_id: tenantId,
          product_id: productIds[i],
          lot_number: `LOT-${String(i + 1).padStart(3, '0')}-${String(j + 1).padStart(2, '0')}`,
          quantity_on_hand: qty,
          received_date: new Date(now.getTime() - Math.random() * 90 * 86400000).toISOString(),
          cost_at_receipt: products[i].cost,
          expiration_date: products[i].is_lot_tracked ? expDate.toISOString() : null,
          location_id: locIds[0],
          status: 'active',
        });

        // Put some in bins
        const binIdx = Math.floor(Math.random() * 10);
        if (binIds[binIdx]) {
          await supabase.from('bin_inventory').insert({
            tenant_id: tenantId,
            bin_id: binIds[binIdx],
            product_id: productIds[i],
            lot_id: lotId,
            quantity: Math.floor(qty * 0.5),
          });
        }
      }
    }

    // ── Stock movements (recent activity) ──
    const movementTypes = ['receive', 'ship', 'adjust', 'return'] as const;
    for (let i = 0; i < 30; i++) {
      const daysAgo = Math.floor(Math.random() * 30);
      const pIdx = Math.floor(Math.random() * productIds.length);
      const mType = movementTypes[Math.floor(Math.random() * movementTypes.length)];
      const qty = mType === 'ship' ? -(Math.floor(Math.random() * 20) + 1) : Math.floor(Math.random() * 50) + 5;

      await supabase.from('stock_movements').insert({
        tenant_id: tenantId,
        product_id: productIds[pIdx],
        user_id: userId,
        quantity: qty,
        movement_type: mType,
        reason: mType === 'receive' ? 'PO receipt' : mType === 'ship' ? 'Customer order' : mType === 'return' ? 'Customer return' : 'Cycle count adjustment',
        reference_number: `${mType.toUpperCase()}-${String(1000 + i)}`,
        created_at: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
      });
    }

    // ── Scan tasks ──
    const taskTypes = ['pick', 'putaway', 'replenish', 'cycle_count', 'verify_stock'] as const;
    for (let i = 0; i < 8; i++) {
      const tType = taskTypes[Math.floor(Math.random() * taskTypes.length)];
      await supabase.from('scan_tasks').insert({
        tenant_id: tenantId,
        task_type: tType,
        title: `${tType.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())} — ${binCodes[Math.floor(Math.random() * 10)]}`,
        status: i < 3 ? 'assigned' : 'pending',
        assigned_to: i < 3 ? staffIds[Math.floor(Math.random() * 3)] : null,
        assigned_by: userId,
        priority: Math.floor(Math.random() * 8) + 2,
        bin_id: binIds[Math.floor(Math.random() * 10)],
        product_id: productIds[Math.floor(Math.random() * productIds.length)],
      });
    }

    // ── Promotions ──
    const promoStart = new Date(now);
    promoStart.setDate(promoStart.getDate() - 3);
    const promoEnd = new Date(now);
    promoEnd.setDate(promoEnd.getDate() + 14);

    await supabase.from('promotions').insert([
      {
        tenant_id: tenantId,
        product_id: productIds[0],
        name: 'Spring PPE Sale',
        sale_price: 11.99,
        original_price: 14.99,
        start_date: promoStart.toISOString(),
        end_date: promoEnd.toISOString(),
        status: 'active',
        created_by: userId,
      },
      {
        tenant_id: tenantId,
        product_id: productIds[6],
        name: 'Bulk Paper Goods Clearance',
        sale_price: 8.99,
        original_price: 11.99,
        start_date: promoStart.toISOString(),
        end_date: promoEnd.toISOString(),
        status: 'active',
        created_by: userId,
      },
    ]);

    // ── Purchase Orders ──
    for (let i = 0; i < 3; i++) {
      await supabase.from('purchase_orders').insert({
        tenant_id: tenantId,
        po_number: `PO-${2026}-${String(100 + i)}`,
        supplier_id: supplierIds[i],
        status: i === 0 ? 'sent' : i === 1 ? 'partial' : 'received',
        expected_date: new Date(now.getTime() + (i - 1) * 7 * 86400000).toISOString(),
        created_by: userId,
        notes: `Regular restock order #${i + 1}`,
      });
    }

    return NextResponse.json({
      status: 'seeded',
      message: 'Demo data created successfully',
      tenant: DEMO_TENANT_NAME,
      login: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
      stats: {
        products: products.length,
        suppliers: suppliers.length,
        customers: customers.length,
        bins: binCodes.length,
        staff: 3,
      },
    });
  } catch (err) {
    console.error('Demo seed error:', err);
    return NextResponse.json({ error: 'Failed to seed demo data' }, { status: 500 });
  }
}
