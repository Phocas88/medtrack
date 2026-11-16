"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Package,
  Layers,
  PackagePlus,
  Truck,
  Users,
  Building2,
  BarChart3,
  AlertTriangle,
  Settings,
  LogOut,
  ArrowLeftRight,
  LayoutGrid,
  ClipboardList,
  RotateCcw,
  PackageOpen,
  Warehouse,
  ArrowRightLeft,
  ClipboardCheck,
  ShieldCheck,
  FileText,
  Bell,
  DollarSign,
  Boxes,
  RefreshCw,
  TrendingUp,
  Shield,
  Clock,
  Handshake,
  Timer,
  ScrollText,
  CalendarDays,
  ScanLine,
  ListChecks,
  Globe,
  Grid3X3,
  Smartphone,
  Plug,
  ArrowUpDown,
  Ruler,
  ShieldAlert,
  ScanBarcode,
  CreditCard,
  Zap,
  ChevronDown,
  Tag,
  Star,
} from "lucide-react"
import { useAuth } from "@/components/providers/auth-provider"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { StokoraNavigationLogo } from "@/components/ui/stokora-logo"
import { isSectionVisible } from "@/lib/presets"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; module?: string }

interface NavSection {
  title: string
  items: NavItem[]
  defaultOpen?: boolean
}

const navSections: NavSection[] = [
  {
    title: "Overview",
    defaultOpen: true,
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Metrics", href: "/metrics", icon: BarChart3 },
      { label: "Analytics", href: "/analytics", icon: TrendingUp },
    ],
  },
  {
    title: "Inventory",
    defaultOpen: true,
    items: [
      { label: "Products", href: "/products", icon: Package },
      { label: "Lots & Serials", href: "/lots", icon: Layers },
      { label: "Stock Movements", href: "/movements", icon: ArrowLeftRight },
      { label: "Product Matrix", href: "/product-matrix", icon: LayoutGrid },
      { label: "Units & Parts", href: "/uom", icon: Ruler },
      { label: "Expiration", href: "/expiration", icon: Timer },
      { label: "Custom Fields", href: "/custom-fields", icon: Timer },
    ],
  },
  {
    title: "Orders & Fulfillment",
    items: [
      { label: "Work Orders", href: "/work-orders", icon: ClipboardList },
      { label: "Services", href: "/services", icon: Boxes },
      { label: "Purchase Orders", href: "/purchase-orders", icon: ClipboardList },
      { label: "Receive", href: "/receive", icon: PackagePlus },
      { label: "Put-Away", href: "/put-away", icon: PackageOpen },
      { label: "Wave Picking", href: "/wave-picking", icon: Layers },
      { label: "Ship", href: "/ship", icon: Truck },
      { label: "Returns", href: "/returns", icon: RotateCcw },
      { label: "Reorder", href: "/reorder", icon: RefreshCw },
    ],
  },
  {
    title: "Warehouse",
    items: [
      { label: "Locations", href: "/locations", icon: Warehouse },
      { label: "Bins", href: "/bins", icon: Grid3X3 },
      { label: "Transfers", href: "/transfers", icon: ArrowRightLeft },
      { label: "Cross-Dock", href: "/cross-dock", icon: ArrowRightLeft },
      { label: "Dock Schedule", href: "/dock-scheduling", icon: CalendarDays },
      { label: "Cycle Counts", href: "/cycle-counts", icon: ClipboardCheck },
      { label: "Quarantine", href: "/quarantine", icon: ShieldCheck },
      { label: "Scanner", href: "/scanner", icon: Smartphone },
      { label: "Task Board", href: "/task-board", icon: ClipboardList },
      { label: "Kitting", href: "/kitting", icon: Boxes, module: "kitting" },
      { label: "Consignment", href: "/consignment", icon: Handshake, module: "consignment" },
    ],
  },
  {
    title: "Sales & Customers",
    items: [
      { label: "Customers", href: "/customers", icon: Users },
      { label: "Pricing", href: "/pricing", icon: DollarSign },
      { label: "Promotions", href: "/promotions", icon: Tag },
      { label: "Customer Portal", href: "/customer-portal", icon: Globe },
    ],
  },
  {
    title: "Suppliers",
    items: [
      { label: "Suppliers", href: "/suppliers", icon: Building2 },
      { label: "Documents", href: "/documents", icon: FileText },
    ],
  },
  {
    title: "Compliance",
    items: [
      { label: "Audit Trail", href: "/audit", icon: ScanLine },
      { label: "Compliance Reports", href: "/compliance", icon: ListChecks },
      { label: "Controlled Substances", href: "/controlled-substances", icon: Shield, module: "controlled_substances" },
      { label: "DSCSA", href: "/dscsa", icon: ScrollText, module: "dscsa_tracking" },
      { label: "Prop 65", href: "/prop65", icon: AlertTriangle },
      { label: "Recall Monitor", href: "/recall-monitor", icon: ShieldAlert },
      { label: "GS1 Compliance", href: "/gs1-compliance", icon: ScanBarcode },
    ],
  },
  {
    title: "Tools & Reports",
    items: [
      { label: "Reports", href: "/reports", icon: BarChart3 },
      { label: "ABC Analysis", href: "/abc-analysis", icon: BarChart3 },
      { label: "Labor", href: "/labor", icon: Clock },
      { label: "Slotting", href: "/slotting", icon: ArrowUpDown },
      { label: "Import / Export", href: "/import-export", icon: ArrowUpDown },
      { label: "Recall Lookup", href: "/recall", icon: AlertTriangle },
      { label: "Notifications", href: "/notifications", icon: Bell },
    ],
  },
  {
    title: "Integrations",
    items: [
      { label: "Shopify", href: "/integrations/shopify", icon: Plug },
      { label: "QuickBooks", href: "/integrations/quickbooks", icon: Plug },
      { label: "Zapier", href: "/integrations/zapier", icon: Zap },
      { label: "Billing", href: "/billing", icon: CreditCard },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "User Management", href: "/admin/users", icon: Users },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
]

