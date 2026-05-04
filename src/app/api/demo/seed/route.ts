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

function id() { return crypto.randomUUID(); }
function days(n: number) { return new Date(Date.now() + n * 86400000).toISOString(); }
function ago(n: number) { return new Date(Date.now() - n * 86400000).toISOString(); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

export async function POST() {
  try {
    const supabase = svc();

    // Check if demo exists
    const { data: existing } = await supabase
      .from('users')
      .select('id, tenant_id')
      .eq('email', DEMO_EMAIL)
      .limit(1);

    if (existing && existing.length > 0) {
      // Already seeded — check if it has lots (data might be incomplete)
      const { count } = await supabase
        .from('lots')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', existing[0].tenant_id);

      if (count && count > 5) {
        return NextResponse.json({ status: 'ready', message: 'Demo data exists' });
      }

      // Data is incomplete — delete ALL data and reseed
      const tid = existing[0].tenant_id;
      // Clean up in strict FK dependency order — log errors
      const tables = [
        'scan_logs', 'scan_tasks', 'bin_inventory', 'promotions',
        'stock_movements', 'shipment_lines', 'shipments',
        'sales_order_lines', 'sales_orders', 'po_lines', 'purchase_orders',
        'serial_numbers', 'lots', 'bins', 'products', 'locations',
        'customers', 'suppliers',
      ];
      for (const table of tables) {
        const { error } = await supabase.from(table).delete().eq('tenant_id', tid);
        if (error) console.error(`Delete ${table}:`, error.message);
      }

      // Don't delete users/tenant — just reseed data
      return await seedData(supabase, tid, existing[0].id);
    }

    // ── Fresh setup: create tenant + users ──
    const tenantId = id();
    await supabase.from('tenants').insert({
      id: tenantId,
      name: DEMO_TENANT_NAME,
      slug: 'apex-demo-' + Date.now().toString(36),
      settings: {
        onboarding_completed: true,
        enabled_modules: { kitting: true, consignment: true, controlled_substances: true, dscsa_tracking: true },
      },
    });

    // Create demo auth user
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });

    if (authErr || !authData.user) {
      return NextResponse.json({ error: authErr?.message || 'Failed to create demo user' }, { status: 500 });
    }

    const userId = authData.user.id;
    await supabase.from('users').insert({
      id: userId, tenant_id: tenantId, email: DEMO_EMAIL,
      full_name: 'Demo Manager', role: 'admin', is_active: true,
    });

    // Staff users
    const staffNames = ['Maria Santos', 'James Cooper', 'Lin Wei', 'David Kim', 'Rachel Torres'];
    const staffIds: string[] = [];
    for (const name of staffNames) {
      const { data: sa } = await supabase.auth.admin.createUser({
        email: `${name.toLowerCase().replace(' ', '.')}@apex-demo.wms.local`,
        password: 'staff1234!',
        email_confirm: true,
      });
      if (sa?.user) {
        staffIds.push(sa.user.id);
        await supabase.from('users').insert({
          id: sa.user.id, tenant_id: tenantId,
          email: `${name.toLowerCase().replace(' ', '.')}@apex-demo.wms.local`,
          full_name: name,
          role: staffIds.length <= 2 ? 'manager' : 'staff',
          is_active: true,
        });
      }
    }

    return await seedData(supabase, tenantId, userId, staffIds);
  } catch (err) {
    console.error('Demo seed error:', err);
    return NextResponse.json({ error: 'Failed to seed demo data' }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedData(supabase: any, tenantId: string, userId: string, staffIds?: string[]) {
  try {
  const T = tenantId;

  // If no staffIds provided, fetch them
  if (!staffIds) {
    const { data: users } = await supabase.from('users').select('id').eq('tenant_id', T).neq('id', userId);
    staffIds = (users || []).map((u: { id: string }) => u.id);
  }

  // ── Suppliers ──
  const supIds = [id(), id(), id(), id()];
  await supabase.from('suppliers').insert([
    { id: supIds[0], tenant_id: T, name: 'Global Packaging Inc.', contact_name: 'Sarah Johnson', email: 'orders@globalpack.com', phone: '555-0101', address: '1200 Industrial Blvd, Chicago, IL 60601' },
    { id: supIds[1], tenant_id: T, name: 'MedSupply Direct', contact_name: 'Tom Richards', email: 'sales@medsupply.com', phone: '555-0202', address: '890 Commerce Dr, Atlanta, GA 30301' },
    { id: supIds[2], tenant_id: T, name: 'FreshSource Wholesale', contact_name: 'Amy Chen', email: 'orders@freshsource.com', phone: '555-0303', address: '456 Market St, San Francisco, CA 94102' },
    { id: supIds[3], tenant_id: T, name: 'CleanPro Distributors', contact_name: 'Mark Davis', email: 'supply@cleanpro.com', phone: '555-0404', address: '2100 Warehouse Way, Dallas, TX 75201' },
  ]);

  // ── Customers ──
  const custIds = [id(), id(), id(), id(), id()];
  await supabase.from('customers').insert([
    { id: custIds[0], tenant_id: T, name: 'Metro Hospital Group', contact_name: 'Dr. Williams', email: 'purchasing@metrohospital.com', phone: '555-1001', ship_to_address: '500 Medical Center Pkwy' },
    { id: custIds[1], tenant_id: T, name: 'Quick Stop Pharmacy', contact_name: 'Mike Lee', email: 'orders@quickstop.com', phone: '555-1002', ship_to_address: '123 Main St' },
    { id: custIds[2], tenant_id: T, name: 'City Grocery Chain', contact_name: 'Jenny Park', email: 'supply@citygrocery.com', phone: '555-1003', ship_to_address: '800 Retail Ave' },
    { id: custIds[3], tenant_id: T, name: 'EcoClean Services', contact_name: 'Pat Green', email: 'orders@ecoclean.com', phone: '555-1004', ship_to_address: '950 Service Rd' },
    { id: custIds[4], tenant_id: T, name: 'Summit Schools District', contact_name: 'Karen Walsh', email: 'facilities@summitschools.edu', phone: '555-1005', ship_to_address: '200 Education Ln' },
  ]);

  // ── Locations ──
  const locIds = [id(), id(), id()];
  await supabase.from('locations').insert([
    { id: locIds[0], tenant_id: T, name: 'Main Warehouse', code: 'WH-A', is_active: true },
    { id: locIds[1], tenant_id: T, name: 'Cold Storage', code: 'COLD-1', is_active: true },
    { id: locIds[2], tenant_id: T, name: 'Overflow / Staging', code: 'STAGE-1', is_active: true },
  ]);

  // ── Bins (20 bins) — bin_type enum: primary | secondary | bulk | staging | returns ──
  const binData = [
    'A-01-01', 'A-01-02', 'A-01-03', 'A-02-01', 'A-02-02', 'A-02-03',
    'B-01-01', 'B-01-02', 'B-02-01', 'B-02-02',
    'C-01-01', 'C-01-02', 'C-02-01',
    'RECV-01', 'RECV-02', 'RECV-03',
    'SHIP-01', 'SHIP-02',
    'QC-01', 'QC-02',
  ];
  const binIds: string[] = [];
  const binInserts = binData.map((code) => {
    const bid = id();
    binIds.push(bid);
    const bt = code.startsWith('RECV') ? 'staging' : code.startsWith('SHIP') ? 'staging' : code.startsWith('QC') ? 'returns' : code.startsWith('C') ? 'bulk' : code.startsWith('B') ? 'secondary' : 'primary';
    return { id: bid, tenant_id: T, bin_code: code, bin_type: bt, location_id: locIds[0], is_active: true };
  });
  const { error: binErr } = await supabase.from('bins').insert(binInserts);
  if (binErr) console.error('Bins insert error:', binErr.message);

  // ── Products (25 items with realistic data) ──
  const prods = [
    { name: 'Nitrile Exam Gloves (M)', sku: 'GLV-NIT-M', cat: 'PPE', cost: 8.50, price: 14.99, thresh: 50, uom: 'box', lot: true, aisle: '3', sec: 'A', img: 'https://images.unsplash.com/photo-1584483766114-2cea6facdf57?w=200&h=200&fit=crop' },
    { name: 'Nitrile Exam Gloves (L)', sku: 'GLV-NIT-L', cat: 'PPE', cost: 8.50, price: 14.99, thresh: 50, uom: 'box', lot: true, aisle: '3', sec: 'A', img: null },
    { name: 'Hand Sanitizer 8oz', sku: 'SAN-HS-8', cat: 'Hygiene', cost: 2.10, price: 4.99, thresh: 100, uom: 'each', lot: true, aisle: '3', sec: 'B', img: 'https://images.unsplash.com/photo-1584744982491-665216d95f8b?w=200&h=200&fit=crop' },
    { name: 'Surgical Masks 50pk', sku: 'MSK-SUR-50', cat: 'PPE', cost: 6.00, price: 12.99, thresh: 80, uom: 'box', lot: true, aisle: '3', sec: 'C', img: 'https://images.unsplash.com/photo-1586942593568-29361efed0a1?w=200&h=200&fit=crop' },
    { name: 'Disinfectant Wipes 80ct', sku: 'CLN-DW-80', cat: 'Cleaning', cost: 3.50, price: 7.99, thresh: 60, uom: 'canister', lot: true, aisle: '4', sec: 'C', img: null },
    { name: 'Bandage Rolls 4"', sku: 'BND-RL-4', cat: 'First Aid', cost: 1.80, price: 4.49, thresh: 200, uom: 'each', lot: true, aisle: '5', sec: 'A', img: null },
    { name: 'Isopropyl Alcohol 16oz', sku: 'CHM-IPA-16', cat: 'Chemicals', cost: 3.20, price: 6.99, thresh: 40, uom: 'bottle', lot: true, aisle: '6', sec: 'B', img: null },
    { name: 'Toilet Paper 12-Roll', sku: 'PPR-TP-12', cat: 'Paper Goods', cost: 5.50, price: 11.99, thresh: 100, uom: 'pack', lot: false, aisle: '1', sec: 'A', img: null },
    { name: 'Paper Towels Jumbo Roll', sku: 'PPR-PT-JMB', cat: 'Paper Goods', cost: 3.00, price: 6.99, thresh: 80, uom: 'roll', lot: false, aisle: '1', sec: 'B', img: null },
    { name: 'All-Purpose Cleaner 1gal', sku: 'CLN-APC-1G', cat: 'Cleaning', cost: 4.50, price: 9.99, thresh: 30, uom: 'gallon', lot: false, aisle: '4', sec: 'A', img: null },
    { name: 'Latex-Free Bandages 100ct', sku: 'BND-LF-100', cat: 'First Aid', cost: 2.50, price: 5.99, thresh: 150, uom: 'box', lot: true, aisle: '5', sec: 'B', img: null },
    { name: 'Disposable Gowns (L)', sku: 'PPE-GWN-L', cat: 'PPE', cost: 12.00, price: 24.99, thresh: 25, uom: 'each', lot: true, aisle: '3', sec: 'D', img: null },
    { name: 'Saline Solution 500ml', sku: 'MED-SAL-500', cat: 'Medical', cost: 1.50, price: 3.99, thresh: 200, uom: 'bottle', lot: true, aisle: '7', sec: 'A', img: null },
    { name: 'Hydrogen Peroxide 16oz', sku: 'CHM-HP-16', cat: 'Chemicals', cost: 1.80, price: 3.49, thresh: 60, uom: 'bottle', lot: true, aisle: '6', sec: 'A', img: null },
    { name: 'Trash Bags 33gal 100ct', sku: 'CLN-TB-33', cat: 'Cleaning', cost: 8.00, price: 16.99, thresh: 20, uom: 'box', lot: false, aisle: '2', sec: 'A', img: null },
    { name: 'Face Shield', sku: 'PPE-FS-01', cat: 'PPE', cost: 3.50, price: 7.99, thresh: 50, uom: 'each', lot: false, aisle: '3', sec: 'E', img: null },
    { name: 'Digital Thermometer', sku: 'MED-THERM-D', cat: 'Medical', cost: 8.00, price: 15.99, thresh: 30, uom: 'each', lot: false, aisle: '7', sec: 'B', img: null },
    { name: 'Bleach 1gal', sku: 'CLN-BLC-1G', cat: 'Cleaning', cost: 2.50, price: 5.49, thresh: 40, uom: 'gallon', lot: false, aisle: '4', sec: 'B', img: null },
    { name: 'Gauze Pads 4x4 200ct', sku: 'BND-GP-4X4', cat: 'First Aid', cost: 6.00, price: 12.99, thresh: 100, uom: 'box', lot: true, aisle: '5', sec: 'C', img: null },
    { name: 'Sharps Container 1qt', sku: 'MED-SHP-1Q', cat: 'Medical', cost: 4.00, price: 8.99, thresh: 50, uom: 'each', lot: false, aisle: '7', sec: 'C', img: null },
    { name: 'Cold Pack Instant', sku: 'FA-CP-INST', cat: 'First Aid', cost: 0.80, price: 2.49, thresh: 100, uom: 'each', lot: true, aisle: '5', sec: 'D', img: null },
    { name: 'Exam Table Paper 21"', sku: 'PPR-ETP-21', cat: 'Paper Goods', cost: 4.00, price: 8.99, thresh: 30, uom: 'roll', lot: false, aisle: '1', sec: 'C', img: null },
    { name: 'N95 Respirator Mask', sku: 'PPE-N95-01', cat: 'PPE', cost: 2.50, price: 5.99, thresh: 200, uom: 'each', lot: true, aisle: '3', sec: 'F', img: null },
    { name: 'Antibacterial Soap 1gal', sku: 'HYG-ABS-1G', cat: 'Hygiene', cost: 6.00, price: 12.99, thresh: 20, uom: 'gallon', lot: false, aisle: '3', sec: 'G', img: null },
    { name: 'Sterile Syringes 10ml 100pk', sku: 'MED-SYR-10', cat: 'Medical', cost: 15.00, price: 29.99, thresh: 40, uom: 'box', lot: true, aisle: '7', sec: 'D', img: null },
  ];

  const prodIds: string[] = [];
  const prodInserts = prods.map((p) => {
    const pid = id();
    prodIds.push(pid);
    return {
      id: pid, tenant_id: T, name: p.name, sku: p.sku, category: p.cat,
      cost: p.cost, price: p.price, low_stock_threshold: p.thresh,
      unit_of_measure: p.uom, is_lot_tracked: p.lot, is_serial_tracked: false,
      supplier_id: pick(supIds), storage_requirement: 'room_temp',
      expiry_alert_days: 60, lead_time_days: rand(3, 14),
      reorder_point: Math.floor(p.thresh * 1.5),
      reorder_quantity: p.thresh * 3,
      par_level_min: p.thresh,
      par_level_max: p.thresh * 5,
      aisle: p.aisle, section: p.sec,
      image_url: p.img,
    };
  });
  const { error: prodErr } = await supabase.from('products').insert(prodInserts);
  if (prodErr) console.error('Products insert error:', prodErr.message);

  // ── Lots (2-4 per product, with real quantities) ──
  // Make some products low stock, some expiring soon
  const lotInserts = [];
  const lotIds: string[] = [];
  const lotProductMap: Record<string, string[]> = {};
  for (let i = 0; i < prodIds.length; i++) {
    const numLots = rand(2, 4);
    lotProductMap[prodIds[i]] = [];
    for (let j = 0; j < numLots; j++) {
      const lid = id();
      lotIds.push(lid);
      lotProductMap[prodIds[i]].push(lid);
      // Make first 3 products low stock (small quantities)
      const qty = i < 3 ? rand(2, 8) : rand(30, 300);
      // Make some lots expire within 30 days, some within 60, rest 100+
      let expDate: string | null = null;
      if (prods[i].lot) {
        if (i < 2 && j === 0) expDate = days(rand(5, 20)); // expiring very soon
        else if (i < 5 && j === 0) expDate = days(rand(20, 60)); // expiring somewhat soon
        else expDate = days(rand(90, 400)); // normal
      }
      lotInserts.push({
        id: lid, tenant_id: T, product_id: prodIds[i],
        lot_number: `LOT-${String(i + 1).padStart(3, '0')}-${String(j + 1).padStart(2, '0')}`,
        quantity_on_hand: qty,
        received_date: ago(rand(5, 120)),
        cost_at_receipt: prods[i].cost,
        expiration_date: expDate,
        location_id: pick(locIds),
        status: 'active',
      });
    }
  }
  // Insert lots in batches
  for (let i = 0; i < lotInserts.length; i += 20) {
    const { error: lotErr } = await supabase.from('lots').insert(lotInserts.slice(i, i + 20));
    if (lotErr) console.error(`Lots batch ${i} error:`, lotErr.message);
  }

  // ── Bin Inventory (spread products across bins) ──
  const biInserts = [];
  const pickBins = binIds.slice(0, 13); // pick bins only
  for (let i = 0; i < prodIds.length; i++) {
    const numBins = rand(1, 3);
    const lotsForProd = lotProductMap[prodIds[i]] || [];
    for (let b = 0; b < numBins; b++) {
      biInserts.push({
        tenant_id: T,
        bin_id: pickBins[(i * 3 + b) % pickBins.length],
        product_id: prodIds[i],
        lot_id: lotsForProd.length > 0 ? pick(lotsForProd) : null,
        quantity: rand(10, 100),
      });
    }
  }
  for (let i = 0; i < biInserts.length; i += 20) {
    await supabase.from('bin_inventory').insert(biInserts.slice(i, i + 20));
  }

  // ── Stock Movements (60 recent movements) ──
  const mvInserts = [];
  const allUserIds = [userId, ...(staffIds || [])];
  const mvTypes: string[] = ['receive', 'ship', 'ship', 'ship', 'adjust', 'return'];
  for (let i = 0; i < 60; i++) {
    const pIdx = rand(0, prodIds.length - 1);
    const mType = pick(mvTypes);
    const qty = mType === 'ship' ? -rand(1, 30) : mType === 'return' ? rand(1, 10) : rand(5, 80);
    mvInserts.push({
      tenant_id: T, product_id: prodIds[pIdx],
      user_id: pick(allUserIds),
      quantity: qty,
      movement_type: mType,
      reason: mType === 'receive' ? 'PO receipt' : mType === 'ship' ? pick(['Customer order', 'Store transfer', 'Online order']) : mType === 'return' ? 'Customer return — good condition' : 'Cycle count adjustment',
      reference_number: `${mType.toUpperCase()}-${String(2000 + i)}`,
      metadata: mType === 'ship' ? { channel: pick(['online', 'in_store', 'wholesale']) } : {},
      created_at: ago(rand(0, 45)),
    });
  }
  for (let i = 0; i < mvInserts.length; i += 20) {
    await supabase.from('stock_movements').insert(mvInserts.slice(i, i + 20));
  }

  // ── Sales Orders (8 orders in various states) ──
  const orderStatuses = ['draft', 'confirmed', 'picking', 'shipped', 'shipped', 'shipped', 'shipped', 'cancelled'] as const;
  for (let i = 0; i < 8; i++) {
    const orderId = id();
    await supabase.from('sales_orders').insert({
      id: orderId, tenant_id: T,
      order_number: `SO-${2026}-${String(500 + i)}`,
      customer_id: pick(custIds),
      status: orderStatuses[i],
      ship_date: orderStatuses[i] === 'shipped' ? ago(rand(1, 20)) : null,
      created_by: userId,
      notes: i === 7 ? 'Cancelled — customer request' : null,
    });

    // Order lines
    const numLines = rand(1, 4);
    for (let l = 0; l < numLines; l++) {
      const pIdx = rand(0, prodIds.length - 1);
      const qty = rand(5, 50);
      await supabase.from('sales_order_lines').insert({
        tenant_id: T, order_id: orderId, product_id: prodIds[pIdx],
        quantity_ordered: qty,
        quantity_shipped: orderStatuses[i] === 'shipped' ? qty : 0,
        unit_price: prods[pIdx].price,
      });
    }
  }

  // ── Purchase Orders (5 POs) ──
  const poStatuses = ['draft', 'sent', 'partial', 'received', 'received'] as const;
  for (let i = 0; i < 5; i++) {
    await supabase.from('purchase_orders').insert({
      tenant_id: T,
      po_number: `PO-${2026}-${String(100 + i)}`,
      supplier_id: supIds[i % supIds.length],
      status: poStatuses[i],
      expected_date: days(rand(-5, 14)),
      created_by: userId,
      notes: `Restock order #${i + 1}`,
    });
  }

  // ── Scan Tasks (12 tasks, mix of states) ──
  const taskTypes = ['pick', 'putaway', 'replenish', 'cycle_count', 'verify_stock', 'bin_to_bin'] as const;
  const taskStatuses = ['pending', 'pending', 'assigned', 'assigned', 'in_progress', 'in_progress', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed'];
  for (let i = 0; i < 12; i++) {
    const tType = taskTypes[i % taskTypes.length];
    const status = taskStatuses[i];
    const assignee = status !== 'pending' && staffIds && staffIds.length > 0 ? pick(staffIds) : null;
    await supabase.from('scan_tasks').insert({
      tenant_id: T,
      task_type: tType,
      title: `${tType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} — ${pick(binData)}`,
      status,
      assigned_to: assignee,
      assigned_by: userId,
      assigned_at: assignee ? ago(rand(0, 3)) : null,
      started_at: ['in_progress', 'completed'].includes(status) ? ago(rand(0, 2)) : null,
      completed_at: status === 'completed' ? ago(rand(0, 2)) : null,
      completed_by: status === 'completed' && assignee ? assignee : null,
      scanned_quantity: status === 'completed' ? rand(5, 50) : null,
      priority: rand(2, 9),
      bin_id: pick(binIds),
      product_id: pick(prodIds),
    });
  }

  // ── Promotions (3 active, 1 scheduled, 1 ended) ──
  await supabase.from('promotions').insert([
    { tenant_id: T, product_id: prodIds[0], name: 'Spring PPE Sale', sale_price: 11.99, original_price: 14.99, start_date: ago(3), end_date: days(14), status: 'active', created_by: userId },
    { tenant_id: T, product_id: prodIds[7], name: 'Bulk Paper Goods Clearance', sale_price: 8.99, original_price: 11.99, start_date: ago(5), end_date: days(10), status: 'active', created_by: userId },
    { tenant_id: T, product_id: prodIds[2], name: 'Buy More Save More — Sanitizer', sale_price: 3.49, original_price: 4.99, start_date: ago(1), end_date: days(21), status: 'active', created_by: userId },
    { tenant_id: T, product_id: prodIds[22], name: 'Summer N95 Promo', sale_price: 3.99, original_price: 5.99, start_date: days(7), end_date: days(30), status: 'scheduled', created_by: userId },
    { tenant_id: T, product_id: prodIds[14], name: 'Last Month Trash Bag Deal', sale_price: 12.99, original_price: 16.99, start_date: ago(35), end_date: ago(5), status: 'ended', created_by: userId },
  ]);

  // Verify counts
  const { count: lotCount } = await supabase.from('lots').select('*', { count: 'exact', head: true }).eq('tenant_id', T);
  const { count: binCount } = await supabase.from('bins').select('*', { count: 'exact', head: true }).eq('tenant_id', T);
  const { count: prodCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('tenant_id', T);
  const { count: mvCount } = await supabase.from('stock_movements').select('*', { count: 'exact', head: true }).eq('tenant_id', T);

  return NextResponse.json({
    status: 'seeded',
    message: 'Demo data created',
    tenant: DEMO_TENANT_NAME,
    counts: { products: prodCount, lots: lotCount, bins: binCount, movements: mvCount },
  });
  } catch (seedErr) {
    console.error('Seed data error:', seedErr);
    return NextResponse.json({ error: 'Seed data partially failed — some data may be missing', detail: String(seedErr) }, { status: 500 });
  }
}
