"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import Link from "next/link"
import { Sun, Moon, Search, Command } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { WorkspaceNavigation } from "@/components/layout/workspace-navigation"
import { StokoraLogo } from "@/components/ui/stokora-logo"
import { NotificationBell } from "@/components/layout/notification-bell"
import { User, Settings, LogOut } from "lucide-react"
import { useAuth } from "@/components/providers/auth-provider"

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/metrics": "Metrics",
  "/analytics": "Analytics",
  "/products": "Products",
  "/uom": "Units & Parts",
  "/lots": "Lots",
  "/receive": "Receive",
  "/put-away": "Put-Away",
  "/ship": "Ship",
  "/purchase-orders": "Purchase Orders",
  "/returns": "Returns",
  "/reorder": "Reorder Management",
  "/wave-picking": "Wave Picking",
  "/cross-dock": "Cross-Docking",
  "/dock-scheduling": "Dock Scheduling",
  "/locations": "Locations & Zones",
  "/transfers": "Transfers",
  "/cycle-counts": "Cycle Counts",
  "/quarantine": "Quarantine",
  "/kitting": "Kitting",
  "/customers": "Customers",
  "/suppliers": "Suppliers",
  "/pricing": "Pricing",
  "/promotions": "Promotions & Sales",
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
  "/billing": "Billing",
  "/import-export": "Import / Export",
  "/integrations/quickbooks": "QuickBooks Integration",
  "/integrations/zapier": "Zapier Integration",
  "/labor": "Labor Tracking",
  "/slotting": "Slotting Optimization",
  "/abc-analysis": "ABC Analysis",
  "/prop65": "Proposition 65 Tracking",
  "/recall-monitor": "Recall Monitor",
  "/gs1-compliance": "GS1 Compliance",
  "/settings": "Settings",
  "/admin/users": "User Management",
  "/task-board": "Task Board",
  "/pos": "Point of Sale",
  "/profile": "Profile",
}

// All searchable pages for command palette
const searchablePages = Object.entries(pageTitles)
  .map(([href, title]) => ({ href, title }))
  .sort((a, b) => a.title.localeCompare(b.title, "en"))

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname]
  for (const [route, title] of Object.entries(pageTitles)) {
    if (pathname.startsWith(route + "/")) return title
  }
  return "Stokora WMS"
}

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const { setTheme, theme } = useTheme()
  const { user, signOut } = useAuth()
  const title = getPageTitle(pathname)

  // Command palette state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)

  // Keyboard shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchRef.current?.focus(), 50)
    } else {
      setSearchQuery("")
    }
  }, [searchOpen])

  const filteredPages = searchQuery.trim()
    ? searchablePages.filter((p) =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 8)
    : searchablePages.slice(0, 8)

  const initials = user?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "WM"

  return (
    <header className="relative z-40 shrink-0 border-b bg-background">
      <div className="flex min-h-14 items-center gap-2 px-3 sm:gap-4 md:px-6">
        <Link href="/dashboard" aria-label="Stokora dashboard" className="shrink-0">
          <StokoraLogo size="sm" />
        </Link>
        {/* Page title */}
        <h1 className="text-base font-semibold truncate min-w-0 flex-1">{title}</h1>

        {/* Search button */}
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:flex items-center gap-2 text-muted-foreground h-8 w-56 justify-start"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="text-xs">Search...</span>
          <kbd className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
            <Command className="inline h-2.5 w-2.5" />K
          </kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          aria-label="Search pages"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>

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

          {/* Account menu */}
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Account menu" className="flex items-center justify-center rounded-full p-1 hover:bg-accent transition-colors">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 max-w-[200px]">
                <p className="text-sm font-medium truncate">{user?.full_name || "User"}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <WorkspaceNavigation />

      {/* Command Palette / Search Dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0">
          <DialogTitle className="sr-only">Search pages</DialogTitle>
          <div className="flex items-center border-b px-3">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search pages..."
              className="border-0 focus-visible:ring-0 h-11"
              onKeyDown={(e) => {
                if (e.key === "Enter" && filteredPages.length > 0) {
                  router.push(filteredPages[0].href)
                  setSearchOpen(false)
                }
                if (e.key === "Escape") setSearchOpen(false)
              }}
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filteredPages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No results</p>
            ) : (
              filteredPages.map((page) => (
                <button
                  key={page.href}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                  onClick={() => {
                    router.push(page.href)
                    setSearchOpen(false)
                  }}
                >
                  <span className="font-medium">{page.title}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{page.href}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </header>
  )
}
