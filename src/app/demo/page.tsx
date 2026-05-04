'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Package,
  Loader2,
  Monitor,
  Smartphone,
  ShoppingCart,
  Globe,
  ArrowRight,
} from 'lucide-react';

const DEMO_CREDS: Record<string, { email: string; password: string; redirect: string }> = {
  manager: { email: 'demo@phocas-wms.com', password: 'demo1234!', redirect: '/dashboard' },
  associate: { email: 'associate@phocas-wms.com', password: 'demo1234!', redirect: '/scan' },
  cashier: { email: 'cashier@phocas-wms.com', password: 'demo1234!', redirect: '/pos' },
  customer: { email: 'buyer@metrogrocery.com', password: 'demo1234!', redirect: '/portal' },
};

const ROLES = [
  {
    key: 'manager',
    icon: Monitor,
    title: 'Management',
    subtitle: 'Director / Operations Manager',
    description: 'Full desktop application — dashboard, metrics, inventory, orders, compliance, reporting, team management, billing.',
    color: 'border-blue-500/50 hover:border-blue-500',
    iconColor: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    key: 'associate',
    icon: Smartphone,
    title: 'Floor / Warehouse Associate',
    subtitle: 'Handheld scanner device',
    description: 'Scanner-only UI — pick tasks, put-away, cycle counts, replenishments, bin transfers. Track time and KPIs.',
    color: 'border-green-500/50 hover:border-green-500',
    iconColor: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  {
    key: 'cashier',
    icon: ShoppingCart,
    title: 'Cashier',
    subtitle: 'Point of sale register',
    description: 'Checkout interface — scan items, apply promotions, process sales, print receipts. Auto-decrements inventory.',
    color: 'border-amber-500/50 hover:border-amber-500',
    iconColor: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  {
    key: 'customer',
    icon: Globe,
    title: 'Customer Portal',
    subtitle: 'B2B partner login',
    description: 'Self-service ordering — browse products, check pricing, place orders, view order history and shipment tracking.',
    color: 'border-purple-500/50 hover:border-purple-500',
    iconColor: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
];

export default function DemoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLaunch = async (roleKey: string) => {
    setLoading(roleKey);
    setError(null);

    try {
      // Seed data (idempotent — skips if already seeded)
      await fetch('/api/demo/seed', { method: 'POST' });

      // Sign out first (in case another demo session is active)
      const supabase = createClient();
      await supabase.auth.signOut();

      // Sign in as the selected role
      const creds = DEMO_CREDS[roleKey];
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: creds.email,
        password: creds.password,
      });

      if (authErr) {
        setError(`Login failed: ${authErr.message}`);
        setLoading(null);
        return;
      }

      router.push(creds.redirect);
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center pt-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4">
            <Package className="h-8 w-8" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white">Phocas WMS — Live Demo</h1>
          <p className="text-slate-400 mt-3 max-w-2xl mx-auto text-lg">
            See how each role experiences the system. Pick a view below — no signup required.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="max-w-md mx-auto bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400 text-center">
            {error}
          </div>
        )}

        {/* Role cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {ROLES.map((role) => {
            const isLoading = loading === role.key;
            return (
              <Card
                key={role.key}
                className={`bg-slate-900/60 border-2 ${role.color} transition-all cursor-pointer backdrop-blur`}
                onClick={() => !loading && handleLaunch(role.key)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className={`p-3 rounded-xl ${role.bgColor}`}>
                      <role.icon className={`h-6 w-6 ${role.iconColor}`} />
                    </div>
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
                    ) : (
                      <ArrowRight className="h-5 w-5 text-slate-500" />
                    )}
                  </div>
                  <CardTitle className="text-white text-lg mt-3">{role.title}</CardTitle>
                  <CardDescription className="text-slate-400 text-xs uppercase tracking-wide">
                    {role.subtitle}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-300 leading-relaxed">{role.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* How it maps */}
        <Card className="bg-slate-900/40 border-slate-800 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-white text-base">How it maps to a real operation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-300">
              <div className="space-y-2">
                <p><span className="text-blue-400 font-semibold">Management</span> — Store managers, operations directors, IT admins. They see everything: inventory levels, metrics, compliance, team performance, promotions, billing.</p>
                <p><span className="text-green-400 font-semibold">Associates</span> — Floor workers with handheld scanners. They pick orders, restock shelves, count inventory, process receiving. Only see their task queue — no access to the full system.</p>
              </div>
              <div className="space-y-2">
                <p><span className="text-amber-400 font-semibold">Cashiers</span> — Checkout registers. Scan items, see sale prices, process transactions. Inventory auto-decrements on sale. Simple, fast interface.</p>
                <p><span className="text-purple-400 font-semibold">Customers</span> — B2B partner portal. Wholesale buyers browse your catalog, see their negotiated pricing, place orders, and track shipments. Self-service.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center pb-8">
          <a href="/" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            ← Back to Phocas WMS
          </a>
          <p className="text-xs text-slate-600 mt-2">Demo data is shared and resets periodically.</p>
        </div>
      </div>
    </div>
  );
}
