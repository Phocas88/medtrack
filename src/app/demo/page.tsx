'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StokoraLogo } from '@/components/ui/stokora-logo';
import { toast } from 'sonner';
import {
  Package, Loader2, Monitor, Smartphone, ShoppingCart, Globe, ArrowRight,
  BarChart3, ShieldCheck, Warehouse, ScanBarcode, CreditCard,
  Layers, Truck, Tag, Zap,
  Target, Send, CheckCircle2,
} from 'lucide-react';

const DEMO_CREDS: Record<string, { email: string; password: string; redirect: string }> = {
  manager: { email: 'demo@phocas-wms.com', password: 'demo1234!', redirect: '/dashboard' },
  associate: { email: 'associate@phocas-wms.com', password: 'demo1234!', redirect: '/scan' },
  cashier: { email: 'cashier@phocas-wms.com', password: 'demo1234!', redirect: '/pos' },
  customer: { email: 'buyer@metrogrocery.com', password: 'demo1234!', redirect: '/portal' },
};

const ROLES = [
  {
    key: 'manager', icon: Monitor, title: 'Management Desktop',
    subtitle: 'Directors, Operations, IT',
    description: 'Full system — dashboard, metrics, inventory, orders, compliance, team management, analytics, billing.',
    color: 'border-blue-500/50 hover:border-blue-500', iconColor: 'text-blue-500', bgColor: 'bg-blue-500/10',
  },
  {
    key: 'associate', icon: Smartphone, title: 'Floor / Warehouse Associate',
    subtitle: 'Handheld scanner device',
    description: 'Task queue, barcode scanning, pick/putaway/replenish/cycle count workflows, product locator, daily KPIs.',
    color: 'border-green-500/50 hover:border-green-500', iconColor: 'text-green-500', bgColor: 'bg-green-500/10',
  },
  {
    key: 'cashier', icon: ShoppingCart, title: 'Cashier Register',
    subtitle: 'Point of sale terminal',
    description: 'Scan checkout, payment types (card/cash/check), tax calc, discounts, hold/recall, sale promotions, receipts.',
    color: 'border-amber-500/50 hover:border-amber-500', iconColor: 'text-amber-500', bgColor: 'bg-amber-500/10',
  },
  {
    key: 'customer', icon: Globe, title: 'Customer Portal',
    subtitle: 'B2B partner self-service',
    description: 'Browse catalog, negotiated pricing, place orders, order history, shipment tracking.',
    color: 'border-purple-500/50 hover:border-purple-500', iconColor: 'text-purple-500', bgColor: 'bg-purple-500/10',
  },
];

