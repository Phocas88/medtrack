'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  ShoppingBag,
  Link2,
  Unlink,
  RefreshCw,
  Package,
  ShoppingCart,
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

interface ShopifyState {
  connected: boolean;
  store_url: string;
  access_token: string;
  shop_name: string | null;
  shop_domain: string | null;
  product_count: number | null;
  order_count: number | null;
  last_sync: string | null;
  auto_sync_orders: boolean;
  auto_sync_inventory: boolean;
}

export default function ShopifyIntegrationPage() {
  const { tenantId, role } = useAuth();
  const [state, setState] = useState<ShopifyState>({
    connected: false, store_url: '', access_token: '',
    shop_name: null, shop_domain: null, product_count: null, order_count: null,
    last_sync: null, auto_sync_orders: true, auto_sync_inventory: true,
  });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const isAdmin = role === 'admin';

  // Load saved config from tenant settings
  const loadConfig = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();
    const { data: tenant } = await supabase.from('tenants').select('settings').eq('id', tenantId).single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const shopify = (settings.shopify as Record<string, unknown>) || {};

    if (shopify.store_url && shopify.access_token) {
      setState((prev) => ({
        ...prev,
        connected: true,
        store_url: shopify.store_url as string,
        access_token: shopify.access_token as string,
        shop_name: (shopify.shop_name as string) || null,
        shop_domain: (shopify.shop_domain as string) || null,
        last_sync: (shopify.last_sync as string) || null,
        auto_sync_orders: shopify.auto_sync_orders !== false,
        auto_sync_inventory: shopify.auto_sync_inventory !== false,
      }));
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // Connect to Shopify
  const handleConnect = async () => {
    if (!tenantId || !state.store_url || !state.access_token) {
      toast.error('Store URL and access token required');
      return;
    }
    setConnecting(true);

    try {
      // Test the connection
      const res = await fetch('/api/shopify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_url: state.store_url, access_token: state.access_token }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to connect');
        setConnecting(false);
        return;
      }

      // Save to tenant settings
      const supabase = createClient();
      const { data: tenant } = await supabase.from('tenants').select('settings').eq('id', tenantId).single();
      const currentSettings = (tenant?.settings as Record<string, unknown>) || {};

      await supabase.from('tenants').update({
        settings: {
          ...currentSettings,
          shopify: {
            store_url: state.store_url,
            access_token: state.access_token,
            shop_name: data.shop_name,
            shop_domain: data.shop_domain,
            auto_sync_orders: true,
            auto_sync_inventory: true,
            connected_at: new Date().toISOString(),
          },
        },
      }).eq('id', tenantId);

      setState((prev) => ({
        ...prev,
        connected: true,
        shop_name: data.shop_name,
        shop_domain: data.shop_domain,
        product_count: data.product_count,
        order_count: data.order_count,
      }));

      toast.success(`Connected to ${data.shop_name}`);
    } catch {
      toast.error('Connection failed');
    }
    setConnecting(false);
  };

  // Disconnect
  const handleDisconnect = async () => {
    if (!tenantId) return;
    const supabase = createClient();
    const { data: tenant } = await supabase.from('tenants').select('settings').eq('id', tenantId).single();
    const currentSettings = (tenant?.settings as Record<string, unknown>) || {};
    delete currentSettings.shopify;
    await supabase.from('tenants').update({ settings: currentSettings }).eq('id', tenantId);

    setState({
      connected: false, store_url: '', access_token: '',
      shop_name: null, shop_domain: null, product_count: null, order_count: null,
      last_sync: null, auto_sync_orders: true, auto_sync_inventory: true,
    });
    toast.success('Disconnected from Shopify');
  };

  // Sync products
  const handleSyncProducts = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/shopify/sync-products', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Synced ${data.synced} products (${data.created} new, ${data.updated} updated)`);
        setState((prev) => ({ ...prev, last_sync: new Date().toISOString() }));
      } else {
        toast.error(data.error || 'Sync failed');
      }
    } catch {
      toast.error('Sync failed');
    }
    setSyncing(false);
  };

  // Sync orders
  const handleSyncOrders = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/shopify/sync-orders', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Imported ${data.imported} orders`);
      } else {
        toast.error(data.error || 'Sync failed');
      }
    } catch {
      toast.error('Sync failed');
    }
    setSyncing(false);
  };

  // Update sync settings
  const updateSyncSetting = async (key: string, value: boolean) => {
    if (!tenantId) return;
    setState((prev) => ({ ...prev, [key]: value }));
    const supabase = createClient();
    const { data: tenant } = await supabase.from('tenants').select('settings').eq('id', tenantId).single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const shopify = (settings.shopify as Record<string, unknown>) || {};
    shopify[key] = value;
    await supabase.from('tenants').update({ settings: { ...settings, shopify } }).eq('id', tenantId);
  };

  if (loading) {
    return <div className="space-y-6"><PageHeader title="Shopify Integration" /><p className="text-muted-foreground">Loading...</p></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shopify Integration"
        description="Connect your Shopify store to sync products, orders, and inventory"
      />

      {!state.connected ? (
        // ── Setup Form ──
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" /> Connect Your Shopify Store
            </CardTitle>
            <CardDescription>
              Create a custom app in your Shopify Admin to get an access token.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg text-sm space-y-2">
              <p className="font-semibold">How to get your access token:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Go to your Shopify Admin → Settings → Apps and sales channels</li>
                <li>Click &quot;Develop apps&quot; → &quot;Create an app&quot;</li>
                <li>Name it &quot;Stokora WMS&quot;</li>
                <li>Configure Admin API scopes: <code className="bg-background px-1 rounded">read_products, write_products, read_orders, write_orders, read_inventory, write_inventory, read_locations, read_fulfillments, write_fulfillments</code></li>
                <li>Install the app and copy the Admin API access token</li>
              </ol>
            </div>

            <div className="space-y-2">
              <Label>Store URL</Label>
              <Input
                value={state.store_url}
                onChange={(e) => setState((p) => ({ ...p, store_url: e.target.value }))}
                placeholder="mystore.myshopify.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Admin API Access Token</Label>
              <Input
                type="password"
                value={state.access_token}
                onChange={(e) => setState((p) => ({ ...p, access_token: e.target.value }))}
                placeholder="shpat_xxxxxxxxxxxxx"
              />
            </div>

            {isAdmin && (
              <Button onClick={handleConnect} disabled={connecting || !state.store_url || !state.access_token}>
                {connecting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Connecting...</> : <><Link2 className="h-4 w-4 mr-2" /> Connect Store</>}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        // ── Connected State ──
        <>
          {/* Connection Status */}
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                  <div>
                    <p className="font-semibold">{state.shop_name || 'Shopify Store'}</p>
                    <p className="text-sm text-muted-foreground">{state.shop_domain || state.store_url}</p>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-700">Connected</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Sync Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6 text-center space-y-3">
                <Package className="h-8 w-8 mx-auto text-blue-600" />
                <div>
                  <p className="text-2xl font-bold">{state.product_count ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">Shopify Products</p>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={handleSyncProducts} disabled={syncing}>
                  {syncing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  Sync Products
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center space-y-3">
                <ShoppingCart className="h-8 w-8 mx-auto text-amber-600" />
                <div>
                  <p className="text-2xl font-bold">{state.order_count ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">Shopify Orders</p>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={handleSyncOrders} disabled={syncing}>
                  {syncing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  Import Orders
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center space-y-3">
                <ArrowRightLeft className="h-8 w-8 mx-auto text-purple-600" />
                <div>
                  <p className="text-sm font-medium">Last Sync</p>
                  <p className="text-xs text-muted-foreground">
                    {state.last_sync ? new Date(state.last_sync).toLocaleString() : 'Never'}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => { handleSyncProducts(); handleSyncOrders(); }} disabled={syncing}>
                  Full Sync
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sync Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Auto-import new orders</p>
                  <p className="text-xs text-muted-foreground">Shopify orders automatically create sales orders in Stokora</p>
                </div>
                <Switch checked={state.auto_sync_orders} onCheckedChange={(v) => updateSyncSetting('auto_sync_orders', v)} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Two-way inventory sync</p>
                  <p className="text-xs text-muted-foreground">Stock changes in Stokora update Shopify availability</p>
                </div>
                <Switch checked={state.auto_sync_inventory} onCheckedChange={(v) => updateSyncSetting('auto_sync_inventory', v)} />
              </div>
              <Separator />
              {isAdmin && (
                <Button variant="outline" className="text-destructive" onClick={handleDisconnect}>
                  <Unlink className="h-4 w-4 mr-2" /> Disconnect Store
                </Button>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
