import Link from 'next/link';
import {
  BookOpen, Monitor, Globe, Settings, BarChart3,
  ShieldCheck, Package, ScanBarcode, CreditCard, Users, Warehouse,
  ArrowRight, ChevronRight, HelpCircle, Zap,
} from 'lucide-react';

export const metadata = { title: 'User Guide | Stokora WMS' };

const sections = [
  {
    id: 'getting-started',
    title: '1. Getting Started',
    icon: BookOpen,
    content: [
      {
        subtitle: 'System Requirements',
        items: [
          'Browser: Chrome, Edge, Safari, or Firefox (latest versions)',
          'Scanner devices: Any device with a modern browser (iOS/Android tablets, handheld scanners)',
          'Internet: Stable connection required (cloud-based system)',
        ],
      },
      {
        subtitle: 'Accessing Stokora WMS',
        steps: [
          'Navigate to your Stokora WMS URL (provided by your administrator)',
          'Enter your email and password',
          'Click Sign In',
        ],
        note: 'First-time users will be redirected to the Onboarding Wizard automatically.',
      },
      {
        subtitle: 'User Roles',
        table: {
          headers: ['Role', 'Access Level'],
          rows: [
            ['Admin', 'Full access \u2014 settings, users, billing, all modules'],
            ['Manager', 'Operations \u2014 inventory, orders, reports, shipping'],
            ['Staff', 'Day-to-day \u2014 receiving, picking, scanning, cycle counts'],
          ],
        },
      },
    ],
  },
  {
    id: 'initial-setup',
    title: '2. Initial Setup',
    icon: Settings,
    content: [
      {
        subtitle: 'Onboarding Wizard',
        note: 'When you first log in, the onboarding wizard guides you through 5 steps:',
        steps: [
          'Company Info \u2014 Enter your company name and address',
          'Warehouse Locations \u2014 Define your storage areas (aisles, shelves, bins)',
          'Products \u2014 Add your first products or import via CSV',
          'Suppliers \u2014 Add your key suppliers',
          'Review \u2014 Confirm everything looks correct',
        ],
      },
      {
        subtitle: 'Importing Data',
        note: 'Go to Import/Export in the sidebar to bulk-import:',
        items: [
          'Products \u2014 CSV with columns: SKU, Name, Category, Cost, Price, UOM',
          'Suppliers \u2014 CSV with columns: Name, Contact, Email, Phone',
          'Customers \u2014 CSV with columns: Name, Contact, Email, Ship-To Address',
        ],
      },
    ],
  },
  {
    id: 'dashboard',
    title: '3. Dashboard Overview',
    icon: Monitor,
    content: [
      {
        subtitle: 'Your Home Screen',
        items: [
          'Key metrics \u2014 Total products, active lots, low stock alerts, expiring items',
          'Quick actions \u2014 Receive, Ship, Scan, Cycle Count',
          'Recent activity \u2014 Latest stock movements and orders',
          'Alerts \u2014 Low stock warnings, expiring lots, pending orders',
        ],
      },
      {
        subtitle: 'Dashboard Presets',
        items: [
          'Lite \u2014 Simplified view for small operations',
          '3PL \u2014 Multi-client focused with customer columns',
          'Full \u2014 All modules and analytics visible',
        ],
      },
    ],
  },
  {
    id: 'core-modules',
    title: '4. Core Modules',
    icon: Package,
    content: [
      {
        subtitle: 'Products',
        nav: 'Sidebar \u203a Products',
        items: [
          'Add, edit, and archive products',
          'Each product has: SKU, name, manufacturer, category, cost, price, UOM',
          'Toggle lot tracking and serial tracking per product',
          'Set low stock thresholds and expiry alert days',
          'Storage requirements: Room Temp, Refrigerated, or Frozen',
        ],
      },
      {
        subtitle: 'Suppliers',
        nav: 'Sidebar \u203a Suppliers',
        items: [
          'Manage your supplier directory',
          'Store contact info, account numbers, and notes',
          'Link suppliers to products for reorder tracking',
        ],
      },
      {
        subtitle: 'Customers',
        nav: 'Sidebar \u203a Customers',
        items: [
          'Customer directory with contact info and shipping addresses',
          'License tracking (type, number, expiration) for regulated industries',
          'View order history per customer',
        ],
      },
      {
        subtitle: 'Lots',
        nav: 'Sidebar \u203a Lots',
        items: [
          'View all inventory lots with quantities, locations, and expirations',
          'Color-coded expiration status (green/yellow/red)',
          'Filter by product, location, or expiration window',
          'Click any lot to see full movement history',
        ],
      },
      {
        subtitle: 'Stock Movements',
        nav: 'Sidebar \u203a Movements',
        items: [
          'Complete audit trail of every inventory change',
          'Filter by product, lot, user, date range, or movement type',
          'Movements are immutable \u2014 they cannot be edited or deleted',
          'Export full audit log to CSV',
        ],
      },
    ],
  },
  {
    id: 'warehouse-operations',
    title: '5. Warehouse Operations',
    icon: Warehouse,
    content: [
      {
        subtitle: 'Receiving',
        nav: 'Sidebar \u203a Receive',
        steps: [
          'Select a Purchase Order or start a blind receive',
          'Scan or enter the product barcode/SKU',
          'Enter lot number, quantity, and expiration date',
          'Assign a bin location',
          'Click Receive \u2014 inventory is updated immediately',
        ],
      },
      {
        subtitle: 'Put-Away',
        nav: 'Sidebar \u203a Put-Away',
        items: [
          'System suggests optimal bin locations based on product category and available space',
          'Confirm or override the suggested location',
          'Scan the bin barcode to verify placement',
        ],
      },
      {
        subtitle: 'Picking & Shipping',
        nav: 'Sidebar \u203a Ship',
        steps: [
          'Select a sales order to pick',
          'System suggests lots using FEFO (First Expired, First Out)',
          'Scan each item to confirm picks',
          'Expired lots are automatically skipped (override requires logged reason)',
          'Generate packing slip (PDF) and ship',
        ],
      },
      {
        subtitle: 'Wave Picking',
        nav: 'Sidebar \u203a Wave Picking',
        items: [
          'Group multiple orders into a single pick wave',
          'Optimized pick path by location',
          'Reduce warehouse trips for batch fulfillment',
        ],
      },
      {
        subtitle: 'Cycle Counts',
        nav: 'Sidebar \u203a Cycle Counts',
        steps: [
          'Create a new count \u2014 select products/locations to count',
          'Enter actual quantities found',
          'Review variance report',
          'Post adjustments \u2014 system creates adjustment movements automatically',
        ],
      },
      {
        subtitle: 'Transfers',
        nav: 'Sidebar \u203a Transfers',
        items: [
          'Move inventory between warehouse locations',
          'Track in-transit quantities',
          'Full movement audit trail for each transfer',
        ],
      },
      {
        subtitle: 'Bin Management',
        nav: 'Sidebar \u203a Bins',
        items: [
          'Define bin locations with min/max quantities',
          'View bin inventory at a glance',
          'Replenishment alerts when bins fall below minimum',
        ],
      },
    ],
  },
  {
    id: 'scanner',
    title: '6. Scanner App',
    icon: ScanBarcode,
    content: [
      {
        subtitle: 'Mobile-Optimized Interface',
        nav: 'URL: /scan',
        items: [
          'Full screen \u2014 no desktop sidebar or header',
          'Large buttons \u2014 designed for gloved hands',
          'Camera scanning \u2014 use your device camera as a barcode scanner',
          'Quick actions \u2014 Receive, Pick, Count, Move, Lookup',
          'Offline-friendly \u2014 queues scans when connection drops',
        ],
      },
      {
        subtitle: 'Setting Up a Scanner Device',
        steps: [
          'Open your Stokora URL + /scan in the device browser',
          'Log in with a Staff account',
          'Add to home screen for app-like experience',
        ],
      },
    ],
  },
  {
    id: 'pos',
    title: '7. Point of Sale',
    icon: CreditCard,
    content: [
      {
        subtitle: 'Walk-In Sales',
        nav: 'URL: /pos',
        items: [
          'Product lookup by scan or search',
          'Add items to cart with quantity',
          'Apply discounts',
          'Process payments via Stripe (card)',
          'Print receipts',
          'All POS sales create stock movements automatically',
        ],
      },
    ],
  },
  {
    id: 'portal',
    title: '8. Customer Portal',
    icon: Globe,
    content: [
      {
        subtitle: 'Self-Service Access',
        nav: 'URL: /portal',
        items: [
          'View order history',
          'Track shipment status',
          'Download invoices and packing slips',
          'View product availability',
        ],
      },
      {
        subtitle: 'Setting Up Portal Access',
        steps: [
          'Go to Customers \u203a select a customer',
          'Click Invite to Portal',
          'Customer receives an email with login credentials',
          'They access the portal at your URL + /portal',
        ],
      },
    ],
  },
  {
    id: 'billing',
    title: '9. Billing & Subscription',
    icon: CreditCard,
    content: [
      {
        subtitle: 'Plans',
        nav: 'Sidebar \u203a Billing (Admin only)',
        table: {
          headers: ['Plan', 'Price', 'Users', 'Locations', 'Products'],
          rows: [
            ['Starter', '$49/mo', '5', '1', '1,000'],
            ['Professional', '$99/mo', '25', '3', '10,000'],
            ['Enterprise', '$199/mo', 'Unlimited', 'Unlimited', 'Unlimited'],
          ],
        },
      },
      {
        subtitle: 'Managing Your Subscription',
        items: [
          'Click Subscribe on your desired plan',
          'Manage payment method and invoices via the Billing Portal',
          'Upgrade or downgrade at any time \u2014 changes take effect at next billing cycle',
        ],
      },
    ],
  },
  {
    id: 'integrations',
    title: '10. Integrations',
    icon: Zap,
    content: [
      {
        subtitle: 'Shopify',
        items: [
          'Sync products, orders, and inventory with your Shopify store',
          'Automatic inventory updates when stock changes',
          'One-click install from the Shopify App Store',
        ],
      },
      {
        subtitle: 'QuickBooks',
        items: [
          'Sync customers, products, and invoices',
          'Automatic journal entries for inventory adjustments',
        ],
      },
      {
        subtitle: 'Zapier',
        items: [
          'Connect Stokora to 5,000+ apps',
          'Trigger automations on new orders, low stock alerts, and more',
        ],
      },
      {
        subtitle: 'EasyPost Shipping',
        items: [
          'Get real-time shipping rates from multiple carriers',
          'Print shipping labels directly from Stokora',
          'Automatic tracking number updates',
        ],
      },
    ],
  },
  {
    id: 'administration',
    title: '11. Administration',
    icon: Users,
    content: [
      {
        subtitle: 'User Management',
        nav: 'Sidebar \u203a Admin \u203a Users (Admin only)',
        items: [
          'Add users \u2014 enter email, name, and role',
          'Edit roles \u2014 change a user\u2019s access level',
          'Reset passwords \u2014 send a password reset link',
          'Deactivate users \u2014 disable access without deleting',
          'Audit trail \u2014 see when users were created, modified, or deactivated',
        ],
      },
      {
        subtitle: 'Settings',
        nav: 'Sidebar \u203a Settings (Admin only)',
        items: [
          'Company info \u2014 name, address, logo',
          'Feature toggles \u2014 enable/disable modules for your organization',
          'Notification preferences \u2014 configure email alerts',
          'Export data \u2014 download a full CSV export of your data',
        ],
      },
    ],
  },
  {
    id: 'reports',
    title: '12. Reports & Analytics',
    icon: BarChart3,
    content: [
      {
        subtitle: 'Available Reports',
        nav: 'Sidebar \u203a Reports',
        table: {
          headers: ['Report', 'Description'],
          rows: [
            ['Inventory Valuation', 'Current stock value by cost and retail'],
            ['Stock on Hand', 'Quantities by product, lot, and location'],
            ['Expiration Report', 'Items expiring within configurable windows'],
            ['Movement History', 'Full audit trail with filters'],
            ['Sales by Customer', 'Revenue and order volume per customer'],
            ['Low Stock Alert', 'Products below reorder threshold'],
            ['ABC Analysis', 'Classify products by sales velocity (A/B/C)'],
          ],
        },
        note: 'All reports export to CSV with one click.',
      },
      {
        subtitle: 'Analytics Dashboard',
        nav: 'Sidebar \u203a Analytics',
        items: [
          'Inventory trends over time',
          'Top products by movement volume',
          'Expiration risk breakdown',
          'Warehouse utilization metrics',
        ],
      },
    ],
  },
  {
    id: 'compliance',
    title: '13. Compliance',
    icon: ShieldCheck,
    content: [
      {
        subtitle: 'Controlled Substances',
        nav: 'Sidebar \u203a Controlled Substances',
        items: [
          'DEA schedule tracking',
          'Reconciliation workflows with audit trails',
          'Destruction logging',
        ],
      },
      {
        subtitle: 'Recall Management',
        nav: 'Sidebar \u203a Recall / Recall Monitor',
        items: [
          'Enter a lot number to trace all affected customers',
          'Export recall contact lists to CSV',
          'Monitor FDA recall feeds for product matches',
        ],
      },
      {
        subtitle: 'DSCSA / GS1',
        items: [
          'Transaction history tracking',
          'GS1 barcode compliance verification',
          'Serialization support',
        ],
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: '14. Troubleshooting',
    icon: HelpCircle,
    content: [
      {
        subtitle: 'Can\u2019t log in?',
        items: [
          'Check that you\u2019re using the correct URL',
          'Click \u201cForgot Password\u201d on the login page',
          'Contact your admin to verify your account is active',
        ],
      },
      {
        subtitle: 'Barcode scanner not working?',
        items: [
          'Ensure your browser has camera permissions enabled',
          'Try manual entry as a fallback',
          'Clean the barcode label if it\u2019s damaged',
        ],
      },
      {
        subtitle: 'Data not updating?',
        items: [
          'Refresh the page (Ctrl+R / Cmd+R)',
          'Check your internet connection',
          'If the issue persists, contact your administrator',
        ],
      },
      {
        subtitle: 'Missing sidebar items?',
        items: [
          'Some modules are only visible to Admin or Manager roles',
          'Check Settings \u203a Feature Toggles \u2014 some modules may be disabled',
          'Your preset (Lite/3PL/Full) controls which modules appear',
        ],
      },
    ],
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SectionBlock({ block }: { block: any }) {
  return (
    <div className="mb-6">
      {block.subtitle && (
        <h3 className="text-lg font-semibold text-slate-800 mb-2">{block.subtitle}</h3>
      )}
      {block.nav && (
        <p className="text-sm text-emerald-700 font-medium mb-2 flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          {block.nav}
        </p>
      )}
      {block.note && (
        <p className="text-sm text-slate-600 mb-3">{block.note}</p>
      )}
      {block.items && (
        <ul className="space-y-1.5 text-sm text-slate-600">
          {block.items.map((item: string, i: number) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-emerald-500 mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {item}
            </li>
          ))}
        </ul>
      )}
      {block.steps && (
        <ol className="space-y-1.5 text-sm text-slate-600 list-none">
          {block.steps.map((step: string, i: number) => (
            <li key={i} className="flex items-start gap-3">
              <span className="shrink-0 h-5 w-5 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      )}
      {block.table && (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-slate-50">
                {block.table.headers.map((h: string, i: number) => (
                  <th key={i} className="text-left py-2 px-3 font-semibold text-slate-700 border-b">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.table.rows.map((row: string[], i: number) => (
                <tr key={i} className="border-b last:border-0">
                  {row.map((cell: string, j: number) => (
                    <td key={j} className={`py-2 px-3 text-slate-600 ${j === 0 ? 'font-medium text-slate-800' : ''}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <img src="/stokora-logo.png" alt="Stokora WMS" className="h-8" />
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/support" className="text-slate-600 hover:text-slate-900 transition">Support</Link>
            <Link href="/demo" className="text-emerald-600 hover:text-emerald-700 font-semibold transition">Live Demo</Link>
            <Link href="/auth/login" className="text-slate-600 hover:text-slate-900 transition">Sign In</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
            <Link href="/" className="hover:text-slate-700 transition">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-800">User Guide</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">Client Setup &amp; User Guide</h1>
          <p className="text-lg text-slate-500">Everything you need to get started with Stokora WMS.</p>
        </div>

        {/* Table of Contents */}
        <div className="rounded-xl border bg-slate-50/50 p-6 mb-12">
          <h2 className="font-semibold text-slate-800 mb-4">Table of Contents</h2>
          <div className="grid md:grid-cols-2 gap-2">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-700 transition py-1 group"
              >
                <s.icon className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 transition shrink-0" />
                {s.title}
                <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition ml-auto" />
              </a>
            ))}
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-16">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <section.icon className="h-5 w-5 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">{section.title}</h2>
              </div>
              <div className="pl-0 md:pl-[52px]">
                {section.content.map((block, i) => (
                  <SectionBlock key={i} block={block} />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-20 pt-8 border-t text-center text-sm text-slate-400">
          <p>Stokora WMS &mdash; Warehouse management made simple.</p>
          <div className="mt-2 flex items-center justify-center gap-4">
            <Link href="/support" className="hover:text-slate-600 transition">Support</Link>
            <Link href="/legal/privacy" className="hover:text-slate-600 transition">Privacy</Link>
            <Link href="/legal/terms" className="hover:text-slate-600 transition">Terms</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