const FEATURE_SECTIONS = [
  {
    title: 'Inventory Management',
    icon: Package,
    features: ['Product catalog with images, SKU, UPC', 'Lot & serial number tracking', 'FEFO/FIFO picking enforcement', 'Expiration management & alerts', 'Multi-location warehouse support', 'UOM conversions & multi-part products', 'Custom fields per product', 'ABC analysis & velocity ranking'],
  },
  {
    title: 'Warehouse Operations',
    icon: Warehouse,
    features: ['Purchase order management', 'Receiving & put-away workflows', 'Wave / batch picking', 'Cross-docking & dock scheduling', 'Bin management (primary + secondary)', 'Min/max replenishment triggers', 'Cycle counting with variance posting', 'Quarantine & QA release', 'Kitting & BOM assembly', 'Transfers between locations'],
  },
  {
    title: 'Mobile Scanner',
    icon: ScanBarcode,
    features: ['Standalone handheld device UI', 'Task-based workflows (pick, putaway, replenish, count)', 'Barcode scanning with camera', 'Product locator — aisle, section, bin', 'Real-time task assignment from managers', 'Associate KPI tracking (tasks/hour, accuracy)', 'Works offline-ready as PWA'],
  },
  {
    title: 'Point of Sale',
    icon: CreditCard,
    features: ['Barcode scanning checkout', 'Payment types: card, cash, check', 'Automatic tax calculation', 'Order-level & item-level discounts', 'Hold / recall transactions', 'Product search by name or category', 'Sale promotions auto-applied', 'Change calculation for cash', 'Transaction history & daily count', 'Customer name association'],
  },
  {
    title: 'Orders & Fulfillment',
    icon: Truck,
    features: ['Sales orders with line items', 'Work orders — parts + labor + technician assignment', 'Services catalog with pricing & estimated time', 'Dropship orders — auto-PO to supplier with customer ship-to', 'Returns / RMA processing', 'Auto-PO generation — one click emails vendors', 'Customer portal self-service ordering', 'PDF invoices for work orders & shipments', 'Consignment inventory at customer sites'],
  },
  {
    title: 'Compliance & Regulatory',
    icon: ShieldCheck,
    features: ['Immutable audit trail', 'DEA controlled substances (Schedules II-V)', 'DSCSA serialization & verification', 'California Proposition 65 tracking', 'FDA & CPSC recall monitoring', 'GS1 barcode standards', 'Cold chain / temperature monitoring', 'Document management (COA, SDS, licenses)'],
  },
  {
    title: 'Analytics & Metrics',
    icon: BarChart3,
    features: ['Metrics command center (5-tab)', 'Inventory health — stock-outs, low stock, dead stock', 'Sales velocity — top/slow movers', 'Financial — COGS, margins, revenue potential', 'Supplier performance & on-time %', 'Expiration forecasting (FIFO)', 'CSV export on every report'],
  },
  {
    title: 'Retail & Promotions',
    icon: Tag,
    features: ['Schedule sale start/end dates', 'Track markdown loss', 'Promotions auto-applied at POS', 'Online + in-store + wholesale channels', 'Customer pricing tiers', 'Average discount tracking', 'CSV product bulk import'],
  },
  {
    title: 'Platform & Integrations',
    icon: Zap,
    features: ['Shopify integration — products, orders, inventory sync', 'EasyPost shipping — UPS/FedEx/USPS rates, labels, pickup', 'Stripe billing & payment processing', 'QuickBooks accounting sync', 'Zapier (5,000+ app connections)', 'Email notifications via Resend', 'White-label multi-tenancy', 'Role-based access control (RBAC)', 'Module-based feature toggles', 'IT user provisioning (email optional)', 'Password reset flow', 'Sentry error monitoring', 'Rate limiting & CSP security headers'],
  },
];