function CollapsibleNavSection({
  section,
  pathname,
  enabledModules,
  favorites,
  onToggleFavorite,
}: {
  section: NavSection
  pathname: string
  enabledModules?: Record<string, boolean>
  favorites?: string[]
  onToggleFavorite?: (href: string) => void
}) {
  const hasModuleConfig = enabledModules && Object.keys(enabledModules).length > 0

  const filteredItems = section.items.filter((item) => {
    if (!item.module) return true
    if (!hasModuleConfig) return true
    return enabledModules![item.module] === true
  })

  const hasActiveChild = filteredItems.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  )

  const [open, setOpen] = useState(section.defaultOpen || hasActiveChild)

  if (filteredItems.length === 0) return null

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
        {section.title}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 mt-0.5">
          {filteredItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            const isFav = favorites?.includes(item.href)
            return (
              <div key={item.href} className="group flex items-center">
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
                {onToggleFavorite && (
                  <button
                    aria-label={`${isFav ? "Remove" : "Add"} ${item.label} ${isFav ? "from" : "to"} favorites`}
                    aria-pressed={!!isFav}
                    onClick={() => onToggleFavorite(item.href)}
                    className={cn(
                      "shrink-0 p-1 rounded transition-opacity",
                      isFav ? "opacity-100" : "opacity-0 group-hover:opacity-50 focus-visible:opacity-100 hover:!opacity-100"
                    )}
                  >
                    <Star className={cn("h-3 w-3", isFav ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem('wms_favorites')
      if (stored) setFavorites(JSON.parse(stored))
    } catch {}
  }, [])

  const toggle = (href: string) => {
    setFavorites((prev) => {
      const next = prev.includes(href) ? prev.filter((f) => f !== href) : [...prev, href]
      localStorage.setItem('wms_favorites', JSON.stringify(next))
      return next
    })
  }

  return { favorites, toggle }
}

function SidebarContent() {
  const pathname = usePathname()
  const { user, enabledModules, role, preset, signOut } = useAuth()
  const { favorites, toggle: toggleFavorite } = useFavorites()

  const initials = user?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'WM'

  // Get favorite items from all sections
  const allItems = navSections.flatMap((s) => s.items)
  const favoriteItems = favorites.map((href) => allItems.find((i) => i.href === href)).filter(Boolean) as NavItem[]

  // Filter sections by preset + role
  const sections = navSections.filter((s) => {
    if (s.title === "Admin" && role !== "admin") return false
    if (!isSectionVisible(s.title, preset)) return false
    return true
  })

  return (
    <div className="workspace-nav flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-20 shrink-0 items-center border-b border-white/10 px-5">
        <Link href="/dashboard" aria-label="Stokora dashboard"><StokoraNavigationLogo /></Link>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-2 py-2">
        <nav className="flex flex-col gap-1">
          {/* Favorites */}
          {favoriteItems.length > 0 && (
            <div className="mb-1">
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-600 flex items-center gap-1">
                <Star className="h-3 w-3 fill-amber-500" /> Favorites
              </p>
              <div className="flex flex-col gap-0.5">
                {favoriteItems.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {sections.map((section) => (
            <CollapsibleNavSection
              key={section.title}
              section={section}
              pathname={pathname}
              enabledModules={enabledModules}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </nav>
      </ScrollArea>

      {/* User Menu */}
      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start text-left min-w-0 flex-1">
              <span className="text-sm font-medium leading-none truncate w-full">{user?.full_name || 'User'}</span>
              <span className="text-xs text-muted-foreground leading-none mt-0.5 truncate w-full">{user?.email || ''}</span>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <Users className="mr-2 h-4 w-4" />
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
  )
}

export function WorkspaceNavigation() {
  const pathname = usePathname()
  const { role, preset, enabledModules } = useAuth()
  const hasModuleConfig = Object.keys(enabledModules || {}).length > 0
  const sections = navSections.filter(section =>
    (section.title !== "Admin" || role === "admin") && isSectionVisible(section.title, preset)
  )
  return (
    <div className="hidden shrink-0 items-center gap-5 border-b bg-card px-5 md:flex">
      <Link href="/dashboard" aria-label="Stokora dashboard" className="shrink-0"><StokoraNavigationLogo /></Link>
      <nav aria-label="Main navigation" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {sections.map(section => {
          const items = section.items.filter(item => !item.module || !hasModuleConfig || enabledModules?.[item.module])
          if (!items.length) return null
          const active = items.some(item => pathname === item.href || pathname.startsWith(item.href + "/"))
          return <DropdownMenu key={section.title}>
            <DropdownMenuTrigger className={cn("flex min-h-14 shrink-0 items-center gap-1 whitespace-nowrap border-b-2 px-3 text-xs font-medium", active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>{section.title}<ChevronDown className="h-3 w-3" /></DropdownMenuTrigger>
            <DropdownMenuContent align="start">{items.map(item => <DropdownMenuItem key={item.href} asChild><Link href={item.href} aria-current={pathname === item.href ? "page" : undefined}><item.icon className="mr-2 h-4 w-4" />{item.label}</Link></DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
        })}
      </nav>
    </div>
  )
}

interface MobileSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileSidebar({ open, onOpenChange }: MobileSidebarProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="workspace-theme w-64 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarContent />
      </SheetContent>
    </Sheet>
  )
}
