import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ── Demo credentials for each role ──
const DEMO_USERS = {
  manager: { email: 'demo@phocas-wms.com', password: 'demo1234!', name: 'Alex Morgan', role: 'admin' },
  associate: { email: 'associate@phocas-wms.com', password: 'demo1234!', name: 'Maria Santos', role: 'staff' },
  cashier: { email: 'cashier@phocas-wms.com', password: 'demo1234!', name: 'James Cooper', role: 'staff' },
  customer: { email: 'buyer@metrogrocery.com', password: 'demo1234!', name: 'Metro Grocery Purchasing', role: 'customer' },
};

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
function uid() { return crypto.randomUUID(); }
function days(n: number) { return new Date(Date.now() + n * 86400000).toISOString(); }
function ago(n: number) { return new Date(Date.now() - n * 86400000).toISOString(); }
function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function rand(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }

export async function POST() {
  try {
    const supabase = svc();

    // Check if demo is fully seeded
    const { data: ex } = await supabase.from('users').select('id, tenant_id').eq('email', DEMO_USERS.manager.email).limit(1);

    if (ex && ex.length > 0) {
      const tid = ex[0].tenant_id;
      const [lotR, binR, biR, taskR] = await Promise.all([
        supabase.from('lots').select('*', { count: 'exact', head: true }).eq('tenant_id', tid),
        supabase.from('bins').select('*', { count: 'exact', head: true }).eq('tenant_id', tid),
        supabase.from('bin_inventory').select('*', { count: 'exact', head: true }).eq('tenant_id', tid),
        supabase.from('scan_tasks').select('*', { count: 'exact', head: true }).eq('tenant_id', tid),
      ]);
      if (lotR.count && lotR.count >= 20 && binR.count && binR.count >= 10 && biR.count && biR.count >= 10 && taskR.count && taskR.count >= 5) {
        return NextResponse.json({ status: 'ready' });
      }
      // Incomplete — add missing data
      return await seedInventory(supabase, tid, ex[0].id);
    }

    // ── Create tenant ──
    const T = uid();
    await supabase.from('tenants').insert({
      id: T, name: 'Apex Distribution Co.', slug: 'apex-demo-' + Date.now().toString(36),
      settings: { onboarding_completed: true, enabled_modules: { kitting: true, consignment: true, controlled_substances: true, dscsa_tracking: true } },
    });

    // ── Create auth users for each role ──
    const userIds: Record<string, string> = {};
    for (const [key, u] of Object.entries(DEMO_USERS)) {
      if (key === 'customer') continue; // customer is not a WMS user
      const { data } = await supabase.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true });
      if (data?.user) {
        userIds[key] = data.user.id;
        await supabase.from('users').insert({
          id: data.user.id, tenant_id: T, email: u.email, full_name: u.name,
          role: u.role, is_active: true,
        });
      }
    }

    // Two more staff associates
    for (const name of ['Lin Wei', 'David Kim']) {
      const em = `${name.toLowerCase().replace(' ', '.')}@apex-demo.wms.local`;
      const { data } = await supabase.auth.admin.createUser({ email: em, password: 'staff1234!', email_confirm: true });
      if (data?.user) {
        await supabase.from('users').insert({ id: data.user.id, tenant_id: T, email: em, full_name: name, role: 'staff', is_active: true });
      }
    }

    // ── Customer portal user ──
    const cu = DEMO_USERS.customer;
    const { data: custAuth } = await supabase.auth.admin.createUser({ email: cu.email, password: cu.password, email_confirm: true });
    // Don't create a users record — portal matches by customer.email

    // ── Suppliers (4, no dupes) ──
    const supIds = [uid(), uid(), uid(), uid()];
    await supabase.from('suppliers').insert([
      { id: supIds[0], tenant_id: T, name: 'Global Packaging Inc.', contact_name: 'Sarah Johnson', email: 'orders@globalpack.com', phone: '555-0101', address: '1200 Industrial Blvd, Chicago IL' },
      { id: supIds[1], tenant_id: T, name: 'MedSupply Direct', contact_name: 'Tom Richards', email: 'sales@medsupply.com', phone: '555-0202', address: '890 Commerce Dr, Atlanta GA' },
      { id: supIds[2], tenant_id: T, name: 'FreshSource Wholesale', contact_name: 'Amy Chen', email: 'orders@freshsource.com', phone: '555-0303', address: '456 Market St, San Francisco CA' },
      { id: supIds[3], tenant_id: T, name: 'CleanPro Distributors', contact_name: 'Mark Davis', email: 'supply@cleanpro.com', phone: '555-0404', address: '2100 Warehouse Way, Dallas TX' },
    ]);

    // ── Customers (including portal demo customer) ──
    const custIds = [uid(), uid(), uid(), uid(), uid()];
    await supabase.from('customers').insert([
      { id: custIds[0], tenant_id: T, name: 'Metro Grocery', contact_name: 'Jenny Park', email: cu.email, phone: '555-1001', ship_to_address: '800 Retail Ave, Suite 200' },
      { id: custIds[1], tenant_id: T, name: 'City Hospital Group', contact_name: 'Dr. Williams', email: 'purchasing@cityhospital.com', phone: '555-1002', ship_to_address: '500 Medical Center Pkwy' },
      { id: custIds[2], tenant_id: T, name: 'Quick Stop Pharmacy', contact_name: 'Mike Lee', email: 'orders@quickstop.com', phone: '555-1003', ship_to_address: '123 Main St' },
      { id: custIds[3], tenant_id: T, name: 'EcoClean Services', contact_name: 'Pat Green', email: 'orders@ecoclean.com', phone: '555-1004', ship_to_address: '950 Service Rd' },
      { id: custIds[4], tenant_id: T, name: 'Summit Schools District', contact_name: 'Karen Walsh', email: 'facilities@summitschools.edu', phone: '555-1005', ship_to_address: '200 Education Ln' },
    ]);

    return await seedInventory(supabase, T, userIds.manager || '', supIds, custIds);
  } catch (err) {
    console.error('Demo seed error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedInventory(supabase: any, T: string, managerId: string, supIds?: string[], custIds?: string[]) {
  try {
    // Get existing reference data if not passed
    if (!supIds) {
      const { data } = await supabase.from('suppliers').select('id').eq('tenant_id', T);
      supIds = (data || []).map((s: { id: string }) => s.id);
    }
    if (!custIds) {
      const { data } = await supabase.from('customers').select('id').eq('tenant_id', T);
      custIds = (data || []).map((c: { id: string }) => c.id);
    }
    if (!managerId) {
      const { data } = await supabase.from('users').select('id').eq('tenant_id', T).eq('role', 'admin').limit(1);
      managerId = data?.[0]?.id || '';
    }

    const { data: staffData } = await supabase.from('users').select('id').eq('tenant_id', T).neq('role', 'admin');
    const staffIds = (staffData || []).map((u: { id: string }) => u.id);
    const allUserIds = [managerId, ...staffIds].filter(Boolean);

    // ── Locations ──
    const { data: existingLocs } = await supabase.from('locations').select('id').eq('tenant_id', T);
    let locIds: string[];
    if (existingLocs && existingLocs.length > 0) {
      locIds = existingLocs.map((l: { id: string }) => l.id);
    } else {
      locIds = [uid(), uid(), uid()];
      await supabase.from('locations').insert([
        { id: locIds[0], tenant_id: T, name: 'Main Warehouse', code: 'WH-A', is_active: true },
        { id: locIds[1], tenant_id: T, name: 'Cold Storage', code: 'COLD-1', is_active: true },
        { id: locIds[2], tenant_id: T, name: 'Overflow / Staging', code: 'STAGE-1', is_active: true },
      ]);
    }

    // ── Bins — PRIMARY (floor pick), SECONDARY (reserve/replen), BULK, STAGING ──
    const { data: existingBins } = await supabase.from('bins').select('id, bin_code, bin_type').eq('tenant_id', T);
    let bins: { id: string; bin_code: string; bin_type: string }[];
    if (existingBins && existingBins.length >= 10) {
      bins = existingBins;
    } else {
      const binDefs = [
        // Primary pick bins (floor stock — what customers/associates pick from)
        { code: 'A-01-01', type: 'primary' }, { code: 'A-01-02', type: 'primary' },
        { code: 'A-02-01', type: 'primary' }, { code: 'A-02-02', type: 'primary' },
        { code: 'B-01-01', type: 'primary' }, { code: 'B-01-02', type: 'primary' },
        { code: 'B-02-01', type: 'primary' }, { code: 'C-01-01', type: 'primary' },
        // Secondary reserve bins (replenishment source)
        { code: 'R-01-01', type: 'secondary' }, { code: 'R-01-02', type: 'secondary' },
        { code: 'R-02-01', type: 'secondary' }, { code: 'R-02-02', type: 'secondary' },
        // Bulk overstock
        { code: 'BLK-01', type: 'bulk' }, { code: 'BLK-02', type: 'bulk' },
        // Staging (receiving / shipping dock)
        { code: 'RECV-01', type: 'staging' }, { code: 'RECV-02', type: 'staging' },
        { code: 'SHIP-01', type: 'staging' }, { code: 'SHIP-02', type: 'staging' },
        // Returns processing
        { code: 'RET-01', type: 'returns' }, { code: 'RET-02', type: 'returns' },
      ];
      bins = binDefs.map((b) => ({ id: uid(), bin_code: b.code, bin_type: b.type }));
      await supabase.from('bins').insert(bins.map((b) => ({
        id: b.id, tenant_id: T, bin_code: b.bin_code, bin_type: b.bin_type,
        location_id: locIds[0], is_active: true,
      })));
    }

    const primaryBins = bins.filter((b) => b.bin_type === 'primary');
    const secondaryBins = bins.filter((b) => b.bin_type === 'secondary');

    // ── Products ──
    const { data: existingProds } = await supabase.from('products').select('id, sku, cost, price, is_lot_tracked, low_stock_threshold, name').eq('tenant_id', T);
    let products: { id: string; sku: string; cost: number; price: number; is_lot_tracked: boolean; low_stock_threshold: number; name: string }[];

    if (existingProds && existingProds.length >= 15) {
      products = existingProds;
    } else {
      // Insert missing products
      const prodDefs = [
        { name: 'Nitrile Exam Gloves (M)', sku: 'GLV-NIT-M', cat: 'PPE', cost: 8.50, price: 14.99, thresh: 50, uom: 'box', lot: true, a: '3', s: 'A' },
        { name: 'Hand Sanitizer 8oz', sku: 'SAN-HS-8', cat: 'Hygiene', cost: 2.10, price: 4.99, thresh: 100, uom: 'each', lot: true, a: '3', s: 'B' },
        { name: 'Surgical Masks 50pk', sku: 'MSK-SUR-50', cat: 'PPE', cost: 6.00, price: 12.99, thresh: 80, uom: 'box', lot: true, a: '3', s: 'C' },
        { name: 'Disinfectant Wipes 80ct', sku: 'CLN-DW-80', cat: 'Cleaning', cost: 3.50, price: 7.99, thresh: 60, uom: 'canister', lot: true, a: '4', s: 'C' },
        { name: 'Bandage Rolls 4"', sku: 'BND-RL-4', cat: 'First Aid', cost: 1.80, price: 4.49, thresh: 200, uom: 'each', lot: true, a: '5', s: 'A' },
        { name: 'Isopropyl Alcohol 16oz', sku: 'CHM-IPA-16', cat: 'Chemicals', cost: 3.20, price: 6.99, thresh: 40, uom: 'bottle', lot: true, a: '6', s: 'B' },
        { name: 'Toilet Paper 12-Roll', sku: 'PPR-TP-12', cat: 'Paper Goods', cost: 5.50, price: 11.99, thresh: 100, uom: 'pack', lot: false, a: '1', s: 'A' },
        { name: 'Paper Towels Jumbo', sku: 'PPR-PT-JMB', cat: 'Paper Goods', cost: 3.00, price: 6.99, thresh: 80, uom: 'roll', lot: false, a: '1', s: 'B' },
        { name: 'All-Purpose Cleaner 1gal', sku: 'CLN-APC-1G', cat: 'Cleaning', cost: 4.50, price: 9.99, thresh: 30, uom: 'gallon', lot: false, a: '4', s: 'A' },
        { name: 'Disposable Gowns (L)', sku: 'PPE-GWN-L', cat: 'PPE', cost: 12.00, price: 24.99, thresh: 25, uom: 'each', lot: true, a: '3', s: 'D' },
        { name: 'Saline Solution 500ml', sku: 'MED-SAL-500', cat: 'Medical', cost: 1.50, price: 3.99, thresh: 200, uom: 'bottle', lot: true, a: '7', s: 'A' },
        { name: 'Trash Bags 33gal 100ct', sku: 'CLN-TB-33', cat: 'Cleaning', cost: 8.00, price: 16.99, thresh: 20, uom: 'box', lot: false, a: '2', s: 'A' },
        { name: 'Digital Thermometer', sku: 'MED-THERM-D', cat: 'Medical', cost: 8.00, price: 15.99, thresh: 30, uom: 'each', lot: false, a: '7', s: 'B' },
        { name: 'N95 Respirator Mask', sku: 'PPE-N95-01', cat: 'PPE', cost: 2.50, price: 5.99, thresh: 200, uom: 'each', lot: true, a: '3', s: 'F' },
        { name: 'Gauze Pads 4x4 200ct', sku: 'BND-GP-4X4', cat: 'First Aid', cost: 6.00, price: 12.99, thresh: 100, uom: 'box', lot: true, a: '5', s: 'C' },
        { name: 'Bleach 1gal', sku: 'CLN-BLC-1G', cat: 'Cleaning', cost: 2.50, price: 5.49, thresh: 40, uom: 'gallon', lot: false, a: '4', s: 'B' },
        { name: 'Face Shield', sku: 'PPE-FS-01', cat: 'PPE', cost: 3.50, price: 7.99, thresh: 50, uom: 'each', lot: false, a: '3', s: 'E' },
        { name: 'Cold Pack Instant', sku: 'FA-CP-INST', cat: 'First Aid', cost: 0.80, price: 2.49, thresh: 100, uom: 'each', lot: true, a: '5', s: 'D' },
        { name: 'Sharps Container 1qt', sku: 'MED-SHP-1Q', cat: 'Medical', cost: 4.00, price: 8.99, thresh: 50, uom: 'each', lot: false, a: '7', s: 'C' },
        { name: 'Antibacterial Soap 1gal', sku: 'HYG-ABS-1G', cat: 'Hygiene', cost: 6.00, price: 12.99, thresh: 20, uom: 'gallon', lot: false, a: '3', s: 'G' },
      ];

      const existSKUs = new Set((existingProds || []).map((p: { sku: string }) => p.sku));
      const newProds = prodDefs.filter((p) => !existSKUs.has(p.sku));
      const insertedIds: string[] = [];

      if (newProds.length > 0) {
        const rows = newProds.map((p) => {
          const pid = uid();
          insertedIds.push(pid);
          return {
            id: pid, tenant_id: T, name: p.name, sku: p.sku, category: p.cat,
            cost: p.cost, price: p.price, low_stock_threshold: p.thresh,
            unit_of_measure: p.uom, is_lot_tracked: p.lot, is_serial_tracked: false,
            supplier_id: pick(supIds!), storage_requirement: 'room_temp',
            expiry_alert_days: 60, lead_time_days: rand(3, 14),
            reorder_point: Math.floor(p.thresh * 1.5), reorder_quantity: p.thresh * 3,
            par_level_min: p.thresh, par_level_max: p.thresh * 5,
            aisle: p.a, section: p.s,
          };
        });
        await supabase.from('products').insert(rows);
      }

      // Re-fetch all products
      const { data: allP } = await supabase.from('products').select('id, sku, cost, price, is_lot_tracked, low_stock_threshold, name').eq('tenant_id', T);
      products = allP || [];
    }

    // ── Lots (every product gets 2-3 lots with real quantities) ──
    const { count: existingLotCount } = await supabase.from('lots').select('*', { count: 'exact', head: true }).eq('tenant_id', T);
    const lotMap: Record<string, string[]> = {};

    if (!existingLotCount || existingLotCount < 10) {
      const lotRows = [];
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        lotMap[p.id] = [];
        const numLots = rand(2, 3);
        for (let j = 0; j < numLots; j++) {
          const lid = uid();
          lotMap[p.id].push(lid);
          // First 3 products: low stock for alerts
          const qty = i < 3 ? rand(3, 10) : rand(40, 350);
          // Expiration: some soon, some normal
          let exp: string | null = null;
          if (p.is_lot_tracked) {
            if (i < 2 && j === 0) exp = days(rand(5, 18)); // expiring very soon
            else if (i < 5 && j === 0) exp = days(rand(25, 55)); // somewhat soon
            else exp = days(rand(100, 500));
          }
          lotRows.push({
            id: lid, tenant_id: T, product_id: p.id,
            lot_number: `LOT-${String(i + 1).padStart(3, '0')}-${String(j + 1).padStart(2, '0')}`,
            quantity_on_hand: qty, received_date: ago(rand(5, 90)),
            cost_at_receipt: p.cost, expiration_date: exp, status: 'active',
          });
        }
      }
      // Batch insert lots
      for (let i = 0; i < lotRows.length; i += 15) {
        const { error } = await supabase.from('lots').insert(lotRows.slice(i, i + 15));
        if (error) console.error('Lot insert error:', error.message);
      }
    } else {
      // Build lot map from existing
      const { data: lots } = await supabase.from('lots').select('id, product_id').eq('tenant_id', T);
      (lots || []).forEach((l: { id: string; product_id: string }) => {
        if (!lotMap[l.product_id]) lotMap[l.product_id] = [];
        lotMap[l.product_id].push(l.id);
      });
    }

    // ── Bin Inventory — every product in a primary bin + some in secondary (reserve) ──
    const { count: existingBI } = await supabase.from('bin_inventory').select('*', { count: 'exact', head: true }).eq('tenant_id', T);
    if (!existingBI || existingBI < 10) {
      const biRows = [];
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const lots = lotMap[p.id] || [];
        const lotId = lots.length > 0 ? lots[0] : null;

        // Primary bin (floor pick location) — moderate qty
        biRows.push({
          tenant_id: T,
          bin_id: primaryBins[i % primaryBins.length].id,
          product_id: p.id,
          lot_id: lotId,
          quantity: i < 3 ? rand(2, 5) : rand(15, 80), // low stock items have low bin qty
        });

        // Secondary bin (reserve) — higher qty for replenishment
        if (secondaryBins.length > 0) {
          biRows.push({
            tenant_id: T,
            bin_id: secondaryBins[i % secondaryBins.length].id,
            product_id: p.id,
            lot_id: lots.length > 1 ? lots[1] : lotId,
            quantity: rand(50, 300),
          });
        }
      }
      for (let i = 0; i < biRows.length; i += 15) {
        const { error } = await supabase.from('bin_inventory').insert(biRows.slice(i, i + 15));
        if (error) console.error('Bin inventory insert error:', error.message);
      }
    }

    // ── Stock Movements (60+ recent, variety of types) ──
    const { count: existingMv } = await supabase.from('stock_movements').select('*', { count: 'exact', head: true }).eq('tenant_id', T);
    if (!existingMv || existingMv < 40) {
      const mvRows = [];
      for (let i = 0; i < 70; i++) {
        const p = pick(products);
        const mType = pick(['receive', 'ship', 'ship', 'ship', 'adjust', 'return']);
        const qty = mType === 'ship' ? -rand(1, 25) : mType === 'return' ? rand(1, 8) : rand(10, 100);
        mvRows.push({
          tenant_id: T, product_id: p.id, user_id: pick(allUserIds),
          quantity: qty, movement_type: mType,
          reason: mType === 'receive' ? 'PO receipt' : mType === 'ship' ? pick(['Customer order', 'Store transfer', 'Online order', 'Wholesale shipment']) : mType === 'return' ? 'Customer return' : 'Cycle count adjustment',
          reference_number: `${mType.toUpperCase()}-${String(3000 + i)}`,
          metadata: mType === 'ship' ? { channel: pick(['online', 'in_store', 'wholesale']) } : {},
          created_at: ago(rand(0, 60)),
        });
      }
      for (let i = 0; i < mvRows.length; i += 15) {
        await supabase.from('stock_movements').insert(mvRows.slice(i, i + 15));
      }
    }

    // ── Sales Orders (10 orders for portal customer to see) ──
    const { count: existingOrders } = await supabase.from('sales_orders').select('*', { count: 'exact', head: true }).eq('tenant_id', T);
    if (!existingOrders || existingOrders < 5) {
      const statuses = ['shipped', 'shipped', 'shipped', 'shipped', 'picking', 'confirmed', 'confirmed', 'draft', 'cancelled', 'shipped'];
      for (let i = 0; i < 10; i++) {
        const oid = uid();
        const cust = i < 4 ? custIds![0] : pick(custIds!); // First 4 orders for portal demo customer
        const st = statuses[i];
        await supabase.from('sales_orders').insert({
          id: oid, tenant_id: T, order_number: `SO-2026-${String(500 + i)}`,
          customer_id: cust, status: st,
          ship_date: st === 'shipped' ? ago(rand(1, 30)) : null,
          created_by: managerId,
        });
        // Order lines
        for (let l = 0; l < rand(2, 5); l++) {
          const p = pick(products);
          const qty = rand(5, 40);
          await supabase.from('sales_order_lines').insert({
            tenant_id: T, order_id: oid, product_id: p.id,
            quantity_ordered: qty, quantity_shipped: st === 'shipped' ? qty : 0,
            unit_price: p.price,
          });
        }
      }
    }

    // ── Purchase Orders ──
    const { count: existingPO } = await supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).eq('tenant_id', T);
    if (!existingPO || existingPO < 3) {
      const poSt = ['sent', 'partial', 'received', 'received', 'draft'];
      for (let i = 0; i < 5; i++) {
        await supabase.from('purchase_orders').insert({
          tenant_id: T, po_number: `PO-2026-${String(100 + i)}`,
          supplier_id: supIds![i % supIds!.length], status: poSt[i],
          expected_date: days(rand(-5, 14)), created_by: managerId,
        });
      }
    }

    // ── Scan Tasks (for scanner demo) ──
    const { count: existingTasks } = await supabase.from('scan_tasks').select('*', { count: 'exact', head: true }).eq('tenant_id', T);
    if (!existingTasks || existingTasks < 5) {
      const taskTypes = ['pick', 'putaway', 'replenish', 'cycle_count', 'verify_stock', 'bin_to_bin'];
      const taskSt = ['pending', 'pending', 'assigned', 'assigned', 'assigned', 'in_progress', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed'];
      for (let i = 0; i < 12; i++) {
        const tt = taskTypes[i % taskTypes.length];
        const st = taskSt[i];
        const assignee = st !== 'pending' && staffIds.length > 0 ? pick(staffIds) : null;
        await supabase.from('scan_tasks').insert({
          tenant_id: T, task_type: tt,
          title: `${tt.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} — ${pick(bins).bin_code}`,
          status: st, assigned_to: assignee, assigned_by: managerId,
          assigned_at: assignee ? ago(rand(0, 3)) : null,
          started_at: ['in_progress', 'completed'].includes(st) ? ago(rand(0, 2)) : null,
          completed_at: st === 'completed' ? ago(rand(0, 2)) : null,
          completed_by: st === 'completed' && assignee ? assignee : null,
          scanned_quantity: st === 'completed' ? rand(5, 50) : null,
          priority: rand(2, 9),
          bin_id: pick(bins).id, product_id: pick(products).id,
        });
      }
    }

    // ── Promotions ──
    const { count: existingPromos } = await supabase.from('promotions').select('*', { count: 'exact', head: true }).eq('tenant_id', T);
    if (!existingPromos || existingPromos < 2) {
      await supabase.from('promotions').insert([
        { tenant_id: T, product_id: products[0].id, name: 'Spring PPE Sale', sale_price: 11.99, original_price: 14.99, start_date: ago(3), end_date: days(14), status: 'active', created_by: managerId },
        { tenant_id: T, product_id: products[6].id, name: 'Bulk Paper Clearance', sale_price: 8.99, original_price: 11.99, start_date: ago(5), end_date: days(10), status: 'active', created_by: managerId },
        { tenant_id: T, product_id: products[1].id, name: 'Sanitizer BOGO', sale_price: 3.49, original_price: 4.99, start_date: ago(1), end_date: days(21), status: 'active', created_by: managerId },
        { tenant_id: T, product_id: products[13 % products.length].id, name: 'Summer N95 Promo', sale_price: 3.99, original_price: 5.99, start_date: days(7), end_date: days(30), status: 'scheduled', created_by: managerId },
      ]);
    }

    // ── Verify final counts ──
    const [pC, lC, bC, mC, biC] = await Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('tenant_id', T),
      supabase.from('lots').select('*', { count: 'exact', head: true }).eq('tenant_id', T),
      supabase.from('bins').select('*', { count: 'exact', head: true }).eq('tenant_id', T),
      supabase.from('stock_movements').select('*', { count: 'exact', head: true }).eq('tenant_id', T),
      supabase.from('bin_inventory').select('*', { count: 'exact', head: true }).eq('tenant_id', T),
    ]);

    return NextResponse.json({
      status: 'seeded',
      counts: { products: pC.count, lots: lC.count, bins: bC.count, movements: mC.count, bin_inventory: biC.count },
    });
  } catch (err) {
    console.error('Seed inventory error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