export default function DemoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({ name: '', email: '', company: '', interest: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleLaunch = async (roleKey: string) => {
    setLoading(roleKey);
    setError(null);
    try {
      await fetch('/api/demo/seed', { method: 'POST' });
      const supabase = createClient();
      await supabase.auth.signOut();
      const creds = DEMO_CREDS[roleKey];
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: creds.email, password: creds.password });
      if (authErr) { setError(`Login failed: ${authErr.message}`); setLoading(null); return; }
      router.push(creds.redirect);
      router.refresh();
    } catch {
      setError('Something went wrong.');
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="text-center pt-12 pb-8 px-4">
        <div className="flex justify-center mb-4"><StokoraLogo theme="light" size="xl" /></div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">Stokora WMS</h1>
        <p className="text-slate-500 mt-2 text-lg">Enterprise warehouse management at a fraction of the cost</p>
        <div className="flex flex-wrap justify-center gap-4 mt-6 text-sm text-slate-500">
          <span className="flex items-center gap-1"><Package className="h-4 w-4 text-blue-400" /> 97 routes</span>
          <span className="flex items-center gap-1"><ShieldCheck className="h-4 w-4 text-green-400" /> 100% WMS compliant</span>
          <span className="flex items-center gap-1"><Layers className="h-4 w-4 text-purple-400" /> 4 separate UIs</span>
          <span className="flex items-center gap-1"><Target className="h-4 w-4 text-amber-400" /> $49-199/mo</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-16 space-y-12">
        {/* Error */}
        {error && (
          <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 text-center">
            {error}
          </div>
        )}

        {/* Try Demo — 4 role cards */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 text-center mb-2">Try the Live Demo</h2>
          <p className="text-slate-500 text-center mb-6 text-sm">Pick a role — each sees only what they need. No signup required.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ROLES.map((role) => {
              const isLoading = loading === role.key;
              return (
                <Card
                  key={role.key}
                  className={`bg-white border-2 shadow-sm ${role.color} transition-all cursor-pointer `}
                  onClick={() => !loading && handleLaunch(role.key)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className={`p-2.5 rounded-xl ${role.bgColor}`}>
                        <role.icon className={`h-5 w-5 ${role.iconColor}`} />
                      </div>
                      {isLoading ? <Loader2 className="h-5 w-5 text-slate-400 animate-spin" /> : <ArrowRight className="h-5 w-5 text-slate-500" />}
                    </div>
                    <CardTitle className="text-slate-900 text-base mt-2">{role.title}</CardTitle>
                    <CardDescription className="text-slate-400 text-[11px] uppercase tracking-wide">{role.subtitle}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-slate-500 leading-relaxed">{role.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Feature Specs */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 text-center mb-2">Complete Feature Set</h2>
          <p className="text-slate-500 text-center mb-6 text-sm">Everything included — no add-ons, no per-module pricing</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURE_SECTIONS.map((section) => (
              <Card key={section.title} className="bg-slate-50 border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-slate-900 text-sm flex items-center gap-2">
                    <section.icon className="h-4 w-4 text-primary" />
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="space-y-1">
                    {section.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-500">
                        <span className="text-green-500 mt-0.5 shrink-0">&#10003;</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* How it maps */}
        <Card className="bg-slate-50 border-slate-200">
          <CardHeader>
            <CardTitle className="text-slate-900 text-base">How it maps to your operation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-700">
              <div className="space-y-3">
                <p><span className="text-blue-400 font-semibold">Management</span> — Store managers, ops directors, IT. Full visibility: inventory levels, metrics, compliance, team performance, promotions, billing. Think: the back office at Walmart corporate.</p>
                <p><span className="text-green-400 font-semibold">Associates</span> — Zebra/Honeywell handheld scanners. Pick orders, restock shelves, count inventory, process receiving. Only see their task queue. Think: Walmart associate with a TC-52.</p>
              </div>
              <div className="space-y-3">
                <p><span className="text-amber-400 font-semibold">Cashiers</span> — Register terminal. Scan items, process payments, apply discounts. Inventory auto-decrements. Think: the self-checkout or staffed lane at Target.</p>
                <p><span className="text-purple-400 font-semibold">Customers</span> — B2B wholesale portal. Partners browse your catalog at their negotiated pricing, place orders, track shipments. Think: how Walgreens orders from McKesson.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Competitive pricing */}
        <Card className="bg-slate-50 border-slate-200">
          <CardHeader>
            <CardTitle className="text-slate-900 text-base">Competitive Pricing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left text-slate-500 py-2 text-xs">System</th>
                    <th className="text-center text-slate-500 py-2 text-xs">Price</th>
                    <th className="text-center text-slate-500 py-2 text-xs">WMS</th>
                    <th className="text-center text-slate-500 py-2 text-xs">POS</th>
                    <th className="text-center text-slate-500 py-2 text-xs">Scanner</th>
                    <th className="text-center text-slate-500 py-2 text-xs">Portal</th>
                    <th className="text-center text-slate-500 py-2 text-xs">Compliance</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  <tr className="border-b border-slate-100"><td className="py-2">Fishbowl</td><td className="text-center">$329+</td><td className="text-center">70%</td><td className="text-center text-red-400">&#10007;</td><td className="text-center text-red-400">&#10007;</td><td className="text-center text-red-400">&#10007;</td><td className="text-center text-red-400">&#10007;</td></tr>
                  <tr className="border-b border-slate-100"><td className="py-2">Cin7</td><td className="text-center">$349+</td><td className="text-center">65%</td><td className="text-center text-amber-400">Partial</td><td className="text-center text-green-400">&#10003;</td><td className="text-center text-amber-400">Partial</td><td className="text-center text-amber-400">Partial</td></tr>
                  <tr className="border-b border-slate-100"><td className="py-2">NetSuite</td><td className="text-center">$999+</td><td className="text-center">85%</td><td className="text-center text-green-400">&#10003;</td><td className="text-center text-green-400">&#10003;</td><td className="text-center text-green-400">&#10003;</td><td className="text-center text-amber-400">Partial</td></tr>
                  <tr className="border-b border-slate-100"><td className="py-2">SAP EWM</td><td className="text-center">$1,500+</td><td className="text-center">95%</td><td className="text-center text-green-400">&#10003;</td><td className="text-center text-green-400">&#10003;</td><td className="text-center text-green-400">&#10003;</td><td className="text-center text-green-400">&#10003;</td></tr>
                  <tr className="bg-green-50 rounded"><td className="py-2 font-bold text-slate-900">Stokora WMS</td><td className="text-center font-bold text-green-400">$49-199</td><td className="text-center text-green-400 font-bold">100%</td><td className="text-center text-green-400">&#10003;</td><td className="text-center text-green-400">&#10003;</td><td className="text-center text-green-400">&#10003;</td><td className="text-center text-green-400">&#10003;</td></tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Contact Form */}
        <Card className="border-primary/20" id="contact">
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-slate-900">Interested in Stokora WMS?</CardTitle>
            <CardDescription>Have questions or ready to get started? Send us a message and we&#39;ll get back to you within 1 business day.</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="text-center py-8">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                <p className="text-lg font-semibold">Message Sent!</p>
                <p className="text-sm text-muted-foreground mt-1">We&#39;ll get back to you shortly.</p>
              </div>
            ) : (
              <form
                className="max-w-lg mx-auto space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!contactForm.name || !contactForm.email || !contactForm.message) {
                    toast.error('Please fill in name, email, and message');
                    return;
                  }
                  setSending(true);
                  try {
                    const res = await fetch('/api/contact', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(contactForm),
                    });
                    if (res.ok) {
                      setSent(true);
                      toast.success('Message sent!');
                    } else {
                      toast.error('Failed to send. Please try again.');
                    }
                  } catch {
                    toast.error('Something went wrong.');
                  }
                  setSending(false);
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact-name">Name *</Label>
                    <Input
                      id="contact-name"
                      value={contactForm.name}
                      onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Your name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-email">Email *</Label>
                    <Input
                      id="contact-email"
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="you@company.com"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact-company">Company</Label>
                    <Input
                      id="contact-company"
                      value={contactForm.company}
                      onChange={(e) => setContactForm((p) => ({ ...p, company: e.target.value }))}
                      placeholder="Company name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>I&#39;m interested in...</Label>
                    <Select value={contactForm.interest} onValueChange={(v) => setContactForm((p) => ({ ...p, interest: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select one" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="demo">Getting a personalized demo</SelectItem>
                        <SelectItem value="pricing">Pricing & plans</SelectItem>
                        <SelectItem value="shopify">Shopify integration</SelectItem>
                        <SelectItem value="3pl">3PL / multi-client warehousing</SelectItem>
                        <SelectItem value="retail">Retail / POS</SelectItem>
                        <SelectItem value="service">Service business (tire, auto, HVAC)</SelectItem>
                        <SelectItem value="other">Something else</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-message">Message *</Label>
                  <Textarea
                    id="contact-message"
                    value={contactForm.message}
                    onChange={(e) => setContactForm((p) => ({ ...p, message: e.target.value }))}
                    placeholder="Tell us about your business and what you're looking for..."
                    rows={4}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={sending}>
                  {sending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" /> Send Message</>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center">
          <a href="/" className="text-sm text-slate-500 hover:text-slate-700 transition-colors">← Back to Stokora WMS</a>
          <p className="text-xs text-slate-500 mt-2">Demo data is shared and resets periodically.</p>
        </div>
      </div>
    </div>
  );
}
