import { publicSiteOrigin } from '@/lib/public-site';
import type { Metadata } from "next"
import "./globals.css"
import { cn } from "@/lib/utils"
import { ThemeProvider } from "@/components/layout/theme-provider"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "Stokora WMS | Warehouse Management System",
  metadataBase: new URL(publicSiteOrigin),
  description: "Warehouse management for growing distributors, with inventory, receiving, bin locations, and order fulfillment.",
  openGraph: {
    title: "Stokora WMS",
    description: "Warehouse management for growing distributors.",
    siteName: "Stokora WMS",
    type: "website",
    images: [{ url: "/stokora-logo.png", alt: "Stokora WMS logo" }],
  },
  twitter: { card: "summary", images: ["/stokora-logo.png"] },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f172a" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={cn("min-h-screen bg-background font-sans antialiased")}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
