"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChevronDown,
  Menu,
  Star,
  AlertTriangle,
  ArrowLeftRight,
  ArrowRightLeft,
  ArrowUpDown,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  DollarSign,
  FileText,
  Globe,
  Grid3X3,
  Handshake,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Package,
  PackageOpen,
  PackagePlus,
  Plug,
  RefreshCw,
  RotateCcw,
  Ruler,
  ScanBarcode,
  ScanLine,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tag,
  Timer,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
  Zap,
} from "lucide-react"
import { useAuth } from "@/components/providers/auth-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { isSectionVisible } from "@/lib/presets"
import { cn } from "@/lib/utils"

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; module?: string }

interface NavSection {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Metrics", href: "/metrics", icon: BarChart3 },
      { label: "Analytics", href: "/analytics", icon: TrendingUp },
    ],
  },
  {
    title: "Inventory",
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

const alphabetical = new Intl.Collator("en", { sensitivity: "base" })
const sectionsByTitle = navSections
  .map((section) => ({
    ...section,
    items: [...section.items].sort((a, b) => alphabetical.compare(a.label, b.label)),
  }))
  .sort((a, b) => alphabetical.compare(a.title, b.title))

const isCurrentPage = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + "/")

export function WorkspaceNavigation() {
  const pathname = usePathname()
  const { role, preset, enabledModules } = useAuth()
  const [favorites, setFavorites] = useState<string[]>([])
  const hasModuleSettings = Object.keys(enabledModules).length > 0

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem("wms_favorites") ?? "[]")
      if (Array.isArray(stored)) {
        setFavorites(stored.filter((value): value is string => typeof value === "string"))
      }
    } catch {
      // Navigation is still available when browser storage is disabled.
    }
  }, [])

  const sections = sectionsByTitle
    .filter(({ title }) => (title !== "Admin" || role === "admin") && isSectionVisible(title, preset))
    .map(({ title, items }) => ({
      title,
      items: items.filter(({ module }) => !module || !hasModuleSettings || enabledModules[module]),
    }))
    .filter(({ items }) => items.length > 0)
  const visibleItems = sections.flatMap(({ items }) => items)
  const favoriteItems = visibleItems
    .filter(({ href }) => favorites.includes(href))
    .sort((a, b) => alphabetical.compare(a.label, b.label))
  const currentItem = visibleItems.find(({ href }) => href === pathname)
  const menus = [...sections, { title: "Favorites", items: favoriteItems }]
    .sort((a, b) => alphabetical.compare(a.title, b.title))
  const favoriteAction = currentItem && (favorites.includes(currentItem.href) ? "Remove this page" : "Save this page")

  function toggleCurrentFavorite() {
    if (!currentItem) return
    const { href } = currentItem
    const next = favorites.includes(href)
      ? favorites.filter((favorite) => favorite !== href)
      : [...favorites, href]
    setFavorites(next)
    try {
      localStorage.setItem("wms_favorites", JSON.stringify(next))
    } catch {
      // Favorites remain usable for the current session.
    }
  }

  return (
    <>
      <nav aria-label="Workspace navigation" className="hidden flex-wrap gap-x-0.5 gap-y-0.5 border-t px-4 py-1 xl:flex">
        {menus.map(({ title, items }) => {
          const active = items.some(({ href }) => isCurrentPage(pathname, href))
          return (
            <DropdownMenu key={title}>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex min-h-9 items-center gap-1 rounded-md px-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active && "bg-accent text-foreground",
                )}
              >
                {title}
                <ChevronDown aria-hidden="true" className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-48">
                {items.map(({ href, label, icon: Icon }) => (
                  <DropdownMenuItem asChild key={href}>
                    <Link
                      href={href}
                      aria-current={pathname === href ? "page" : undefined}
                      className="aria-[current=page]:font-semibold"
                    >
                      <Icon aria-hidden="true" className="size-4" />
                      {label}
                    </Link>
                  </DropdownMenuItem>
                ))}
                {title === "Favorites" && (
                  <>
                    {items.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">No saved pages</p>}
                    {favoriteAction && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={toggleCurrentFavorite}>
                          <Star aria-hidden="true" className="size-4" />
                          {favoriteAction}
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        })}
      </nav>
      <div className="border-t px-3 py-1 xl:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="Workspace menu">
              <Menu aria-hidden="true" className="size-4" />
              Menu
            </Button>
          </SheetTrigger>
          <SheetContent side="top" className="max-h-[80dvh] overflow-y-auto p-5" aria-describedby={undefined}>
            <SheetTitle>Workspace menu</SheetTitle>
            <nav aria-label="Workspace navigation" className="mt-4 divide-y border-y">
              {menus.map(({ title, items }) => (
                <details key={title} className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                    {title}
                    <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground group-open:rotate-180" />
                  </summary>
                  <ul className="space-y-1 pb-3">
                    {items.map(({ href, label, icon: Icon }) => (
                      <li key={href}>
                        <SheetClose asChild>
                          <Link
                            href={href}
                            aria-current={pathname === href ? "page" : undefined}
                            className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-semibold"
                          >
                            <Icon aria-hidden="true" className="size-4" />
                            {label}
                          </Link>
                        </SheetClose>
                      </li>
                    ))}
                    {title === "Favorites" && items.length === 0 && (
                      <li className="px-3 py-2 text-sm text-muted-foreground">No saved pages</li>
                    )}
                    {title === "Favorites" && favoriteAction && (
                      <li>
                        <Button type="button" variant="ghost" size="sm" onClick={toggleCurrentFavorite}>
                          <Star aria-hidden="true" className="size-4" />
                          {favoriteAction}
                        </Button>
                      </li>
                    )}
                  </ul>
                </details>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
