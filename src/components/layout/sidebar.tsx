"use client"

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
} from "lucide-react"
import { useAuth } from "@/components/providers/auth-provider"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
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

const mainNavItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Analytics", href: "/analytics", icon: TrendingUp },
  { label: "Products", href: "/products", icon: Package },
  { label: "Units & Parts", href: "/uom", icon: Ruler },
  { label: "Lots", href: "/lots", icon: Layers },
  { label: "Movements", href: "/movements", icon: ArrowLeftRight },
  { label: "Product Matrix", href: "/product-matrix", icon: LayoutGrid },
]

const operationNavItems = [
  { label: "Purchase Orders", href: "/purchase-orders", icon: ClipboardList },
  { label: "Receive", href: "/receive", icon: PackagePlus },
  { label: "Put-Away", href: "/put-away", icon: PackageOpen },
  { label: "Wave Picking", href: "/wave-picking", icon: Layers },
  { label: "Ship", href: "/ship", icon: Truck },
  { label: "Cross-Dock", href: "/cross-dock", icon: ArrowRightLeft },
  { label: "Dock Schedule", href: "/dock-scheduling", icon: CalendarDays },
  { label: "Returns", href: "/returns", icon: RotateCcw },
  { label: "Reorder", href: "/reorder", icon: RefreshCw },
]

const warehouseNavItems = [
  { label: "Locations", href: "/locations", icon: Warehouse },
  { label: "Transfers", href: "/transfers", icon: ArrowRightLeft },
  { label: "Cycle Counts", href: "/cycle-counts", icon: ClipboardCheck },
  { label: "Quarantine", href: "/quarantine", icon: ShieldCheck },
  { label: "Kitting", href: "/kitting", icon: Boxes },
  { label: "Bins", href: "/bins", icon: Grid3X3 },
  { label: "Scanner", href: "/scanner", icon: Smartphone },
  { label: "Consignment", href: "/consignment", icon: Handshake },
  { label: "Expiration", href: "/expiration", icon: Timer },
]

const managementNavItems = [
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Suppliers", href: "/suppliers", icon: Building2 },
  { label: "Pricing", href: "/pricing", icon: DollarSign },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Customer Portal", href: "/customer-portal", icon: Globe },
]

const complianceNavItems = [
  { label: "Controlled Substances", href: "/controlled-substances", icon: Shield },
  { label: "DSCSA", href: "/dscsa", icon: ScrollText },
  { label: "Prop 65", href: "/prop65", icon: AlertTriangle },
  { label: "Recall Monitor", href: "/recall-monitor", icon: ShieldAlert },
  { label: "GS1 Compliance", href: "/gs1-compliance", icon: ScanBarcode },
  { label: "Compliance", href: "/compliance", icon: ListChecks },
  { label: "Audit Trail", href: "/audit", icon: ScanLine },
]

const toolsNavItems = [
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Labor", href: "/labor", icon: Clock },
  { label: "Slotting", href: "/slotting", icon: ArrowUpDown },
  { label: "ABC Analysis", href: "/abc-analysis", icon: BarChart3 },
  { label: "Import / Export", href: "/import-export", icon: ArrowUpDown },
  { label: "Recall Lookup", href: "/recall", icon: AlertTriangle },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Integrations", href: "/integrations/quickbooks", icon: Plug },
  { label: "Custom Fields", href: "/custom-fields", icon: Timer },
  { label: "Settings", href: "/settings", icon: Settings },
]

interface NavSectionProps {
  items: typeof mainNavItems
  pathname: string
}

function NavSection({ items, pathname }: NavSectionProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}

function SidebarContent() {
  const pathname = usePathname()
  const { user, tenantName, signOut } = useAuth()

  const initials = user?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'MT'

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Package className="h-4 w-4" />
        </div>
        <span className="text-lg font-semibold tracking-tight">{tenantName || 'TrackFlow'}</span>
      </div>

      <Separator />

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-3">
        <nav className="flex flex-col gap-4">
          <NavSection items={mainNavItems} pathname={pathname} />
          <Separator />
          <NavSection items={operationNavItems} pathname={pathname} />
          <Separator />
          <NavSection items={warehouseNavItems} pathname={pathname} />
          <Separator />
          <NavSection items={managementNavItems} pathname={pathname} />
          <Separator />
          <NavSection items={complianceNavItems} pathname={pathname} />
          <Separator />
          <NavSection items={toolsNavItems} pathname={pathname} />
        </nav>
      </ScrollArea>

      <Separator />

      {/* User Menu */}
      <div className="p-3">
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

export function Sidebar() {
  return (
    <aside className="hidden md:flex h-screen w-64 flex-col border-r bg-background">
      <SidebarContent />
    </aside>
  )
}

interface MobileSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileSidebar({ open, onOpenChange }: MobileSidebarProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarContent />
      </SheetContent>
    </Sheet>
  )
}
