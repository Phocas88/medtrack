// Run only against a dedicated, migrated Supabase staging project.
// Credentials are read from process environment. Values and provider error bodies are never printed.
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const required = [
  "STAGING_SUPABASE_URL",
  "STAGING_SUPABASE_ANON_KEY",
  "STAGING_SUPABASE_SERVICE_ROLE_KEY",
  "STAGING_PROJECT_CONFIRMATION",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.log(JSON.stringify({ status: "not-run", missing }));
  process.exit(1);
}
const url = new URL(process.env.STAGING_SUPABASE_URL);
if (
  url.hostname === "pzpseofzcwmdmpbwpxqj.supabase.co" ||
  url.protocol !== "https:" ||
  !url.hostname.endsWith(".supabase.co") ||
  process.env.STAGING_PROJECT_CONFIRMATION !== url.hostname.split(".")[0]
) {
  console.log(
    JSON.stringify({
      status: "not-run",
      reason: "Explicit isolated-project confirmation required",
    }),
  );
  process.exit(1);
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(
  url.href,
  process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
  options,
);
const actor = () =>
  createClient(url.href, process.env.STAGING_SUPABASE_ANON_KEY, options);
const users = [],
  tenants = [];
const run = randomUUID();
let failure = false;
const checked = (result) => {
  if (result.error) throw new Error("Acceptance operation rejected");
  return result.data;
};
async function step(name, fn) {
  try {
    await fn();
    console.log(JSON.stringify({ check: name, status: "passed" }));
  } catch {
    failure = true;
    console.log(
      JSON.stringify({
        check: name,
        status: "failed",
        detail:
          "Inspect staging schema, Auth configuration and policies. Provider bodies are intentionally redacted.",
      }),
    );
    throw new Error("Acceptance check failed");
  }
}
try {
  let adminA, adminB, staff, tenantA, tenantB, product, customer;
  await step("Auth provisioning and isolated tenant creation", async () => {
    async function signup(label) {
      const email = `staging-${run}-${label}@example.invalid`,
        password = randomBytes(32).toString("hex");
      const created = checked(
        await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            company_name: `Acceptance ${run} ${label}`,
            full_name: "Acceptance operator",
          },
        }),
      );
      users.push(created.user.id);
      const client = actor();
      checked(await client.auth.signInWithPassword({ email, password }));
      const profile = checked(
        await service
          .from("users")
          .select("tenant_id")
          .eq("id", created.user.id)
          .single(),
      );
      tenants.push(profile.tenant_id);
      return { client, tenant: profile.tenant_id };
    }
    const a = await signup("a"),
      b = await signup("b");
    adminA = a.client;
    adminB = b.client;
    tenantA = a.tenant;
    tenantB = b.tenant;
    assert.notEqual(tenantA, tenantB);
    const billing = checked(
      await service
        .from("tenant_billing")
        .select("status")
        .eq("tenant_id", tenantA)
        .single(),
    );
    assert.equal(billing.status, "trialing");
  });
  await step("Real PostgREST relationships and tenant isolation", async () => {
    product = checked(
      await service
        .from("products")
        .insert({
          tenant_id: tenantA,
          name: "Acceptance product",
          sku: `ACCEPT-${run}`,
          cost: 3,
          price: 5,
        })
        .select("id")
        .single(),
    ).id;
    customer = checked(
      await service
        .from("customers")
        .insert({ tenant_id: tenantA, name: "Acceptance customer" })
        .select("id")
        .single(),
    ).id;
    assert.equal(
      checked(await adminB.from("products").select("id").eq("id", product))
        .length,
      0,
    );
    const email = `staging-${run}-staff@example.invalid`,
      password = randomBytes(32).toString("hex");
    const created = checked(
      await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    );
    users.push(created.user.id);
    checked(
      await service.from("users").insert({
        id: created.user.id,
        tenant_id: tenantA,
        email,
        full_name: "Acceptance staff",
        role: "staff",
        is_active: true,
      }),
    );
    staff = actor();
    checked(await staff.auth.signInWithPassword({ email, password }));
    const raw = await staff.from("products").select("cost").eq("id", product);
    assert.ok(raw.error || raw.data.length === 0);
    const safe = checked(
      await staff.from("staff_products").select("*").eq("id", product),
    );
    assert.equal(safe.length, 1);
    assert.ok(!("cost" in safe[0]));
  });
  await step("Hosted receipt replay protection", async () => {
    const id = randomUUID(),
      receipt = {
        product_id: product,
        quantity: 10,
        lot_number: `ACCEPT-${run}`,
        cost_at_receipt: 3,
      };
    const first = checked(
      await adminA.rpc("receive_inventory", {
        p_request_id: id,
        p_receipt: receipt,
      }),
    );
    const retry = checked(
      await adminA.rpc("receive_inventory", {
        p_request_id: id,
        p_receipt: receipt,
      }),
    );
    assert.deepEqual(first, retry);
    const lot = checked(
      await adminA
        .from("lots")
        .select("quantity_on_hand")
        .eq("id", first.lot_id)
        .single(),
    );
    assert.equal(lot.quantity_on_hand, 10);
  });
  await step(
    "Concurrent operators cannot oversell the last units",
    async () => {
      const shipment = {
        customer_id: customer,
        lines: [{ product_id: product, quantity: 6, unit_price: 5 }],
      };
      const results = await Promise.all([
        adminA.rpc("ship_inventory", {
          p_request_id: randomUUID(),
          p_shipment: shipment,
        }),
        adminA.rpc("ship_inventory", {
          p_request_id: randomUUID(),
          p_shipment: shipment,
        }),
      ]);
      assert.equal(results.filter((result) => !result.error).length, 1);
      const lots = checked(
        await adminA
          .from("lots")
          .select("quantity_on_hand")
          .eq("product_id", product),
      );
      assert.equal(
        lots.reduce((sum, lot) => sum + lot.quantity_on_hand, 0),
        4,
      );
      const orders = checked(
        await adminA
          .from("sales_orders")
          .select("id,lines:sales_order_lines(product_id,quantity_shipped)")
          .eq("tenant_id", tenantA),
      );
      assert.equal(orders.length, 1);
      assert.equal(orders[0].lines[0].quantity_shipped, 6);
    },
  );
  await step("Carton-verified local partial shipment and backorder", async () => {
    const order = checked(await adminA.from("sales_orders").insert({
      tenant_id: tenantA, customer_id: customer, order_number: `ACCEPT-PART-${run}`, status: "confirmed",
    }).select("id").single());
    const line = checked(await adminA.from("sales_order_lines").insert({
      tenant_id: tenantA, order_id: order.id, product_id: product, quantity_ordered: 3, unit_price: 5,
    }).select("id").single());
    const item = checked(await adminA.from("products").select("sku").eq("id", product).single());
    const request = {
      p_request_id: randomUUID(),
      p_shipment: {
        order_id: order.id,
        order_quantities: { [line.id]: 2 },
        cartons: [{ number: "ACCEPT-C1", scans: [item.sku, item.sku], tracking: "ACCEPT-CARTON" }],
      },
    };
    const first = checked(await adminA.rpc("ship_local_order_quantities", request));
    assert.equal(first.has_backorder, true);
    assert.deepEqual(checked(await adminA.rpc("ship_local_order_quantities", request)), first);
    const remaining = checked(await adminA.from("sales_order_lines").select("quantity_shipped")
      .eq("id", line.id).single());
    assert.equal(remaining.quantity_shipped, 2);
    assert.ok((await adminB.rpc("ship_local_order_quantities", request)).error);
    const final = checked(await adminA.rpc("ship_inventory", {
      p_request_id: randomUUID(), p_shipment: { order_id: order.id },
    }));
    assert.notEqual(final.shipment_id, first.shipment_id);
    const closed = checked(await adminA.from("sales_orders").select("status").eq("id", order.id).single());
    assert.equal(closed.status, "shipped");
  });
  await step("Staff cannot invoke financial or order-desk RPCs", async () => {
    const read = await staff.rpc("list_order_desk");
    assert.ok(read.error);
    const receive = await staff.rpc("receive_inventory", {
      p_request_id: randomUUID(),
      p_receipt: {
        product_id: product,
        quantity: 1,
        lot_number: "STAFF-DENIED",
      },
    });
    assert.ok(receive.error);
  });
  await step(
    "Private Storage upload, signed download and cross-tenant denial",
    async () => {
      const path = `${tenantA}/${run}.txt`;
      checked(
        await adminA.storage
          .from("tenant-documents")
          .upload(path, Buffer.from("Acceptance fixture"), {
            contentType: "text/plain",
          }),
      );
      const signed = checked(
        await adminA.storage.from("tenant-documents").createSignedUrl(path, 30),
      );
      assert.ok(signed.signedUrl);
      const denied = await adminB.storage
        .from("tenant-documents")
        .download(path);
      assert.ok(denied.error);
      const staffDenied = await staff.storage
        .from("tenant-documents")
        .download(path);
      assert.ok(staffDenied.error);
      checked(await adminA.storage.from("tenant-documents").remove([path]));
    },
  );
} catch {
  failure = true;
} finally {
  for (const tenant of tenants) {
    const result = await service.from("tenants").delete().eq("id", tenant);
    if (result.error) {
      failure = true;
      console.log(
        JSON.stringify({ check: "Fixture cleanup", status: "failed" }),
      );
    }
  }
  for (const user of users) {
    const result = await service.auth.admin.deleteUser(user);
    if (result.error) {
      failure = true;
      console.log(
        JSON.stringify({ check: "Auth fixture cleanup", status: "failed" }),
      );
    }
  }
}
console.log(
  JSON.stringify({
    status: failure ? "failed" : "passed",
    scope:
      "Hosted Auth, PostgREST, concurrent SQL posting, role isolation and Storage. Billing, email, OAuth and shipping-provider acceptance remain separate.",
  }),
);
process.exitCode = failure ? 1 : 0;
