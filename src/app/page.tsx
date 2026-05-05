import Link from "next/link";
import {
  Package,
  BarChart3,
  Smartphone,
  Shield,
  Boxes,
  Truck,
  Users,
  Zap,
  CheckCircle2,
  ArrowRight,
  Grid3X3,
  ScanLine,
  Globe,
  Clock,
  Star,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Nav */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <img src="/stokora-logo.png" alt="Stokora WMS" className="h-10" />
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-gray-900 transition">Features</a>
            <a href="#industries" className="hover:text-gray-900 transition">Industries</a>
            <a href="#pricing" className="hover:text-gray-900 transition">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition hidden sm:block">
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-gray-600 mb-6">
              <Zap className="h-3 w-3" />
              Now with Mobile Scanner &amp; Bin Management
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
              Inventory management
              <br />
              <span className="text-gray-400">that actually works.</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-xl mb-8 leading-relaxed">
              From receiving to shipping, lot tracking to compliance — manage your entire
              supply chain from one platform. Built for businesses that can&apos;t afford mistakes.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/auth/signup"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-6 py-3 text-base font-medium text-white hover:bg-gray-800 transition"
              >
                Start Free — No Credit Card
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-6 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                See All Features
              </a>
            </div>
            <div className="flex items-center gap-6 mt-8 text-sm text-gray-500">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-500" /> Free 14-day trial</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-500" /> No setup fees</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-500" /> Cancel anytime</span>
            </div>
          </div>
        </div>
        {/* Gradient bg */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-gray-50 to-transparent -z-10" />
      </section>

      {/* Stats bar */}
      <section className="border-y bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <div className="text-3xl font-bold">39+</div>
            <div className="text-sm text-gray-500 mt-1">Feature Modules</div>
          </div>
          <div>
            <div className="text-3xl font-bold">100%</div>
            <div className="text-sm text-gray-500 mt-1">Cloud-Based</div>
          </div>
          <div>
            <div className="text-3xl font-bold">&lt; 5 min</div>
            <div className="text-sm text-gray-500 mt-1">Setup Time</div>
          </div>
          <div>
            <div className="text-3xl font-bold">24/7</div>
            <div className="text-sm text-gray-500 mt-1">Access Anywhere</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need to run your warehouse</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              One platform replaces your spreadsheets, paper logs, and disconnected tools.
              Every feature designed for speed and accuracy.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Package,
                title: "Product & Lot Tracking",
                desc: "Full lifecycle tracking with lot numbers, serial numbers, expiration dates, and FEFO picking logic.",
              },
              {
                icon: Grid3X3,
                title: "Bin Management",
                desc: "Primary and secondary bins with min/max levels. Automated replenishment triggers when stock drops below reorder point.",
              },
              {
                icon: Smartphone,
                title: "Mobile Scanner",
                desc: "Warehouse associates work from their phone. Scan-to-verify, cycle counts, bin moves — all guided step-by-step.",
              },
              {
                icon: Truck,
                title: "Receive & Ship",
                desc: "Purchase orders with partial receiving, sales orders with FEFO picking, and complete shipment tracking.",
              },
              {
                icon: BarChart3,
                title: "Analytics & Reports",
                desc: "Inventory valuation, turnover rates, dead stock detection, supplier scorecards, and CSV export for everything.",
              },
              {
                icon: ScanLine,
                title: "Audit Trail",
                desc: "Every movement is logged immutably. Time-travel to see inventory state at any point in history.",
              },
              {
                icon: Shield,
                title: "Compliance Ready",
                desc: "DSCSA tracking, controlled substance logs, DEA schedule management, and pre-built compliance reports.",
              },
              {
                icon: Boxes,
                title: "Kitting & Assembly",
                desc: "Define kits with component BOMs. Assemble with full lot traceability — know which components went into every kit.",
              },
              {
                icon: Users,
                title: "Multi-Location",
                desc: "Manage multiple warehouses with zone-based storage, inter-location transfers, and location-specific inventory.",
              },
              {
                icon: Globe,
                title: "Customer Portal",
                desc: "Give your customers self-service access to place orders, view pricing, and track shipments.",
              },
              {
                icon: Clock,
                title: "Expiration Management",
                desc: "Auto-quarantine expiring lots, track destructions with witness logs, manage donations of near-expiry stock.",
              },
              {
                icon: Star,
                title: "White-Label Ready",
                desc: "Your company name and logo throughout the app. Custom fields, pricing tiers, and feature toggles per account.",
              },
            ].map((feature) => (
              <div key={feature.title} className="group rounded-xl border p-6 hover:border-gray-300 hover:shadow-sm transition">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700 mb-4 group-hover:bg-gray-900 group-hover:text-white transition">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industries */}
      <section id="industries" className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Built for every industry</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Whether you&apos;re distributing medical supplies, auto parts, or food products — the same
              powerful features adapt to your workflow.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              "Medical Supply",
              "Pharmaceutical",
              "Food & Beverage",
              "Auto Parts",
              "Electronics",
              "Industrial Supply",
              "Veterinary",
              "Cannabis / Hemp",
              "Lab & Scientific",
              "Dental Supply",
              "Cosmetics",
              "Building Materials",
              "Restaurant Supply",
              "Agricultural",
              "Janitorial",
              "General Wholesale",
            ].map((industry) => (
              <div
                key={industry}
                className="flex items-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm font-medium"
              >
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                {industry}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, transparent pricing</h2>
            <p className="text-gray-600">Start free. Upgrade when you&apos;re ready.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {/* Starter */}
            <div className="rounded-xl border p-8">
              <h3 className="font-semibold text-lg mb-2">Starter</h3>
              <p className="text-sm text-gray-500 mb-4">For small businesses getting organized</p>
              <div className="mb-6">
                <span className="text-4xl font-bold">$49</span>
                <span className="text-gray-500">/mo</span>
              </div>
              <ul className="space-y-3 text-sm mb-8">
                {["Up to 3 users", "1 location", "500 products", "Lot tracking", "Basic reports", "Email support"].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/signup"
                className="block text-center rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium hover:bg-gray-50 transition"
              >
                Start Free Trial
              </Link>
            </div>

            {/* Professional */}
            <div className="rounded-xl border-2 border-gray-900 p-8 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs font-medium px-3 py-1 rounded-full">
                Most Popular
              </div>
              <h3 className="font-semibold text-lg mb-2">Professional</h3>
              <p className="text-sm text-gray-500 mb-4">For growing operations</p>
              <div className="mb-6">
                <span className="text-4xl font-bold">$99</span>
                <span className="text-gray-500">/mo</span>
              </div>
              <ul className="space-y-3 text-sm mb-8">
                {[
                  "Up to 10 users",
                  "Unlimited locations",
                  "Unlimited products",
                  "Bin management",
                  "Mobile scanner",
                  "Advanced analytics",
                  "Customer portal",
                  "Priority support",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/signup"
                className="block text-center rounded-lg bg-gray-900 text-white px-4 py-2.5 text-sm font-medium hover:bg-gray-800 transition"
              >
                Start Free Trial
              </Link>
            </div>

            {/* Enterprise */}
            <div className="rounded-xl border p-8">
              <h3 className="font-semibold text-lg mb-2">Enterprise</h3>
              <p className="text-sm text-gray-500 mb-4">For regulated industries</p>
              <div className="mb-6">
                <span className="text-4xl font-bold">$199</span>
                <span className="text-gray-500">/mo</span>
              </div>
              <ul className="space-y-3 text-sm mb-8">
                {[
                  "Unlimited users",
                  "Everything in Pro",
                  "DSCSA compliance",
                  "Controlled substances",
                  "Custom fields",
                  "API access",
                  "White-label branding",
                  "Dedicated support",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/signup"
                className="block text-center rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium hover:bg-gray-50 transition"
              >
                Contact Sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gray-900 text-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Stop losing money to inventory mistakes
          </h2>
          <p className="text-gray-400 text-lg mb-8 max-w-xl mx-auto">
            Join businesses that switched from spreadsheets and outdated systems.
            Set up in under 5 minutes — no IT team needed.
          </p>
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 rounded-lg bg-white text-gray-900 px-8 py-3.5 text-base font-medium hover:bg-gray-100 transition"
          >
            Start Your Free Trial
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-gray-900 text-white">
                <Package className="h-3.5 w-3.5" />
              </div>
              <span className="font-semibold">Stokora WMS</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <a href="#features" className="hover:text-gray-900 transition">Features</a>
              <a href="#pricing" className="hover:text-gray-900 transition">Pricing</a>
              <Link href="/auth/login" className="hover:text-gray-900 transition">Sign In</Link>
            </div>
            <p className="text-sm text-gray-400">
              &copy; {new Date().getFullYear()} Stokora WMS. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
