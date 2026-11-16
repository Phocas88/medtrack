import { z } from "zod";
import { NextResponse } from "next/server";
import { requireUser, routeError, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { quickBooksConnection } from "@/lib/quickbooks";
import { uuid } from "@/lib/security";
export async function GET() {
  try {
    const user = await requireUser(["admin"], true);
    const db = createServiceClient();
    const client = await quickBooksConnection(user.tenant_id);
    const remote = async (entity: "Customer" | "Item" | "TaxCode") => {
      const results: { id: string; name: string }[] = [];
      for (let start = 1; start <= 10001; start += 1000) {
        const data = await client.request(
          `query?query=${encodeURIComponent(`select * from ${entity} where Active = true STARTPOSITION ${start} MAXRESULTS 1000`)}&minorversion=75`,
        );
        const rows = data.QueryResponse?.[entity] || [];
        results.push(
          ...rows.map(
            (row: { Id: string; DisplayName?: string; Name?: string }) => ({
              id: row.Id,
              name: row.DisplayName || row.Name || row.Id,
            }),
          ),
        );
        if (rows.length < 1000) return results;
      }
      throw new HttpError(
        409,
        "This accounting company needs a scoped mapping import. Contact support.",
      );
    };
    const [customers, items, taxes, localCustomers, localProducts, mappings] =
      await Promise.all([
        remote("Customer"),
        remote("Item"),
        remote("TaxCode"),
        db
          .from("customers")
          .select("id,name")
          .eq("tenant_id", user.tenant_id)
          .eq("is_archived", false)
          .order("name"),
        db
          .from("products")
          .select("id,name,sku")
          .eq("tenant_id", user.tenant_id)
          .eq("is_archived", false)
          .order("name"),
        db
          .from("accounting_mappings")
          .select("entity_type,entity_id,remote_id,tax_code")
          .eq("tenant_id", user.tenant_id),
      ]);
    if (localCustomers.error || localProducts.error || mappings.error)
      throw localCustomers.error || localProducts.error || mappings.error;
    return NextResponse.json(
      {
        customers,
        items,
        taxes,
        localCustomers: localCustomers.data,
        localProducts: localProducts.data,
        mappings: mappings.data,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser(["admin"], true);
    const input = z
      .object({
        entity_type: z.enum(["customer", "product"]),
        entity_id: uuid,
        remote_id: z.string().regex(/^\d+$/).max(30),
        tax_code: z
          .string()
          .regex(/^[a-zA-Z0-9_-]+$/)
          .max(30)
          .optional(),
      })
      .parse(await request.json());
    if (input.entity_type === "product" && !input.tax_code)
      throw new HttpError(400, "Choose the applicable sales tax code");
    const db = createServiceClient();
    const { data: local, error } = await db
      .from(input.entity_type === "product" ? "products" : "customers")
      .select("id")
      .eq("id", input.entity_id)
      .eq("tenant_id", user.tenant_id)
      .eq("is_archived", false)
      .single();
    if (error || !local) throw new HttpError(404, "Record not found");
    const remote = await quickBooksConnection(user.tenant_id);
    const entity = input.entity_type === "product" ? "Item" : "Customer";
    const result = await remote.request(
      `${entity.toLowerCase()}/${input.remote_id}?minorversion=75`,
    );
    if (!result[entity]?.Active)
      throw new HttpError(400, "Choose an active accounting record");
    if (input.tax_code && !["TAX", "NON"].includes(input.tax_code)) {
      const tax = await remote.request(
        `taxcode/${encodeURIComponent(input.tax_code)}?minorversion=75`,
      );
      if (!tax.TaxCode?.Active)
        throw new HttpError(400, "Choose an active tax code");
    }
    const { error: saveError } = await db
      .from("accounting_mappings")
      .upsert(
        { tenant_id: user.tenant_id, ...input },
        { onConflict: "tenant_id,entity_type,entity_id" },
      );
    if (saveError) throw saveError;
    return NextResponse.json({ success: true });
  } catch (error) {
    return routeError(error);
  }
}
