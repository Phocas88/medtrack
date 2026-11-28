import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { BRAND_COLOR, BRAND_ICON_PATH, BRAND_TAGLINE, PRODUCT_FULL_NAME, PRODUCT_NAME } from "@/lib/brand";
import { publicSiteOrigin } from "@/lib/public-site";
import { SiteAnalytics } from "@/components/layout/site-analytics";

const inter = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-sans",
  weight: "100 900",
  display: "swap",
});

const description = "Manage receiving, inventory, bin locations, barcode scanning, and order fulfillment in one warehouse workspace.";

export const metadata: Metadata = {
  metadataBase: new URL(publicSiteOrigin),
  applicationName: PRODUCT_FULL_NAME,
  title: PRODUCT_NAME,
  description,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: BRAND_ICON_PATH, type: "image/svg+xml" }],
    apple: [{ url: "/branding/invexiqs-apple.png", sizes: "180x180" }],
  },
  openGraph: { type: "website", siteName: PRODUCT_NAME, title: PRODUCT_NAME, description },
  twitter: { card: "summary_large_image", title: PRODUCT_NAME, description },
  appleWebApp: { capable: true, title: PRODUCT_NAME, statusBarStyle: "default" },
  other: { "mobile-web-app-capable": "yes", slogan: BRAND_TAGLINE },
};

export const viewport: Viewport = { themeColor: BRAND_COLOR };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable,
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          {process.env.VERCEL === "1" && <SiteAnalytics />}
        </ThemeProvider>
      </body>
    </html>
  );
}
