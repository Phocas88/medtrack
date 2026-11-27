import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

let db: PGlite;
const admin = '10000000-0000-4000-8000-000000000001';
const manager = '10000000-0000-4000-8000-000000000002';
const staff = '10000000-0000-4000-8000-000000000003';
const other = '10000000-0000-4000-8000-000000000004';
let tenant: string, tenantB: string, product: string, customer: string;
async function login(id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
}
async function owner() { await db.exec('reset role'); }

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;
    grant usage on schema auth,public to authenticated,service_role,anon;
    alter default privileges in schema public grant all on tables to authenticated,service_role;
    grant execute on function auth.uid() to public;`);
  for (const file of readdirSync('supabase/migrations').sort()) {
    const sql = readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/create extension if not exists "uuid-ossp";/gi, '');
    await db.exec(sql);
  }
  await db.exec("update prelaunch_settings set signup_open=true");
  await db.query(`insert into auth.users values ($1,'admin@example.test','{"company_name":"Warehouse A","full_name":"Admin A"}'),
    ($2,'other@example.test','{"company_name":"Warehouse B","full_name":"Admin B"}')`, [admin, other]);
  tenant = (await db.query<{tenant_id: string}>('select tenant_id from users where id=$1',[admin])).rows[0].tenant_id;
  tenantB = (await db.query<{tenant_id: string}>('select tenant_id from users where id=$1',[other])).rows[0].tenant_id;
  await db.query(`insert into auth.users(id,email) values($1,'manager@example.test'),($2,'staff@example.test')`,[manager,staff]);
  await db.query(`insert into users(id,tenant_id,email,full_name,role) values($1,$3,'manager@example.test','Manager','manager'),($2,$3,'staff@example.test','Staff','staff')`,[manager,staff,tenant]);
  product = (await db.query<{id:string}>(`insert into products(tenant_id,name,sku) values($1,'Widget','SKU-1') returning id`,[tenant])).rows[0].id;
  customer = (await db.query<{id:string}>(`insert into customers(tenant_id,name) values($1,'Buyer') returning id`,[tenant])).rows[0].id;
});
afterAll(async () => { await db?.close(); });

describe('real PostgreSQL migrations and tenant boundaries', () => {
  it('provisions signup and trial in the same transaction', async () => {
    await owner();
    expect((await db.query('select * from tenant_billing where tenant_id=$1',[tenant])).rows).toHaveLength(1);
    await login(admin);
    expect((await db.query('select bootstrap_tenant($1,$2) as id',['Repeated','Admin'])).rows[0]).toEqual({id:tenant});
  });
  it('prevents managers promoting themselves', async () => {
    await login(manager);
    await expect(db.query("update users set role='admin' where id=$1",[manager])).rejects.toThrow('Administrator required');
  });
  it('prevents staff changing server-owned billing or tenant settings', async () => {
    await login(staff);
    await expect(db.query("update tenant_billing set status='active' where tenant_id=$1",[tenant])).rejects.toThrow();
    expect((await db.query('select id from tenants where id=$1',[tenantB])).rows).toHaveLength(0);
    expect((await db.query("update tenants set name='Stolen' where id=$1 returning id",[tenant])).rows).toHaveLength(0);
  });
  it('preserves integration state on an atomic public settings save', async () => {
    await owner();
    await db.query(`update tenants set settings='{"shopify":{"connected":true},"billing":{"status":"active"}}' where id=$1`,[tenant]);
    await login(admin);
    await db.query('select update_tenant_settings($1::jsonb,$2)',[JSON.stringify({address:'Warehouse street'}),'Warehouse A']);
    const settings = (await db.query<{settings:Record<string,unknown>}>('select settings from tenants where id=$1',[tenant])).rows[0].settings;
    expect(settings.shopify).toEqual({connected:true});
    await expect(db.query('select update_tenant_settings($1::jsonb)',[JSON.stringify({billing:{status:'active'}})])).rejects.toThrow('Unsupported settings');
  });
  it('rejects cross-tenant parent references', async () => {
    await owner();
    const supplier = (await db.query<{id:string}>('insert into suppliers(tenant_id,name) values($1,$2) returning id',[tenantB,'Other supplier'])).rows[0].id;
    await login(admin);
    await expect(db.query('update products set supplier_id=$1 where id=$2',[supplier,product])).rejects.toThrow('Related record belongs to another tenant');
  });
  it('revokes warehouse data access when a user is inactive', async () => {
    await owner();await db.query('update users set is_active=false where id=$1',[staff]);
    await login(staff);expect((await db.query('select * from products')).rows).toHaveLength(0);
    await owner();await db.query('update users set is_active=true where id=$1',[staff]);
  });
});

describe('atomic warehouse posting', () => {
  const receiveId='20000000-0000-4000-8000-000000000001';
  it('retries receipt without duplicating stock or movements', async () => {
    await login(admin);
    const receipt=JSON.stringify({product_id:product,quantity:10,lot_number:'LOT-ATOMIC',cost_at_receipt:2});
    const first=await db.query('select receive_inventory($1,$2::jsonb) as result',[receiveId,receipt]);
    const second=await db.query('select receive_inventory($1,$2::jsonb) as result',[receiveId,receipt]);
    expect(first.rows).toEqual(second.rows);
    expect((await db.query('select quantity_on_hand from lots where lot_number=$1',['LOT-ATOMIC'])).rows).toEqual([{quantity_on_hand:10}]);
    expect((await db.query("select id from stock_movements where reference_number='LOT-ATOMIC'")).rows).toHaveLength(1);
  });
  it('rolls back the order and all stock updates on insufficient stock', async () => {
    await login(admin);
    await expect(db.query('select ship_inventory($1,$2::jsonb)',['20000000-0000-4000-8000-000000000002',JSON.stringify({customer_id:customer,lines:[{product_id:product,quantity:11,unit_price:5}]})])).rejects.toThrow('Insufficient available stock');
    expect((await db.query('select quantity_on_hand from lots where lot_number=$1',['LOT-ATOMIC'])).rows).toEqual([{quantity_on_hand:10}]);
    expect((await db.query('select * from sales_orders')).rows).toHaveLength(0);
  });
  it('ships once, decrements stock, and replays the same result', async () => {
    await login(admin);
    const id='20000000-0000-4000-8000-000000000003';
    const payload=JSON.stringify({customer_id:customer,lines:[{product_id:product,quantity:3,unit_price:5}]});
    const a=await db.query('select ship_inventory($1,$2::jsonb) as result',[id,payload]);
    expect((await db.query('select ship_inventory($1,$2::jsonb) as result',[id,payload])).rows).toEqual(a.rows);
    expect((await db.query('select quantity_on_hand from lots where lot_number=$1',['LOT-ATOMIC'])).rows).toEqual([{quantity_on_hand:7}]);
  });
  it('blocks expired trials at the database operation boundary', async () => {
    await owner();await db.query("update tenant_billing set trial_ends_at=now()-interval '1 day' where tenant_id=$1",[tenant]);
    await login(admin);
    await expect(db.query('select receive_inventory($1,$2::jsonb)',['20000000-0000-4000-8000-000000000004',JSON.stringify({product_id:product,quantity:1,lot_number:'EXPIRED-TRIAL'})])).rejects.toThrow('active subscription');
    await owner();await db.query("update tenant_billing set trial_ends_at=now()+interval '14 days' where tenant_id=$1",[tenant]);
  });
});

describe('billing event protection', () => {
  it('does not expose the webhook writer to clients', async () => {
    await login(admin);
    await expect(db.query('select apply_billing_event($1,$2,$3,$4::jsonb)',['fake',1,tenant,'{}'])).rejects.toThrow('permission denied');
  });
  it('deduplicates and ignores older events atomically', async () => {
    await owner();
    const payload=JSON.stringify({plan:'starter',status:'active',stripe_customer_id:'cus_fixture',stripe_subscription_id:'sub_fixture',stripe_price_id:'price_fixture'});
    expect((await db.query('select apply_billing_event($1,$2,$3,$4::jsonb) as applied',['evt_fixture',100,tenant,payload])).rows[0]).toEqual({applied:true});
    expect((await db.query('select apply_billing_event($1,$2,$3,$4::jsonb) as applied',['evt_fixture',100,tenant,payload])).rows[0]).toEqual({applied:false});
    await db.query('select apply_billing_event($1,$2,$3,$4::jsonb)',['evt_old',99,tenant,JSON.stringify({...JSON.parse(payload),status:'canceled'})]);
    expect((await db.query('select status from tenant_billing where tenant_id=$1',[tenant])).rows[0]).toEqual({status:'active'});
  });
});


describe('Shopify imports and privacy', () => {
  it('does not allow browser clients to read credentials', async () => {
    await login(admin);
    await expect(db.query('select * from integration_credentials')).rejects.toThrow('permission denied');
    await expect(db.query('select * from tenant_api_keys')).rejects.toThrow('permission denied');
  });
  it('imports a complete order once without decrementing stock', async () => {
    await owner();
    await db.query('select save_shopify_connection($1,$2,$3,$4)',[tenant,'fixture.myshopify.com','iv:encrypted:tag','Fixture shop']);
    const order=JSON.stringify({id:123,customer:{email:'buyer@example.test',first_name:'Buyer'},line_items:[{sku:'SKU-1',quantity:2,price:'5.00'}]});
    const before=(await db.query('select quantity_on_hand from lots where lot_number=$1',['LOT-ATOMIC'])).rows;
    const a=await db.query('select import_shopify_order($1,$2::jsonb,$3) as id',[tenant,order,'shopify-event-1']);
    expect((await db.query('select import_shopify_order($1,$2::jsonb,$3) as id',[tenant,order,'shopify-event-1'])).rows).toEqual(a.rows);
    expect((await db.query('select quantity_on_hand from lots where lot_number=$1',['LOT-ATOMIC'])).rows).toEqual(before);
    expect((await db.query('select * from sales_order_lines where order_id=$1',[(a.rows[0] as {id:string}).id])).rows).toHaveLength(1);
  });
  it('rolls back imports with unmapped SKUs and allows retry', async () => {
    await owner();
    const order=JSON.stringify({id:124,customer:{email:'buyer@example.test'},line_items:[{sku:'UNMAPPED',quantity:1,price:'5'}]});
    await expect(db.query('select import_shopify_order($1,$2::jsonb,$3)',[tenant,order,'shopify-event-2'])).rejects.toThrow('map every order SKU');
    expect((await db.query("select * from sales_orders where order_number='SHOPIFY-124'")).rows).toHaveLength(0);
    expect((await db.query("select * from webhook_events where event_id='shopify-event-2'")).rows).toHaveLength(0);
  });
  it('redacts customer PII and erases the token on uninstall', async () => {
    await owner();
    await db.query('select process_shopify_privacy($1,$2,$3,$4,$5)',[tenant,'fixture.myshopify.com','customers/redact','privacy-event-1','buyer@example.test']);
    expect((await db.query("select * from customers where email='buyer@example.test'")).rows).toHaveLength(0);
    await db.query('select disconnect_shopify($1)',[tenant]);
    expect((await db.query("select encrypted_token,connected from integration_credentials where tenant_id=$1 and provider='shopify'",[tenant])).rows[0]).toEqual({encrypted_token:null,connected:false});
  });
});

describe('customer portal authorization and price integrity', () => {
  it('rejects uninvited accounts and ignores client prices', async () => {
    await owner();
    const buyer='10000000-0000-4000-8000-000000000005';
    await db.query("insert into auth.users(id,email) values($1,'portal@example.test')",[buyer]);
    const buyerCustomer=(await db.query<{id:string}>("insert into customers(tenant_id,name,email) values($1,'Portal Buyer','portal@example.test') returning id",[tenant])).rows[0].id;
    await login(buyer);
    await expect(db.query('select portal_place_order($1,$2,$3::jsonb)',['30000000-0000-4000-8000-000000000001',buyerCustomer,JSON.stringify([{product_id:product,quantity:2,unit_price:0}])])).rejects.toThrow('Portal access required');
    await owner();await db.query('select grant_portal_access($1,$2)',[tenant,buyerCustomer]);await db.query('update products set price=7 where id=$1',[product]);
    await login(buyer);
    const placed=await db.query<{result:{order_id:string}}>('select portal_place_order($1,$2,$3::jsonb) as result',['30000000-0000-4000-8000-000000000001',buyerCustomer,JSON.stringify([{product_id:product,quantity:2,unit_price:0}])]);
    await owner();
    expect((await db.query('select unit_price from sales_order_lines where order_id=$1',[placed.rows[0].result.order_id])).rows[0]).toEqual({unit_price:'7.0000'});
  });
});


describe('staff cost protection', () => {
  it('hides raw costs while exposing a tenant-scoped scanner catalog', async () => {
    await login(staff);
    expect((await db.query('select cost from products')).rows).toHaveLength(0);
    expect((await db.query('select cost_at_receipt from lots')).rows).toHaveLength(0);
    const safe=(await db.query('select * from staff_products')).rows;
    expect(safe.length).toBeGreaterThan(0);
    expect(safe[0]).not.toHaveProperty('cost');
    expect((await db.query('select * from staff_lots')).rows[0]).not.toHaveProperty('cost_at_receipt');
    expect((await db.query('select * from staff_products where tenant_id=$1',[tenantB])).rows).toHaveLength(0);
    await expect(db.query("update users set access_level='full',role='admin' where id=$1",[staff])).rejects.toThrow();
  });
  it('keeps costs available to managers', async () => {
    await login(manager);
    expect((await db.query('select cost from products where id=$1',[product])).rows).toHaveLength(1);
  });
  it('blocks arbitrary staff inventory writes and finance RPCs', async () => {
    await login(staff);
    await expect(db.query('insert into lots(tenant_id,product_id,lot_number,quantity_on_hand) values($1,$2,$3,1)',[tenant,product,'STAFF-BYPASS'])).rejects.toThrow();
    await expect(db.query('select receive_inventory($1,$2::jsonb)',['40000000-0000-4000-8000-000000000001',JSON.stringify({product_id:product,quantity:1,lot_number:'STAFF-BYPASS'})])).rejects.toThrow('Manager required');
  });
});


describe('receiving, quarantine and floor-task posting', () => {
  it('receives a PO once and creates exactly one put-away task', async () => {
    await owner();
    const location=(await db.query<{id:string}>("insert into locations(tenant_id,name,code) values($1,'Receiving','RCV') returning id",[tenant])).rows[0].id;
    const supplier=(await db.query<{id:string}>("insert into suppliers(tenant_id,name) values($1,'Supplier') returning id",[tenant])).rows[0].id;
    const po=(await db.query<{id:string}>("insert into purchase_orders(tenant_id,po_number,supplier_id,status,created_by) values($1,'PO-TEST',$2,'approved',$3) returning id",[tenant,supplier,admin])).rows[0].id;
    const line=(await db.query<{id:string}>('insert into po_lines(tenant_id,po_id,product_id,quantity_ordered,unit_cost) values($1,$2,$3,4,2) returning id',[tenant,po,product])).rows[0].id;
    await login(manager);
    const args=['50000000-0000-4000-8000-000000000001',po,location,JSON.stringify([{po_line_id:line,quantity_to_receive:4,lot_number:'PO-LOT'}])];
    await db.query('select receive_purchase_order($1,$2,$3,$4::jsonb)',args);
    await db.query('select receive_purchase_order($1,$2,$3,$4::jsonb)',args);
    expect((await db.query("select quantity_on_hand from lots where lot_number='PO-LOT'")).rows).toEqual([{quantity_on_hand:4}]);
    expect((await db.query('select id from scan_tasks where product_id=$1',[product])).rows).toHaveLength(1);
    expect((await db.query('select status from purchase_orders where id=$1',[po])).rows[0]).toEqual({status:'received'});
  });
  it('does not let staff start another worker’s task', async () => {
    await owner();
    const task=(await db.query<{id:string}>('select id from scan_tasks where product_id=$1',[product])).rows[0].id;
    await db.query('update scan_tasks set assigned_to=$1 where id=$2',[manager,task]);
    await login(staff);await expect(db.query('select start_scan_task($1)',[task])).rejects.toThrow('not assigned');
    await owner();await db.query('update scan_tasks set assigned_to=$1 where id=$2',[staff,task]);
    const location=(await db.query<{id:string}>("select id from locations where code='RCV' and tenant_id=$1",[tenant])).rows[0].id;
    await db.query("insert into bins(tenant_id,location_id,bin_code) values($1,$2,'A-01')",[tenant,location]);
    await login(staff);await db.query('select start_scan_task($1)',[task]);
    await db.query('select complete_scan_task($1,$2,$3,$4,$5,$6::jsonb)',[task,4,null,null,'A-01','[{"value":"SKU-1"},{"value":"A-01"}]']);
    expect((await db.query('select quantity from bin_inventory where tenant_id=$1',[tenant])).rows).toEqual([{quantity:4}]);
    await db.query('select complete_scan_task($1,$2,$3,$4,$5,$6::jsonb)',[task,4,null,null,'A-01','[{"value":"A-01"}]']);
    expect((await db.query('select quantity from bin_inventory where tenant_id=$1',[tenant])).rows).toEqual([{quantity:4}]);
  });
  it('quarantine destruction updates both lot and bin stock once', async () => {
    await owner();
    const lot=(await db.query<{id:string}>("select id from lots where lot_number='PO-LOT'")).rows[0].id;
    const hold=(await db.query<{id:string}>("insert into quarantine_holds(tenant_id,lot_id,product_id,reason,quantity,held_by) values($1,$2,$3,'Damaged',2,$4) returning id",[tenant,lot,product,admin])).rows[0].id;
    await login(manager);await db.query('select resolve_quarantine($1,$2,$3)',[hold,'destroyed','Damaged goods confirmed']);
    await db.query('select resolve_quarantine($1,$2,$3)',[hold,'destroyed','Retry']);
    expect((await db.query('select quantity_on_hand from lots where id=$1',[lot])).rows[0]).toEqual({quantity_on_hand:2});
    expect((await db.query('select quantity from bin_inventory where lot_id=$1',[lot])).rows[0]).toEqual({quantity:2});
  });
});


describe('return, assembly and cash posting integrity', () => {
  it('posts incoming and outgoing returns in the correct direction once', async () => {
    await owner();
    const lot=(await db.query<{id:string}>("select id from lots where lot_number='PO-LOT'")).rows[0].id;
    const supplier=(await db.query<{id:string}>("select id from suppliers where tenant_id=$1 and name='Supplier'",[tenant])).rows[0].id;
    await login(manager);
    const outgoing=JSON.stringify({return_type:'supplier_rma',supplier_id:supplier,reason:'Vendor return',lines:[{product_id:product,lot_id:lot,quantity:1,disposition:'return_to_supplier'}]});
    await db.query('select process_return($1,$2::jsonb)',['60000000-0000-4000-8000-000000000001',outgoing]);
    expect((await db.query('select quantity_on_hand from lots where id=$1',[lot])).rows[0]).toEqual({quantity_on_hand:1});
    const incoming=JSON.stringify({return_type:'customer_return',customer_id:customer,reason:'Customer return',lines:[{product_id:product,lot_id:lot,quantity:2,disposition:'restock'}]});
    await db.query('select process_return($1,$2::jsonb)',['60000000-0000-4000-8000-000000000002',incoming]);
    await db.query('select process_return($1,$2::jsonb)',['60000000-0000-4000-8000-000000000002',incoming]);
    expect((await db.query('select quantity_on_hand from lots where id=$1',[lot])).rows[0]).toEqual({quantity_on_hand:3});
  });
  it('rolls back insufficient kit assembly and carries component cost into output', async () => {
    await owner();
    const kitProduct=(await db.query<{id:string}>("insert into products(tenant_id,name,sku) values($1,'Kit','KIT-TEST') returning id",[tenant])).rows[0].id;
    const kit=(await db.query<{id:string}>("insert into kits(tenant_id,product_id,name) values($1,$2,'Test kit') returning id",[tenant,kitProduct])).rows[0].id;
    await db.query('insert into kit_components(tenant_id,kit_id,component_product_id,quantity) values($1,$2,$3,2)',[tenant,kit,product]);
    await login(manager);
    const before=(await db.query('select sum(quantity_on_hand) as qty from lots where product_id=$1',[product])).rows;
    await expect(db.query('select assemble_kit($1,$2,$3,$4)',['60000000-0000-4000-8000-000000000003',kit,9999,'Test'])).rejects.toThrow('Insufficient available component stock');
    expect((await db.query('select sum(quantity_on_hand) as qty from lots where product_id=$1',[product])).rows).toEqual(before);
    await db.query('select assemble_kit($1,$2,$3,$4)',['60000000-0000-4000-8000-000000000004',kit,1,'Test']);
    const output=(await db.query<{quantity_on_hand:number,cost_at_receipt:string}>('select quantity_on_hand,cost_at_receipt from lots where product_id=$1',[kitProduct])).rows[0];
    expect(output.quantity_on_hand).toBe(1);expect(Number(output.cost_at_receipt)).toBe(4);
  });
  it('cash checkout uses catalog prices and decrements stock exactly once', async () => {
    await login(manager);
    const before=Number((await db.query<{qty:string}>('select sum(quantity_on_hand) as qty from lots where product_id=$1',[product])).rows[0].qty);
    const items=JSON.stringify([{lineType:'product',productId:product,quantity:1,unitPrice:0,discount:0}]);
    const args=['60000000-0000-4000-8000-000000000005',items,'Cash buyer',0,10];
    const sale=await db.query<{sale:{total:number,change:number}}>('select post_cash_sale($1,$2::jsonb,$3,$4,$5) as sale',args);
    expect(Number(sale.rows[0].sale.total)).toBe(7);expect(Number(sale.rows[0].sale.change)).toBe(3);
    await db.query('select post_cash_sale($1,$2::jsonb,$3,$4,$5)',args);
    expect(Number((await db.query<{qty:string}>('select sum(quantity_on_hand) as qty from lots where product_id=$1',[product])).rows[0].qty)).toBe(before-1);
  });
  it('enforces paid plan resource caps in SQL', async () => {
    await login(manager);
    await expect(db.query("insert into locations(tenant_id,name,code) values($1,'Extra warehouse','EXTRA')",[tenant])).rejects.toThrow('Plan limit reached');
  });
});


describe('partial transfer accounting', () => {
  it('removes dispatched stock from pickable inventory and receives cumulatively', async () => {
    await owner();await db.query("update tenant_billing set plan='professional' where tenant_id=$1",[tenant]);
    const source=(await db.query<{id:string}>("select id from locations where tenant_id=$1 and code='RCV'",[tenant])).rows[0].id;
    const destination=(await db.query<{id:string}>("insert into locations(tenant_id,name,code) values($1,'Destination','DST') returning id",[tenant])).rows[0].id;
    const sourceLot=(await db.query<{id:string}>('insert into lots(tenant_id,product_id,lot_number,quantity_on_hand,location_id,cost_at_receipt) values($1,$2,$3,5,$4,3) returning id',[tenant,product,'TRANSFER-BATCH',source])).rows[0].id;
    const transfer=(await db.query<{id:string}>("insert into transfers(tenant_id,transfer_number,from_location_id,to_location_id,initiated_by) values($1,'TR-TEST',$2,$3,$4) returning id",[tenant,source,destination,admin])).rows[0].id;
    const line=(await db.query<{id:string}>('insert into transfer_lines(tenant_id,transfer_id,product_id,lot_id,quantity) values($1,$2,$3,$4,2) returning id',[tenant,transfer,product,sourceLot])).rows[0].id;
    await login(manager);await db.query('select dispatch_transfer($1)',[transfer]);await db.query('select dispatch_transfer($1)',[transfer]);
    expect((await db.query('select quantity_on_hand from lots where id=$1',[sourceLot])).rows[0]).toEqual({quantity_on_hand:3});
    const receipt=JSON.stringify([{id:line,quantity_received:1}]);
    await db.query('select receive_transfer($1,$2::jsonb)',[transfer,receipt]);await db.query('select receive_transfer($1,$2::jsonb)',[transfer,receipt]);
    expect((await db.query("select quantity_on_hand from lots where lot_number='TRANSFER-BATCH' and location_id=$1",[destination])).rows[0]).toEqual({quantity_on_hand:1});
    expect((await db.query('select status from transfers where id=$1',[transfer])).rows[0]).toEqual({status:'in_transit'});
    await db.query('select receive_transfer($1,$2::jsonb)',[transfer,JSON.stringify([{id:line,quantity_received:2}])]);
    expect((await db.query('select status from transfers where id=$1',[transfer])).rows[0]).toEqual({status:'received'});
    expect((await db.query("select quantity_on_hand from lots where lot_number='TRANSFER-BATCH' and location_id=$1",[destination])).rows[0]).toEqual({quantity_on_hand:2});
  });
});


describe('fulfill existing orders', () => {
  it('uses stored quantities and reuses the existing order rather than creating a duplicate', async () => {
    await owner();
    const order=(await db.query<{id:string}>("insert into sales_orders(tenant_id,customer_id,order_number,status,created_by) values($1,$2,'EXISTING-FULFILL','confirmed',$3) returning id",[tenant,customer,admin])).rows[0].id;
    await db.query('insert into sales_order_lines(tenant_id,order_id,product_id,quantity_ordered,unit_price) values($1,$2,$3,2,7)',[tenant,order,product]);
    await login(manager);
    const before=Number((await db.query<{qty:string}>('select sum(quantity_on_hand) as qty from lots where product_id=$1',[product])).rows[0].qty);
    const payload=JSON.stringify({order_id:order,customer_id:customer,lines:[{product_id:product,quantity:999,unit_price:0}]});
    const result=await db.query<{result:{order_id:string}}>('select ship_inventory($1,$2::jsonb) as result',['70000000-0000-4000-8000-000000000001',payload]);
    expect(result.rows[0].result.order_id).toBe(order);
    await db.query('select ship_inventory($1,$2::jsonb)',['70000000-0000-4000-8000-000000000002',payload]);
    expect(Number((await db.query<{qty:string}>('select sum(quantity_on_hand) as qty from lots where product_id=$1',[product])).rows[0].qty)).toBe(before-2);
    expect((await db.query('select * from shipments where order_id=$1',[order])).rows).toHaveLength(1);
    expect((await db.query('select quantity_shipped,unit_price from sales_order_lines where order_id=$1',[order])).rows[0]).toEqual({quantity_shipped:2,unit_price:'7.0000'});
  });
});

describe('commercial reliability upgrades',()=>{
  it('shares atomic rate limits and rejects direct user access',async()=>{
    await login(admin);await expect(db.query("select consume_api_limit('fixture',2,60)")).rejects.toThrow();
    await db.exec('reset role;set role service_role');
    expect((await db.query<{allowed:boolean}>("select consume_api_limit('fixture',2,60) as allowed")).rows[0].allowed).toBe(true);
    expect((await db.query<{allowed:boolean}>("select consume_api_limit('fixture',2,60) as allowed")).rows[0].allowed).toBe(true);
    expect((await db.query<{allowed:boolean}>("select consume_api_limit('fixture',2,60) as allowed")).rows[0].allowed).toBe(false);
  });
  it('scopes the order desk by tenant and excludes product costs',async()=>{
    await login(admin);const data=(await db.query<{result:{orders:unknown[];total:number}}>("select list_order_desk('', 'all', 0) as result")).rows[0].result;
    expect(data.total).toBeGreaterThan(0);expect(JSON.stringify(data)).not.toContain('cost');
    await login(other);expect((await db.query<{result:{total:number}}>("select list_order_desk('', 'all', 0) as result")).rows[0].result.total).toBe(0);
    await login(staff);await expect(db.query('select list_order_desk()')).rejects.toThrow('Manager required');
  });
  it('binds a label purchase to one order and recovers without buying again',async()=>{
    await owner();const order=(await db.query<{id:string}>("insert into sales_orders(tenant_id,customer_id,order_number,status) values($1,$2,'LABEL-LOCK','confirmed') returning id",[tenant,customer])).rows[0].id;
    await db.query("insert into shipping_quotes(shipment_id,tenant_id,rates) values('shp_lock',$1,'[{\"id\":\"rate_one\"}]'),('shp_other',$1,'[{\"id\":\"rate_one\"}]')",[tenant]);
    await db.exec('set role service_role');
    const claim=(await db.query<{claim:{mode:string;token:string}}>("select claim_label_purchase($1,$2,'shp_lock','rate_one') as claim",[tenant,order])).rows[0].claim;expect(claim.mode).toBe('buy');
    expect((await db.query<{claim:{mode:string}}>("select claim_label_purchase($1,$2,'shp_lock','rate_one') as claim",[tenant,order])).rows[0].claim.mode).toBe('busy');
    await expect(db.query("select claim_label_purchase($1,$2,'shp_other','rate_one')",[tenant,order])).rejects.toThrow('already has a label');
    await db.query("update shipping_quotes set lease_until=now()-interval '1 second' where shipment_id='shp_lock'");
    const recovered=(await db.query<{claim:{mode:string;token:string}}>("select claim_label_purchase($1,$2,'shp_lock','rate_one') as claim",[tenant,order])).rows[0].claim;expect(recovered.mode).toBe('recover');
    const result=JSON.stringify({id:'shp_lock',tracking_code:'TEST-TRACK',label_url:'https://example.test/label',rate:{id:'rate_one',carrier:'Fixture',rate:'5.00'}});
    await expect(db.query("select complete_label_purchase($1,'shp_lock',$2,$3)",[tenant,claim.token,result])).rejects.toThrow('lease expired');
    await db.query("select complete_label_purchase($1,'shp_lock',$2,$3)",[tenant,recovered.token,result]);
    expect((await db.query<{claim:{mode:string}}>("select claim_label_purchase($1,$2,'shp_lock','rate_one') as claim",[tenant,order])).rows[0].claim.mode).toBe('cached');
    await owner();expect((await db.query<{tracking_number:string}>('select tracking_number from sales_orders where id=$1',[order])).rows[0].tracking_number).toBe('TEST-TRACK');
  });
  it('requires physical serial scans and allocates the scanned lot',async()=>{
    await owner();const serialProduct=(await db.query<{id:string}>("insert into products(tenant_id,name,sku,is_serial_tracked) values($1,'Serialized','SERIAL-PHYSICAL',true) returning id",[tenant])).rows[0].id;
    await login(admin);
    for(const [index,serial] of ['PHYSICAL-A','PHYSICAL-B'].entries()) await db.query('select receive_inventory($1,$2)',[`90000000-0000-4000-8000-00000000000${index+1}`,JSON.stringify({product_id:serialProduct,quantity:1,lot_number:serial,expiration_date:`2099-01-0${index+1}`,serial_numbers:[serial]})]);
    const shipment={customer_id:customer,lines:[{product_id:serialProduct,quantity:1,unit_price:5}]};
    await expect(db.query('select ship_inventory($1,$2)',['90000000-0000-4000-8000-000000000003',JSON.stringify(shipment)])).rejects.toThrow('Scan one serial');
    await db.query('select ship_inventory($1,$2)',['90000000-0000-4000-8000-000000000003',JSON.stringify({...shipment,serial_numbers:{[serialProduct]:['PHYSICAL-B']}})]);
    expect((await db.query<{serial_number:string;is_shipped:boolean}>('select serial_number,is_shipped from serial_numbers where product_id=$1 order by serial_number',[serialProduct])).rows).toEqual([{serial_number:'PHYSICAL-A',is_shipped:false},{serial_number:'PHYSICAL-B',is_shipped:true}]);
    await expect(db.query('select ship_inventory($1,$2)',['90000000-0000-4000-8000-000000000004',JSON.stringify({...shipment,serial_numbers:{[serialProduct]:['PHYSICAL-B']}})])).rejects.toThrow('Scanned serial is unavailable');
  });
});

describe('accounting and integration jobs',()=>{
 it('denies browser access to private accounting snapshots and job payloads',async()=>{
  await login(admin);for(const table of ['accounting_exports','accounting_mappings','integration_jobs'])await expect(db.query(`select * from ${table}`)).rejects.toThrow();
 });
 it('freezes an idempotent invoice snapshot and requires all mappings',async()=>{
  await owner();const order=(await db.query<{id:string}>("select id from sales_orders where tenant_id=$1 and status='shipped' limit 1",[tenant])).rows[0].id;
  await db.exec('set role service_role');await expect(db.query("select prepare_accounting_invoice($1,$2,'request')",[tenant,order])).rejects.toThrow('Map the customer');
  await db.query("insert into accounting_mappings values($1,'customer',$2,'10',null),($1,'product',$3,'20','NON')",[tenant,customer,product]);
  const first=(await db.query<{r:{snapshot:unknown}}>("select prepare_accounting_invoice($1,$2,'request') as r",[tenant,order])).rows[0].r;
  await db.query("update accounting_mappings set remote_id='21' where tenant_id=$1 and entity_type='product'",[tenant]);
  const second=(await db.query<{r:{snapshot:unknown}}>("select prepare_accounting_invoice($1,$2,'changed') as r",[tenant,order])).rows[0].r;
  expect(second).toEqual(first);await expect(db.query("select prepare_accounting_invoice($1,$2,'other')",[tenantB,order])).rejects.toThrow('Only shipped orders');
 });
 it('claims durable jobs once and recovers expired leases',async()=>{
  await owner();await db.query("insert into integration_jobs(tenant_id,provider,event_id,payload) values($1,'shopify','job-fixture','{\"order_id\":\"123\"}')",[tenant]);await db.exec('set role service_role');
  const first=(await db.query<{job:{id:string;attempts:number;lease_token:string}}>('select claim_integration_job() as job')).rows[0].job;expect(first.attempts).toBe(1);
  expect((await db.query<{job:unknown}>('select claim_integration_job() as job')).rows[0].job).toBeNull();
  await db.query("update integration_jobs set lease_until=now()-interval '1 second' where id=$1",[first.id]);
  const second=(await db.query<{job:{attempts:number;lease_token:string}}>('select claim_integration_job() as job')).rows[0].job;expect(second.attempts).toBe(2);expect(second.lease_token).not.toBe(first.lease_token);
 });
});

describe('embedded and tracking boundaries',()=>{
 it('links only a live member of the exact connected tenant, consumes the challenge, and revokes on disconnect',async()=>{
  await owner();await db.query("update integration_credentials set connected=true where tenant_id=$1 and provider='shopify'",[tenant]);
  await db.query("insert into shopify_link_challenges(challenge_hash,shop_domain,shopify_user_id) values('link-fixture','fixture.myshopify.com','123')");
  await login(other);await expect(db.query("select link_shopify_identity('link-fixture')")).rejects.toThrow('another warehouse');
  await login(staff);await expect(db.query("select link_shopify_identity('link-fixture')")).rejects.toThrow('Manager account required');
  await login(admin);expect((await db.query<{shop:string}>("select link_shopify_identity('link-fixture') as shop")).rows[0].shop).toBe('fixture.myshopify.com');
  await expect(db.query("select link_shopify_identity('link-fixture')")).rejects.toThrow('Link expired');
  await owner();await db.query("update integration_credentials set connected=false where tenant_id=$1 and provider='shopify'",[tenant]);expect((await db.query('select * from shopify_identity_links')).rows).toHaveLength(0);
 });
 it('keeps delivery status separate from physical shipping and ignores older tracking states',async()=>{
  await owner();await db.query("update shipping_quotes set purchased=purchased||'{\"tracker_id\":\"trk_fixture\"}' where shipment_id='shp_lock'");await db.exec('set role service_role');
  await db.query("select apply_shipping_tracking('evt_new','trk_fixture','delivered','2026-11-16T12:00:00Z')");
  await db.query("select apply_shipping_tracking('evt_old','trk_fixture','in_transit','2026-11-15T12:00:00Z')");
  await db.query("select apply_shipping_tracking('evt_new','trk_fixture','delivered','2026-11-16T12:00:00Z')");
  await owner();expect((await db.query<{status:string;delivery_status:string}>("select status,delivery_status from sales_orders where order_number='LABEL-LOCK'")).rows[0]).toEqual({status:'confirmed',delivery_status:'delivered'});
 });
});

describe('stock publishing outbox',()=>{
 it('deducts unshipped commitments, excludes expired stock, and does not lose concurrent revisions',async()=>{
  await owner();const prod=(await db.query<{id:string}>("insert into products(tenant_id,name,sku) values($1,'Publishable','OUTBOX-TEST') returning id",[tenant])).rows[0].id;
  await db.query("update integration_credentials set connected=true where tenant_id=$1 and provider='shopify'",[tenant]);
  await db.query("insert into shopify_inventory_mappings values($1,$2,'gid://shopify/ProductVariant/77','gid://shopify/InventoryItem/88','gid://shopify/Location/99',true)",[tenant,prod]);
  await login(admin);await db.query('select receive_inventory($1,$2)',['91000000-0000-4000-8000-000000000001',JSON.stringify({product_id:prod,quantity:10,lot_number:'OUTBOX-LOT'})]);
  await owner();const oid=(await db.query<{id:string}>("insert into sales_orders(tenant_id,customer_id,order_number,status) values($1,$2,'OUTBOX-ORDER','confirmed') returning id",[tenant,customer])).rows[0].id;
  await db.query('insert into sales_order_lines(tenant_id,order_id,product_id,quantity_ordered,unit_price) values($1,$2,$3,3,5)',[tenant,oid,prod]);
  await db.exec('set role service_role');expect((await db.query<{qty:number}>('select stock_publish_quantity($1,$2) as qty',[tenant,prod])).rows[0].qty).toBe(7);
  await db.query("update integration_jobs set status='complete' where payload->>'kind' is distinct from 'inventory'");
  const job=(await db.query<{j:{id:string;lease_token:string;revision:number}}>('select claim_integration_job() as j')).rows[0].j;
  await owner();await db.query("update lots set expiration_date=current_date-1 where lot_number='OUTBOX-LOT'");
  await db.exec('set role service_role');expect((await db.query<{qty:number}>('select stock_publish_quantity($1,$2) as qty',[tenant,prod])).rows[0].qty).toBe(0);
  await db.query('select finish_integration_job($1,$2,$3,true)',[job.id,job.lease_token,job.revision]);
  expect((await db.query<{status:string}>('select status from integration_jobs where id=$1',[job.id])).rows[0].status).toBe('pending');
 });
});

describe('atomic lot dispositions',()=>{
 it('removes stock once, preserves audit quantities, and blocks unsafe donations',async()=>{
  await login(admin);const received=(await db.query<{r:{lot_id:string}}>('select receive_inventory($1,$2) as r',['92000000-0000-4000-8000-000000000001',JSON.stringify({product_id:product,quantity:5,lot_number:'DISPOSITION-TEST'})])).rows[0].r.lot_id;
  const args=['92000000-0000-4000-8000-000000000002',received,2,'consume','Consignment consumption'];
  await db.query('select post_lot_disposition($1,$2,$3,$4,$5)',args);await db.query('select post_lot_disposition($1,$2,$3,$4,$5)',args);
  expect((await db.query<{quantity_on_hand:number}>('select quantity_on_hand from lots where id=$1',[received])).rows[0].quantity_on_hand).toBe(3);
  await db.query("select post_lot_disposition($1,$2,0,'recall','Lot recalled')",['92000000-0000-4000-8000-000000000003',received]);
  await expect(db.query("select post_lot_disposition($1,$2,1,'donate','Donation','{\"recipient\":\"Fixture\"}')",['92000000-0000-4000-8000-000000000004',received])).rejects.toThrow('cannot be consumed or donated');
  expect((await db.query<{quantity:number}>("select quantity from stock_movements where lot_id=$1 and movement_type='recall'",[received])).rows[0].quantity).toBe(0);
 });
});

describe('shipping account connection isolation',()=>{
 it('allows only one in-flight setup and denies direct user claims',async()=>{
  await login(admin);await expect(db.query('select claim_shipping_connection($1)',[tenant])).rejects.toThrow();
  await db.exec('reset role;set role service_role');const first=(await db.query<{lease:string}>('select claim_shipping_connection($1) as lease',[tenant])).rows[0].lease;expect(first).toBeTruthy();
  expect((await db.query<{lease:string|null}>('select claim_shipping_connection($1) as lease',[tenant])).rows[0].lease).toBeNull();
 });
});

describe('accounting source boundaries',()=>{
 it('blocks Shopify and paid POS exports until their full financial reconciliation is supported',async()=>{
  await owner();
  for(const [number,notes] of [['SHOPIFY-999999','Imported from Shopify'],['PAID-POS-FIXTURE','Cash POS sale: fixture']]){
   const order=(await db.query<{id:string}>("insert into sales_orders(tenant_id,customer_id,order_number,status,notes) values($1,$2,$3,'shipped',$4) returning id",[tenant,customer,number,notes])).rows[0].id;
   await db.exec('set role service_role');await expect(db.query("select prepare_accounting_invoice($1,$2,'source-boundary')",[tenant,order])).rejects.toThrow('require payment, tax, discount and freight reconciliation');
   expect((await db.query('select * from accounting_exports where order_id=$1',[order])).rows).toHaveLength(0);await owner();
  }
 });
});

describe('staff floor-only data access',()=>{
 it('hides all sales-order records and peer profiles while retaining safe product lookup',async()=>{
  await owner();expect((await db.query('select * from sales_orders where tenant_id=$1',[tenant])).rows.length).toBeGreaterThan(0);
  await db.query("insert into scan_logs(tenant_id,task_id,scanned_by,scan_type,scanned_value) select tenant_id,id,$1,'verify_stock','peer-fixture' from scan_tasks where tenant_id=$2 limit 1",[admin,tenant]);
  await login(staff);expect((await db.query('select * from sales_orders')).rows).toHaveLength(0);
  expect((await db.query('select * from scan_logs where scanned_by=$1',[admin])).rows).toHaveLength(0);expect((await db.query('select * from sales_order_lines')).rows).toHaveLength(0);
  expect((await db.query('select id from users where id=$1',[admin])).rows).toHaveLength(0);expect((await db.query('select id from users where id=$1',[staff])).rows).toHaveLength(1);
  expect((await db.query('select id from staff_products where id=$1',[product])).rows).toHaveLength(1);
 });
});

describe('purchase order discrepancies', () => {
  it('records 96 delivered, puts away 92 usable, and leaves four missing without duplicating the receipt', async () => {
    await owner();
    const location = (await db.query<{id: string}>(
      "insert into locations(tenant_id,name,code) values($1,'Receiving review','RCV-REVIEW') returning id", [tenant],
    )).rows[0].id;
    const supplier = (await db.query<{id: string}>(
      "insert into suppliers(tenant_id,name) values($1,'Discrepancy supplier') returning id", [tenant],
    )).rows[0].id;
    const po = (await db.query<{id: string}>(
      "insert into purchase_orders(tenant_id,po_number,supplier_id,status) values($1,'PO-DISCREPANCY',$2,'sent') returning id",
      [tenant, supplier],
    )).rows[0].id;
    const line = (await db.query<{id: string}>(
      'insert into po_lines(tenant_id,po_id,product_id,quantity_ordered,unit_cost) values($1,$2,$3,100,2) returning id',
      [tenant, po, product],
    )).rows[0].id;
    await login(manager);
    const payload = {
      po_line_id: line, quantity_to_receive: 92, damaged_quantity: 4, confirmed_shortage: true,
      lot_number: 'REVIEW-LOT', discrepancy_note: 'Check supplier disposition for damage and the outstanding units.',
    };
    const rpc = 'select receive_purchase_order($1,$2,$3,$4::jsonb)';
    const requestId = '50000000-0000-4000-8000-000000000081';
    await expect(db.query(rpc, [requestId, po, location, JSON.stringify([{ ...payload, damaged_quantity: 9 }])]))
      .rejects.toThrow('overage');
    const args = [requestId, po, location, JSON.stringify([payload])];
    await db.query(rpc, args);
    await db.query(rpc, args);
    expect((await db.query('select quantity_received from po_lines where id=$1', [line])).rows)
      .toEqual([{quantity_received: 96}]);
    expect((await db.query('select status from purchase_orders where id=$1', [po])).rows)
      .toEqual([{status: 'partial'}]);
    expect((await db.query("select quantity_on_hand from lots where lot_number='REVIEW-LOT'")).rows)
      .toEqual([{quantity_on_hand: 92}]);
    expect((await db.query("select requested_quantity from scan_tasks where title='Put away lot REVIEW-LOT'")).rows)
      .toEqual([{requested_quantity: 92}]);
    expect((await db.query('select usable_quantity, damaged_quantity, remaining_quantity, confirmed_shortage from po_receiving_discrepancies where po_id=$1', [po])).rows)
      .toEqual([{usable_quantity: 92, damaged_quantity: 4, remaining_quantity: 4, confirmed_shortage: true}]);
    await login(other);
    expect((await db.query('select po_id from po_receiving_discrepancies where po_id=$1', [po])).rows).toEqual([]);
  });
});

describe('warehouse execution workflows', () => {
  it('moves approved pick-bin stock and guards competing reservations and carton posts', async () => {
    const createRow = async (statement: string, values: unknown[]) =>
      (await db.query<{id: string}>(statement, values)).rows[0].id;
    await owner();
    await db.query("update tenant_billing set plan='enterprise' where tenant_id=$1",[tenant]);
    const item = await createRow("insert into products(tenant_id,name,sku) values($1,'Execution item','EXEC-1') returning id",[tenant]);
    const location = await createRow("insert into locations(tenant_id,name,code) values($1,'Execution warehouse','EXEC') returning id",[tenant]);
    const primary = await createRow("insert into bins(tenant_id,location_id,bin_code) values($1,$2,'EXEC-PICK') returning id",[tenant,location]);
    const reserve = await createRow("insert into bins(tenant_id,location_id,bin_code) values($1,$2,'EXEC-BULK') returning id",[tenant,location]);
    const lot = await createRow("insert into lots(tenant_id,product_id,lot_number,location_id,quantity_on_hand) values($1,$2,'EXEC-LOT',$3,10) returning id",[tenant,item,location]);
    const assignment = await createRow('insert into product_bin_assignments(tenant_id,product_id,bin_id,max_quantity) values($1,$2,$3,8) returning id',[tenant,item,primary]);
    await db.query('insert into bin_inventory(tenant_id,bin_id,product_id,lot_id,quantity) values($1,$2,$3,$4,10)',[tenant,reserve,item,lot]);
    const order = await createRow("insert into sales_orders(tenant_id,customer_id,order_number,status) values($1,$2,'EXEC-ORDER','confirmed') returning id",[tenant,customer]);
    const competing = await createRow("insert into sales_orders(tenant_id,customer_id,order_number,status) values($1,$2,'EXEC-OTHER','confirmed') returning id",[tenant,customer]);
    await db.query('insert into sales_order_lines(tenant_id,order_id,product_id,quantity_ordered) values($1,$2,$4,6),($1,$3,$4,5)',[tenant,order,competing,item]);

    await login(manager);
    expect((await db.query('select suggested_quantity,source_code,target_code from pick_bin_replenishment() where assignment_id=$1',[assignment])).rows)
      .toEqual([{ suggested_quantity: 8, source_code: 'EXEC-BULK', target_code: 'EXEC-PICK' }]);
    const task = (await db.query<{id:string}>('select approve_pick_bin_replenishment($1,$2) id',[assignment,staff])).rows[0].id;
    expect((await db.query('select approve_pick_bin_replenishment($1,$2) id',[assignment,staff])).rows).toEqual([{id:task}]);
    await login(staff);
    await db.query('select start_scan_task($1)',[task]);
    await db.query("select complete_scan_task($1,8,null,'EXEC-BULK','EXEC-PICK',$2::jsonb)",[task,JSON.stringify([{value:'EXEC-1'}])]);
    expect((await db.query('select quantity from bin_inventory where bin_id=$1 and product_id=$2',[primary,item])).rows).toEqual([{quantity:8}]);
    await expect(db.query('select set_order_reservation($1,true)',[order])).rejects.toThrow('Manager required');

    await login(manager);
    await db.query('select set_order_reservation($1,true)',[order]);
    await expect(db.query('select set_order_reservation($1,true)',[competing])).rejects.toThrow('Cannot reserve');
    expect((await db.query('select on_hand,reserved_other,reserved_for_order from order_reservation_status($1)',[competing])).rows)
      .toEqual([{on_hand:10,reserved_other:6,reserved_for_order:0}]);
    const post = 'select ship_inventory($1,$2::jsonb) result';
    const request = '88888888-0000-4000-8000-000000000001';
    await expect(db.query(post,[request,JSON.stringify({order_id:competing})])).rejects.toThrow('reserved for another order');
    await expect(db.query(post,[request,JSON.stringify({order_id:order,tracking_number:'TRACK',cartons:[{number:'C1',scans:['WRONG']} ]})]))
      .rejects.toThrow('Packed items must match');
    expect((await db.query('select quantity_on_hand from lots where id=$1',[lot])).rows).toEqual([{quantity_on_hand:10}]);
    const payload = JSON.stringify({order_id:order,tracking_number:'TRACK',cartons:[
      {number:'C1',scans:Array(3).fill('EXEC-1')},{number:'C2',tracking:'TRACK-2',scans:Array(3).fill('EXEC-1')},
    ]});
    const first = await db.query(post,[request,payload]);
    expect((await db.query(post,[request,payload])).rows).toEqual(first.rows);
    expect((await db.query("select carton_number,tracking_number from shipment_cartons where tracking_number like 'TRACK%' order by carton_number")).rows)
      .toEqual([{carton_number:'C1',tracking_number:'TRACK'},{carton_number:'C2',tracking_number:'TRACK-2'}]);
    expect((await db.query('select quantity_on_hand from lots where id=$1',[lot])).rows).toEqual([{quantity_on_hand:4}]);
    expect((await db.query('select quantity from order_reservations where order_id=$1',[order])).rows).toEqual([]);
    const competingLine = (await db.query<{id: string}>(
      'select id from sales_order_lines where order_id=$1', [competing])).rows[0].id;
    const partial = JSON.stringify({order_id:competing,order_quantities:{[competingLine]:2},
      tracking_number:'PARTIAL',cartons:[{number:'P1',scans:['EXEC-1','EXEC-1']}]});
    const postPartial = 'select ship_local_order_quantities($1,$2::jsonb) result';
    const partialRequest = '88888888-0000-4000-8000-000000000002';
    await expect(db.query(postPartial,[partialRequest,JSON.stringify({order_id:competing,order_quantities:{[competingLine]:6}})]))
      .rejects.toThrow('Invalid shipment quantity');
    await expect(db.query(postPartial,[partialRequest,JSON.stringify({order_id:competing,order_quantities:{[competingLine]:2}})]))
      .rejects.toThrow('Scan items into cartons');
    const partialResult = await db.query<{result:{has_backorder:boolean}}>(postPartial,[partialRequest,partial]);
    expect(partialResult.rows[0].result.has_backorder).toBe(true);
    expect((await db.query(postPartial,[partialRequest,partial])).rows).toEqual(partialResult.rows);
    expect((await db.query('select status from sales_orders where id=$1',[competing])).rows).toEqual([{status:'picking'}]);
    expect((await db.query('select quantity_shipped from sales_order_lines where id=$1',[competingLine])).rows)
      .toEqual([{quantity_shipped:2}]);
    expect((await db.query('select quantity_on_hand from lots where id=$1',[lot])).rows).toEqual([{quantity_on_hand:2}]);
    const restRequest = '88888888-0000-4000-8000-000000000003';
    await expect(db.query(post,[restRequest,JSON.stringify({order_id:competing})]))
      .rejects.toThrow('Insufficient available stock');
    await owner();
    await db.query('update lots set quantity_on_hand=quantity_on_hand+1 where id=$1',[lot]);
    await login(manager);
    await db.query(post,[restRequest,JSON.stringify({order_id:competing})]);
    expect((await db.query('select status from sales_orders where id=$1',[competing])).rows).toEqual([{status:'shipped'}]);
    expect((await db.query('select quantity_shipped from sales_order_lines where id=$1',[competingLine])).rows)
      .toEqual([{quantity_shipped:5}]);
    expect((await db.query('select id from shipments where order_id=$1',[competing])).rows).toHaveLength(2);
    await login(other);
    expect((await db.query("select id from shipment_cartons where tracking_number='TRACK'")).rows).toEqual([]);
  });

  it('accounts for transfer damage and missing units and keeps resolution history', async () => {
    const createRow = async (statement: string, values: unknown[]) =>
      (await db.query<{id: string}>(statement,values)).rows[0].id;
    await owner();
    const origin = await createRow("insert into locations(tenant_id,name,code) values($1,'Execution source','EXEC-SRC') returning id",[tenant]);
    const destination = await createRow("insert into locations(tenant_id,name,code) values($1,'Execution store','EXEC-DST') returning id",[tenant]);
    const lot = await createRow("insert into lots(tenant_id,product_id,lot_number,location_id,quantity_on_hand) values($1,$2,'EXEC-TRANSFER-LOT',$3,10) returning id",[tenant,product,origin]);
    const transfer = await createRow("insert into transfers(tenant_id,transfer_number,from_location_id,to_location_id,status) values($1,'EXEC-TRANSFER',$2,$3,'pending') returning id",[tenant,origin,destination]);
    const line = await createRow('insert into transfer_lines(tenant_id,transfer_id,product_id,lot_id,quantity) values($1,$2,$3,$4,10) returning id',[tenant,transfer,product,lot]);
    await login(manager);
    await db.query('select dispatch_transfer($1)',[transfer]);
    const receipt = 'select review_transfer_receipt($1,$2,$3::jsonb)';
    const first = ['88888888-0000-4000-8000-000000000011',transfer,JSON.stringify([{id:line,usable:7,damaged:1,missing:2,note:'Carton was damaged'}])];
    await db.query(receipt,first);
    await db.query(receipt,first);
    expect((await db.query('select quantity_received,quantity_damaged from transfer_stock where transfer_line_id=$1',[line])).rows)
      .toEqual([{quantity_received:7,quantity_damaged:1}]);
    expect((await db.query('select status from transfers where id=$1',[transfer])).rows).toEqual([{status:'in_transit'}]);
    expect((await db.query("select quantity_on_hand from lots where location_id=$1 and lot_number='EXEC-TRANSFER-LOT'",[destination])).rows)
      .toEqual([{quantity_on_hand:7}]);
    const [{id: followup}] = (await db.query<{id:string}>('select id from warehouse_followups where source_id=$1',[transfer])).rows;
    await db.query("select save_warehouse_followup($1,'transfer','',null,null,$2,current_date,'Received missing units the next day',true)",[followup,manager]);
    expect((await db.query('select owner_id,resolved_at is not null as resolved from warehouse_followups where id=$1',[followup])).rows)
      .toEqual([{owner_id:manager,resolved:true}]);
    expect((await db.query('select id from warehouse_followup_events where followup_id=$1',[followup])).rows).toHaveLength(2);
    await db.query(receipt,['88888888-0000-4000-8000-000000000012',transfer,JSON.stringify([{id:line,usable:2}])]);
    expect((await db.query('select status from transfers where id=$1',[transfer])).rows).toEqual([{status:'received'}]);
    expect((await db.query("select quantity_on_hand from lots where location_id=$1 and lot_number='EXEC-TRANSFER-LOT'",[destination])).rows)
      .toEqual([{quantity_on_hand:9}]);
    await login(other);
    expect((await db.query('select id from warehouse_followups where id=$1',[followup])).rows).toEqual([]);
  });
});

describe('self-serve warehouse setup', () => {
  it('sets up a new tenant once, rolls back bad imports, and posts bin stock once on receipt retry', async () => {
    const ownerId = '90000000-0000-4000-8000-000000000001';
    await owner();
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)', [
      ownerId, 'setup@example.test', JSON.stringify({ company_name: 'Setup fixture', full_name: 'Setup admin' }),
    ]);
    await login(ownerId);
    const setup = 'select setup_first_warehouse($1,$2,$3) as id';
    const warehouse = (await db.query<{ id: string }>(setup, ['Setup fixture','Main warehouse','America/New_York'])).rows[0].id;
    expect((await db.query(setup, ['Setup fixture','Main warehouse','America/New_York'])).rows).toEqual([{ id: warehouse }]);
    const bins = (await db.query<{ id: string; bin_code: string }>('select id,bin_code from bins where location_id=$1 order by bin_code',[warehouse])).rows;
    expect(bins.map(bin => bin.bin_code)).toEqual(['RECEIVING', 'STARTER']);
    const importer = 'select import_setup_inventory($1,$2,$3::jsonb,$4) as count';
    const request = '90000000-0000-4000-8000-000000000002';
    const products = JSON.stringify([{ sku:'BOX-100',name:'Shipping box',lot_tracked:true }]);
    await db.query(importer,[request,null,products,'products']);
    const [{id: skuId}] = (await db.query<{id:string}>("select id from products where sku='BOX-100'")).rows;
    const openingId = '90000000-0000-4000-8000-000000000003';
    const opening = { sku:'BOX-100',bin:'STARTER',quantity:25,lot:'COUNT-1' };
    await expect(db.query(importer,[openingId,warehouse,JSON.stringify([opening,{...opening,bin:'DOES-NOT-EXIST'}]),'opening'])).rejects.toThrow('needs an active bin');
    expect((await db.query("select id from lots where lot_number='COUNT-1'")).rows).toEqual([]);
    const openingArgs = [openingId,warehouse,JSON.stringify([opening]),'opening'];
    await db.query(importer,openingArgs);
    await db.query(importer,openingArgs);
    const receiving = 'select receive_inventory_to_bin($1,$2::jsonb,$3)';
    const receipt = ['90000000-0000-4000-8000-000000000004',JSON.stringify({
      product_id:skuId,quantity:3,lot_number:'FIRST-RECEIPT',
    }),bins[0].id];
    await db.query(receiving, receipt);
    await db.query(receiving, receipt);
    expect((await db.query('select quantity from bin_inventory where product_id=$1 order by quantity',[skuId])).rows)
      .toEqual([{quantity:3},{quantity:25}]);
    await login(other);
    await expect(db.query(receiving,['90000000-0000-4000-8000-000000000005',receipt[1],bins[0].id])).rejects.toThrow('active receiving bin');
  });
});

describe('public prelaunch registration', () => {
  it('holds warehouse access until launch and then creates the workspace once', async () => {
    const pending = '10000000-0000-4000-8000-000000000099';
    await owner();
    await db.exec('update prelaunch_settings set signup_open=false');
    await db.query(`insert into auth.users(id,email,raw_user_meta_data)
      values($1,'early@example.test','{"company_name":"Early Distributor","full_name":"Early Buyer","organization_profile":{"address":"12 Example Road","business_phone":"2025550180","plan":"enterprise"}}')`,[pending]);
    expect((await db.query('select id from users where id=$1',[pending])).rows).toEqual([]);
    await login(pending);
    expect((await db.query('select prelaunch_status() status')).rows).toEqual([{status:'paused'}]);
    await expect(db.query('select * from prelaunch_registrations')).rejects.toThrow('permission denied');
    await expect(db.query("select bootstrap_tenant('Override','Override')")).rejects.toThrow('paused');
    await login(admin);
    expect((await db.query('select prelaunch_status() status')).rows).toEqual([{status:'none'}]);
    await owner();
    await db.exec('update prelaunch_settings set signup_open=true');
    await login(pending);
    expect((await db.query('select prelaunch_status() status')).rows).toEqual([{status:'open'}]);
    const first = await db.query("select bootstrap_tenant('','') tenant");
    expect((await db.query("select bootstrap_tenant('','') tenant")).rows).toEqual(first.rows);
    expect((await db.query('select name from tenants')).rows).toEqual([{name:'Early Distributor'}]);
    expect((await db.query("select settings->>'address' as address, settings->>'business_phone' as phone, settings->>'plan' as plan from tenants")).rows)
      .toEqual([{address:'12 Example Road',phone:'2025550180',plan:null}]);
    await db.query(`select update_tenant_settings('{"address":"New Company Address","business_phone":""}')`);
    expect((await db.query("select settings->>'address' address from tenants")).rows)
      .toEqual([{address:'New Company Address'}]);
    expect((await db.query('select prelaunch_status() status')).rows).toEqual([{status:'none'}]);
  });
});
