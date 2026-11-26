import { createHmac, timingSafeEqual } from "node:crypto";
import { shopDomain } from "@/lib/security";
import { HttpError } from "@/lib/server-auth";
export function verifyShopifySession(
  token: string,
  now = Math.floor(Date.now() / 1000),
): { shop: string; subject: string } {
  const secret = process.env.SHOPIFY_API_SECRET,
    key = process.env.SHOPIFY_API_KEY;
  if (!secret || !key)
    throw new HttpError(
      503,
      "Embedded Shopify authentication is not configured",
    );
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || token.length > 8192) throw new Error();
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    if (header.alg !== "HS256") throw new Error();
    const expected = createHmac("sha256", secret)
      .update(parts[0] + "." + parts[1])
      .digest();
    const signature = Buffer.from(parts[2], "base64url");
    if (
      expected.length !== signature.length ||
      !timingSafeEqual(expected, signature)
    )
      throw new Error();
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (
      claims.aud !== key ||
      !Number.isFinite(claims.exp) ||
      !Number.isFinite(claims.iat) ||
      !Number.isFinite(claims.nbf) ||
      claims.exp <= now ||
      claims.nbf > now + 5 ||
      claims.iat > now + 5 ||
      claims.exp - claims.iat > 90 ||
      typeof claims.sub !== "string" ||
      !/^\d{1,30}$/.test(claims.sub)
    )
      throw new Error();
    const destination = new URL(claims.dest);
    if (
      destination.protocol !== "https:" ||
      destination.username ||
      destination.password ||
      destination.port ||
      destination.pathname !== "/" ||
      destination.search ||
      destination.hash
    )
      throw new Error();
    const shop = shopDomain(destination.hostname);
    if (claims.iss !== `https://${shop}/admin`) throw new Error();
    return { shop, subject: claims.sub };
  } catch {
    throw new HttpError(401, "Invalid Shopify session token");
  }
}
export function shopifySession(request: Request) {
  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer "))
    throw new HttpError(401, "Shopify session token required");
  return verifyShopifySession(bearer.slice(7));
}
