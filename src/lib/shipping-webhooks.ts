import { createHmac, timingSafeEqual } from "node:crypto";
/** Compatible with EasyPost's documented HMAC header and Unicode normalization. */
export function verifyShippingWebhook(
  raw: string,
  signature: string | null,
  secret = process.env.EASYPOST_WEBHOOK_SECRET,
): boolean {
  if (!secret || !signature) return false;
  const expected = `hmac-sha256-hex=${createHmac("sha256", secret.normalize("NFKD")).update(raw).digest("hex")}`;
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}
