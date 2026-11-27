import { z } from "zod";

export const uuid = z.string().uuid();

export function safeRedirect(
  value: string | null,
  fallback = "/dashboard",
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return fallback;
  return value;
}

export function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured && process.env.NODE_ENV === "production")
    throw new Error("Application URL is not configured");
  const url = new URL(configured || "http://localhost:3000");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new Error("HTTPS application URL required");
  return url.origin;
}

export function shopDomain(value: string): string {
  const domain = value
    .trim()
    .toLowerCase()
    .replace(/^https:\/\//, "")
    .replace(/\/$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain))
    throw new Error("A valid myshopify.com domain is required");
  return domain;
}

export function isPublicPage(path: string): boolean {
  return (
    [
      "/",
      "/demo",
      "/demo/workspace",
      "/shopify",
      "/support",
      "/guide",
      "/plans",
      "/tools",
      "/integrations-directory",
      "/audit-report.html",
      "/manifest.json",
      "/manifest.webmanifest",
      "/opengraph-image",
      "/robots.txt",
      "/sitemap.xml",
    ].includes(path) || path.startsWith("/legal/")
  );
}

export function isScannerPath(path: string): boolean {
  return path === "/scan" || path.startsWith("/scan/");
}
