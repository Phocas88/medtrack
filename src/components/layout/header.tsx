"use client"

import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { Menu, Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { NotificationBell } from "@/components/layout/notification-bell"
import { User, Settings, LogOut } from "lucide-react"

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/analytics": "Analytics",
  "/products": "Products",
  "/lots": "Lots",
  "/receive": "Receive",
  "/ship": "Ship",
  "/purchase-orders": "Purchase Orders",
  "/returns": "Returns",
  "/reorder": "Reorder Management",
  "/locations": "Locations & Zones",
  "/transfers": "Transfers",
  "/cycle-counts": "Cycle Counts",
  "/quarantine": "Quarantine",
  "/kitting": "Kitting",
  "/customers": "Customers",
  "/suppliers": "Suppliers",
  "/pricing": "Pricing",
  "/documents": "Documents",
  "/reports": "Reports",
  "/recall": "Recall Lookup",
  "/notifications": "Notifications",
  "/movements": "Stock Movements",
  "/product-matrix": "Product Matrix",
  "/controlled-substances": "Controlled Substances",
  "/dscsa": "DSCSA Tracking",
  "/compliance": "Compliance Reports",
  "/audit": "Audit Trail",
  "/customer-portal": "Customer Portal",
  "/consignment": "Consignment Inventory",
  "/expiration": "Expiration Management",
  "/bins": "Bin Management",
  "/scanner": "Scanner",
  "/custom-fields": "Custom Fields",
  "/integrations/quickbooks": "QuickBooks Integration",
  "/settings": "Settings",
}

function getPageTitle(pathname: string): string {
  // Exact match first
  if (pageTitles[pathname]) return pageTitles[pathname]
  // Check if pathname starts with a known route
  for (const [route, title] of Object.entries(pageTitles)) {
    if (pathname.startsWith(route + "/")) return title
  }
  return "TrackFlow"
}

interface HeaderProps {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname()
  const { setTheme, theme } = useTheme()
  const title = getPageTitle(pathname)

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle menu</span>
      </Button>

      {/* Page title */}
      <h1 className="text-lg font-semibold">{title}</h1>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side actions */}
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* Notifications */}
        <NotificationBell />

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center justify-center rounded-full p-1 hover:bg-accent transition-colors">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-xs">MT</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
