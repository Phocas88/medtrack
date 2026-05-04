'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Package,
  Play,
  Loader2,
  Warehouse,
  ScanBarcode,
  BarChart3,
  ShieldCheck,
  Users,
  CreditCard,
} from 'lucide-react';

const DEMO_EMAIL = 'demo@phocas-wms.com';
const DEMO_PASSWORD = 'demo1234!';

const features = [
  { icon: Warehouse, label: '80+ pages of warehouse operations' },
  { icon: ScanBarcode, label: 'Standalone handheld scanner app' },
  { icon: BarChart3, label: 'Metrics command center & analytics' },
  { icon: ShieldCheck, label: 'Full regulatory compliance suite' },
  { icon: Users, label: 'Customer portal & team management' },
  { icon: CreditCard, label: 'POS, promotions & Stripe billing' },
];

export default function DemoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string>('');

  const handleTryDemo = async () => {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Seed demo data
      setStep('Preparing demo data...');
      const seedRes = await fetch('/api/demo/seed', { method: 'POST' });
      const seedData = await seedRes.json();

      if (!seedRes.ok) {
        setError(seedData.error || 'Failed to prepare demo');
        setLoading(false);
        return;
      }

      // Step 2: Log in as demo user
      setStep('Signing in...');
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });

      if (authError) {
        setError('Demo login failed. Please try again.');
        setLoading(false);
        return;
      }

      // Step 3: Redirect to dashboard
      setStep('Loading dashboard...');
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4">
            <Package className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold text-white">Phocas WMS</h1>
          <p className="text-slate-400 mt-2">Warehouse Management System</p>
        </div>

        {/* Demo card */}
        <Card className="border-slate-800 bg-slate-900/50 backdrop-blur">
          <CardHeader className="text-center">
            <CardTitle className="text-white text-xl">Try the Live Demo</CardTitle>
            <CardDescription className="text-slate-400">
              Explore a fully loaded warehouse with sample products, orders, bins, and compliance data. No signup required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Feature list */}
            <div className="grid grid-cols-1 gap-2">
              {features.map((f, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-slate-300">
                  <f.icon className="h-4 w-4 text-primary shrink-0" />
                  {f.label}
                </div>
              ))}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Status */}
            {loading && step && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                {step}
              </div>
            )}

            {/* CTA */}
            <Button
              onClick={handleTryDemo}
              disabled={loading}
              className="w-full h-14 text-lg"
              size="lg"
            >
              {loading ? (
                <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Setting up demo...</>
              ) : (
                <><Play className="h-5 w-5 mr-2" /> Launch Demo</>
              )}
            </Button>

            <p className="text-center text-xs text-slate-500">
              Demo resets periodically. Data is shared — don&apos;t enter real information.
            </p>
          </CardContent>
        </Card>

        {/* Back to main */}
        <div className="text-center">
          <a href="/" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            ← Back to Phocas WMS
          </a>
        </div>
      </div>
    </div>
  );
}
