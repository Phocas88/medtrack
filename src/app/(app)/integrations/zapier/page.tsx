'use client';
import { useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
export default function ZapierPage() {
  const { role } = useAuth();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  async function generate() {
    setBusy(true);
    try {
      const response = await fetch('/api/zapier/key', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Key generation failed');
      setKey(data.key);
      toast.success('New key created. Previous keys are now revoked.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Key generation failed'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6"><PageHeader title="Zapier" description="Connect using Webhooks by Zapier" /><p>This integration uses an API key, polling triggers and JSON actions. A native Zapier app is not provided.</p>{role === 'admin' && <div className="space-y-3"><Button onClick={generate} disabled={busy}>{busy ? 'Generating…' : 'Generate / rotate API key'}</Button>{key && <><label htmlFor="zapier-key">Copy this key now. It is shown only once.</label><Input id="zapier-key" readOnly value={key} /></>}</div>}<div className="space-y-2"><h2 className="font-semibold">Configure your Zap</h2><p>Send the key in the x-api-key header.</p><p>Poll GET /api/zapier/trigger with type (movement, order, po, all), since (ISO timestamp), and optional before for older results.</p><p>POST /api/zapier/action with request_id (a unique UUID), action and data. Reuse request_id when retrying a request.</p><p>Actions: create_product, create_customer, create_order, adjust_inventory. Inventory adjustments require a lot_id, signed integer quantity and reason.</p></div></div>;
}
