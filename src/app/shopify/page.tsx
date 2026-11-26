import type { Metadata } from "next";
import Script from "next/script";
import { redirect } from "next/navigation";
import { EmbeddedWorkspace } from "./embedded-workspace";
import { verifyShopifyLaunch } from "@/lib/shopify-webhooks";
import { shopDomain } from "@/lib/security";
import { createServiceClient } from "@/lib/supabase/service";
export const metadata: Metadata = {
  title: "Stokora · Shopify",
  other: { "shopify-api-key": process.env.SHOPIFY_API_KEY || "" },
};
export default async function ShopifyEmbeddedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (typeof value === "string") params.set(key, value);
  if (verifyShopifyLaunch(params)) {
    const shop = shopDomain(params.get("shop")!);
    const { data, error } = await createServiceClient()
      .from("integration_credentials")
      .select("connected")
      .eq("provider", "shopify")
      .eq("shop_domain", shop)
      .maybeSingle();
    if (error) throw new Error("Could not check Shopify installation");
    if (!data?.connected)
      redirect(`/api/shopify/install?shop=${encodeURIComponent(shop)}`);
  }
  return (
    <>
      <Script
        src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://cdn.shopify.com/shopifycloud/polaris.js"
        strategy="afterInteractive"
      />
      <EmbeddedWorkspace />
    </>
  );
}
