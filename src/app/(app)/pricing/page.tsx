'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, DollarSign, Tag } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';
import type { PriceTier, CustomerPrice, Customer, Product } from '@/types/database';

export default function PricingPage() {
  const { tenantId } = useAuth();
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [customPrices, setCustomPrices] = useState<(CustomerPrice & { customer?: Customer; product?: Product })[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Tier dialog
  const [tierDialogOpen, setTierDialogOpen] = useState(false);
  const [editTier, setEditTier] = useState<PriceTier | null>(null);
  const [tierName, setTierName] = useState('');
  const [tierDescription, setTierDescription] = useState('');
  const [tierDiscount, setTierDiscount] = useState('');

  // Custom price dialog
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [priceCustomerId, setPriceCustomerId] = useState('');
  const [priceProductId, setPriceProductId] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [priceEffective, setPriceEffective] = useState('');
  const [priceExpiration, setPriceExpiration] = useState('');
  const [priceNotes, setPriceNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    const [tierRes, priceRes, custRes, prodRes] = await Promise.all([
      supabase.from('price_tiers').select('*').eq('tenant_id', tenantId).order('name'),
      supabase.from('customer_prices').select('*, customer:customers(*), product:products(*)').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      supabase.from('customers').select('id, name').eq('tenant_id', tenantId).eq('is_archived', false).order('name'),
      supabase.from('products').select('id, name, sku, price, cost').eq('tenant_id', tenantId).eq('is_archived', false).order('name'),
    ]);

    setTiers(tierRes.data || []);
    setCustomPrices(priceRes.data || []);
    setCustomers(custRes.data as Customer[] || []);
    setProducts(prodRes.data as Product[] || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Tier handlers
  function openTierDialog(tier?: PriceTier) {
    if (tier) {
      setEditTier(tier);
      setTierName(tier.name);
      setTierDescription(tier.description || '');
      setTierDiscount(String(tier.discount_percent));
    } else {
      setEditTier(null);
      setTierName('');
      setTierDescription('');
      setTierDiscount('');
    }
    setTierDialogOpen(true);
  }

  async function saveTier() {
    if (!tenantId || !tierName || !tierDiscount) {
      toast.error('Name and discount are required');
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload = {
      tenant_id: tenantId,
      name: tierName,
      description: tierDescription || null,
      discount_percent: parseFloat(tierDiscount),
    };

    if (editTier) {
      const { error } = await supabase.from('price_tiers').update(payload).eq('id', editTier.id);
      if (error) { toast.error('Failed to update tier'); setSaving(false); return; }
      toast.success('Tier updated');
    } else {
      const { error } = await supabase.from('price_tiers').insert(payload);
      if (error) { toast.error('Failed to create tier'); setSaving(false); return; }
      toast.success('Tier created');
    }

    setSaving(false);
    setTierDialogOpen(false);
    loadData();
  }

  // Custom price handlers
  function openPriceDialog() {
    setPriceCustomerId('');
    setPriceProductId('');
    setPriceAmount('');
    setPriceEffective(new Date().toISOString().split('T')[0]);
    setPriceExpiration('');
    setPriceNotes('');
    setPriceDialogOpen(true);
  }

  async function saveCustomPrice() {
    if (!tenantId || !priceCustomerId || !priceProductId || !priceAmount || !priceEffective) {
      toast.error('Customer, product, price, and effective date are required');
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase.from('customer_prices').insert({
      tenant_id: tenantId,
      customer_id: priceCustomerId,
      product_id: priceProductId,
      custom_price: parseFloat(priceAmount),
      effective_date: priceEffective,
      expiration_date: priceExpiration || null,
      notes: priceNotes || null,
    });

    setSaving(false);

    if (error) {
      toast.error('Failed to create custom price');
      return;
    }

    toast.success('Custom price created');
    setPriceDialogOpen(false);
    loadData();
  }

  const selectedProduct = products.find((p) => p.id === priceProductId);

  const tierColumns: Column<PriceTier>[] = [
    { key: 'name', label: 'Tier Name', sortable: true },
    { key: 'description', label: 'Description' },
    {
      key: 'discount_percent',
      label: 'Discount %',
      sortable: true,
      render: (row) => `${row.discount_percent}%`,
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <Button variant="ghost" size="sm" onClick={() => openTierDialog(row)}>
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const priceColumns: Column<typeof customPrices[0]>[] = [
    {
      key: 'customer',
      label: 'Customer',
      sortable: true,
      render: (row) => row.customer?.name || '—',
    },
    {
      key: 'product',
      label: 'Product',
      sortable: true,
      render: (row) => row.product ? `${row.product.sku} - ${row.product.name}` : '—',
    },
    {
      key: 'standard_price',
      label: 'Standard Price',
      render: (row) => row.product ? formatCurrency(row.product.price) : '—',
    },
    {
      key: 'custom_price',
      label: 'Custom Price',
      sortable: true,
      render: (row) => (
        <span className="font-medium text-green-700">{formatCurrency(row.custom_price)}</span>
      ),
    },
    {
      key: 'savings',
      label: 'Savings',
      render: (row) => {
        if (!row.product) return '—';
        const savings = row.product.price - row.custom_price;
        const pct = ((savings / row.product.price) * 100).toFixed(1);
        return savings > 0 ? (
          <span className="text-green-600">-{pct}%</span>
        ) : (
          <span className="text-red-600">+{Math.abs(parseFloat(pct))}%</span>
        );
      },
    },
    {
      key: 'effective_date',
      label: 'Effective',
      sortable: true,
      render: (row) => formatDate(row.effective_date),
    },
    {
      key: 'expiration_date',
      label: 'Expires',
      sortable: true,
      render: (row) => formatDate(row.expiration_date),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Pricing" />
        <div className="text-muted-foreground">Loading pricing data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Pricing"
        description="Manage price tiers and customer-specific pricing"
      />

      <Tabs defaultValue="tiers">
        <TabsList>
          <TabsTrigger value="tiers">
            <Tag className="mr-2 h-4 w-4" />
            Price Tiers
          </TabsTrigger>
          <TabsTrigger value="custom">
            <DollarSign className="mr-2 h-4 w-4" />
            Custom Prices
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tiers" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Price Tiers</CardTitle>
              <Button onClick={() => openTierDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Add Tier
              </Button>
            </CardHeader>
            <CardContent>
              <DataTable
                data={tiers}
                columns={tierColumns}
                searchKey="name"
                searchPlaceholder="Search tiers..."
                emptyMessage="No price tiers configured."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="custom" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Customer-Specific Prices</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    exportToCSV(
                      customPrices.map((cp) => ({
                        Customer: cp.customer?.name || '',
                        Product: cp.product ? `${cp.product.sku} - ${cp.product.name}` : '',
                        'Standard Price': cp.product?.price || 0,
                        'Custom Price': cp.custom_price,
                        Effective: cp.effective_date,
                        Expires: cp.expiration_date || '',
                      })),
                      'customer_prices'
                    )
                  }
                >
                  Export CSV
                </Button>
                <Button onClick={openPriceDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Custom Price
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                data={customPrices}
                columns={priceColumns}
                searchKey="customer"
                searchPlaceholder="Search by customer..."
                emptyMessage="No custom prices configured."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Tier Dialog */}
      <Dialog open={tierDialogOpen} onOpenChange={setTierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTier ? 'Edit' : 'Add'} Price Tier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tier Name *</Label>
              <Input value={tierName} onChange={(e) => setTierName(e.target.value)} placeholder="e.g. Gold, Silver, Wholesale" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={tierDescription} onChange={(e) => setTierDescription(e.target.value)} placeholder="Optional description" />
            </div>
            <div className="space-y-2">
              <Label>Discount Percentage *</Label>
              <Input type="number" min="0" max="100" step="0.5" value={tierDiscount} onChange={(e) => setTierDiscount(e.target.value)} placeholder="e.g. 10" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTierDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveTier} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Price Dialog */}
      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Price</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Customer *</Label>
              <Select value={priceCustomerId} onValueChange={setPriceCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Product *</Label>
              <Select value={priceProductId} onValueChange={setPriceProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.sku} - {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProduct && (
                <p className="text-xs text-muted-foreground">
                  Standard price: {formatCurrency(selectedProduct.price)} | Cost: {formatCurrency(selectedProduct.cost)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Custom Price *</Label>
              <Input type="number" min="0" step="0.01" value={priceAmount} onChange={(e) => setPriceAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Effective Date *</Label>
                <Input type="date" value={priceEffective} onChange={(e) => setPriceEffective(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Expiration Date</Label>
                <Input type="date" value={priceExpiration} onChange={(e) => setPriceExpiration(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={priceNotes} onChange={(e) => setPriceNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveCustomPrice} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
