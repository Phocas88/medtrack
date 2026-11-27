'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';

export default function OnboardingPage() {
  const { tenantName, loading, role, tenantId } = useAuth();
  if (loading) return <p role="status">Loading setup…</p>;
  if (!tenantId || role !== 'admin') return <p>Ask your workspace administrator to finish warehouse setup.</p>;
  return <WarehouseSetup key={tenantId} tenantName={tenantName ?? ''} />;
}

function WarehouseSetup({ tenantName }: { tenantName: string }) {
  const router = useRouter();
  const [company, setCompany] = useState(tenantName);
  const [warehouse, setWarehouse] = useState('Main warehouse');
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

  async function setup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const { error: failure } = await createClient().rpc('setup_first_warehouse', {
        p_company: company.trim(), p_warehouse: warehouse.trim(), p_timezone: timezone.trim(),
      });
      if (failure) { setError(failure.message); return; }
      router.replace('/dashboard');
    } catch {
      setError('Could not connect. Try again to continue setup.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader><CardTitle>Set up your warehouse</CardTitle></CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">We’ll create a receiving area and starter bin. You can edit both later. If you already have a warehouse, setup uses it and keeps its records.</p>
        <form onSubmit={setup} className="space-y-4">
          <label className="block text-sm">Company name<Input value={company} onChange={e => setCompany(e.target.value)} minLength={2} maxLength={200} required /></label>
          <label className="block text-sm">Warehouse name<Input value={warehouse} onChange={e => setWarehouse(e.target.value)} minLength={2} maxLength={100} required /></label>
          <label className="block text-sm">Time zone<Input value={timezone} onChange={e => setTimezone(e.target.value)} list="warehouse-timezones" required /></label>
          <datalist id="warehouse-timezones">{['UTC', ...zones].map(zone => <option key={zone} value={zone} />)}</datalist>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button disabled={saving}>{saving ? 'Setting up…' : 'Create warehouse and continue'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
