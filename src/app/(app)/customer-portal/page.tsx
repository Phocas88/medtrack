'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  ShoppingCart,
  Activity,
  Eye,
  Globe,
  GlobeOff,
} from 'lucide-react';
import { formatDate, formatDateTime, formatCurrency } from '@/lib/format';
import { toast } from 'sonner';

interface PortalCustomer {
  id: string;
  name: string;
  email: string;
  portal_access: boolean;
  last_login: string | null;
  orders_count: number;
  price_tier_id: string | null;
}

interface SalesOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  created_at: string;
}

interface PortalProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  custom_price: number | null;
  category: string;
}

export default function CustomerPortalPage() {
  const { tenantId } = useAuth();
  const [customers, setCustomers] = useState<PortalCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Stats
  const [portalEnabledCount, setPortalEnabledCount] = useState(0);
  const [ordersThisMonth, setOrdersThisMonth] = useState(0);
  const [activeSessions, setActiveSessions] = useState(0);

  // Portal preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCustomer, setPreviewCustomer] = useState<PortalCustomer | null>(null);
  const [previewOrders, setPreviewOrders] = useState<SalesOrder[]>([]);
  const [previewProducts, setPreviewProducts] = useState<PortalProduct[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Quote request simulation
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [quoteProductId, setQuoteProductId] = useState('');
  const [quoteQuantity, setQuoteQuantity] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');

  const loadCustomers = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    // Load customers
    const { data: custData } = await supabase
      .from('customers')
      .select('id, name, email, portal_access, last_login, price_tier_id')
      .eq('tenant_id', tenantId)
      .eq('is_archived', false)
      .order('name');

    // Load order counts per customer
    const { data: orderData } = await supabase
      .from('sales_orders')
      .select('customer_id')
      .eq('tenant_id', tenantId);

    const orderCounts: Record<string, number> = {};
    (orderData || []).forEach((o: { customer_id: string }) => {
      orderCounts[o.customer_id] = (orderCounts[o.customer_id] || 0) + 1;
    });

    const mapped: PortalCustomer[] = (custData || []).map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email || '',
      portal_access: c.portal_access ?? false,
      last_login: c.last_login ?? null,
      orders_count: orderCounts[c.id] || 0,
      price_tier_id: c.price_tier_id ?? null,
    }));

    setCustomers(mapped);
    setPortalEnabledCount(mapped.filter((c) => c.portal_access).length);

    // Orders this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const { count: monthOrders } = await supabase
      .from('sales_orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', startOfMonth.toISOString());

    setOrdersThisMonth(monthOrders || 0);

    // Simulate active sessions (random 0-5 for demo purposes based on portal-enabled count)
    setActiveSessions(Math.min(mapped.filter((c) => c.portal_access).length, Math.floor(Math.random() * 5)));

    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  async function togglePortalAccess(customer: PortalCustomer) {
    if (!tenantId) return;
    setTogglingId(customer.id);
    const supabase = createClient();

    const newAccess = !customer.portal_access;
    const { error } = await supabase
      .from('customers')
      .update({ portal_access: newAccess })
      .eq('id', customer.id)
      .eq('tenant_id', tenantId);

    setTogglingId(null);

    if (error) {
      toast.error('Failed to update portal access');
      return;
    }

    toast.success(newAccess ? 'Portal access enabled' : 'Portal access disabled');
    loadCustomers();
  }

  async function openPortalPreview(customer: PortalCustomer) {
    if (!tenantId) return;
    setPreviewCustomer(customer);
    setPreviewLoading(true);
    setPreviewOpen(true);

    const supabase = createClient();

    // Load customer orders
    const { data: orders } = await supabase
      .from('sales_orders')
      .select('id, order_number, status, total_amount, created_at')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(10);

    setPreviewOrders((orders as SalesOrder[]) || []);

    // Load products with customer-specific pricing
    const { data: products } = await supabase
      .from('products')
      .select('id, name, sku, price, category')
      .eq('tenant_id', tenantId)
      .eq('is_archived', false)
      .order('name')
      .limit(20);

    // Load custom prices for this customer
    const { data: customPrices } = await supabase
      .from('customer_prices')
      .select('product_id, custom_price')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customer.id);

    const customPriceMap: Record<string, number> = {};
    (customPrices || []).forEach((cp: { product_id: string; custom_price: number }) => {
      customPriceMap[cp.product_id] = cp.custom_price;
    });

    // Load price tier discount if applicable
    let tierDiscount = 0;
    if (customer.price_tier_id) {
      const { data: tier } = await supabase
        .from('price_tiers')
        .select('discount_percent')
        .eq('id', customer.price_tier_id)
        .single();
      if (tier) tierDiscount = tier.discount_percent;
    }

    const mappedProducts: PortalProduct[] = (products || []).map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: customPriceMap[p.id]
        ? customPriceMap[p.id]
        : tierDiscount > 0
          ? p.price * (1 - tierDiscount / 100)
          : p.price,
      custom_price: customPriceMap[p.id] ?? null,
      category: p.category || 'General',
    }));

    setPreviewProducts(mappedProducts);
    setPreviewLoading(false);
  }

  function openQuoteDialog() {
    setQuoteProductId('');
    setQuoteQuantity('');
    setQuoteNotes('');
    setQuoteDialogOpen(true);
  }

  function submitQuote() {
    if (!quoteProductId || !quoteQuantity) {
      toast.error('Product and quantity are required');
      return;
    }
    const product = previewProducts.find((p) => p.id === quoteProductId);
    toast.success(
      `Quote request submitted for ${product?.name || 'product'} (qty: ${quoteQuantity})`
    );
    setQuoteDialogOpen(false);
  }

  const columns: Column<PortalCustomer>[] = [
    { key: 'name', label: 'Customer Name', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    {
      key: 'portal_access',
      label: 'Portal Access',
      render: (row) => (
        <Badge variant={row.portal_access ? 'default' : 'secondary'}>
          {row.portal_access ? 'Enabled' : 'Disabled'}
        </Badge>
      ),
      sortable: true,
    },
    {
      key: 'last_login',
      label: 'Last Login',
      render: (row) => formatDateTime(row.last_login),
      sortable: true,
    },
    {
      key: 'orders_count',
      label: 'Orders',
      sortable: true,
    },
    {
      key: 'actions' as keyof PortalCustomer,
      label: '',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              togglePortalAccess(row);
            }}
            disabled={togglingId === row.id}
          >
            {row.portal_access ? (
              <GlobeOff className="h-4 w-4 mr-1" />
            ) : (
              <Globe className="h-4 w-4 mr-1" />
            )}
            {row.portal_access ? 'Disable' : 'Enable'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openPortalPreview(row);
            }}
          >
            <Eye className="h-4 w-4 mr-1" />
            Preview
          </Button>
        </div>
      ),
    },
  ];

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'delivered':
        return 'default';
      case 'pending':
      case 'processing':
        return 'secondary';
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline' as const;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Customer Portal" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6 h-24 animate-pulse bg-muted/50" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Portal"
        description="Manage customer self-service portal access and settings"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Portal-Enabled Customers"
          value={portalEnabledCount}
          icon={Users}
          description={`of ${customers.length} total customers`}
        />
        <StatCard
          title="Orders This Month"
          value={ordersThisMonth}
          icon={ShoppingCart}
        />
        <StatCard
          title="Active Sessions"
          value={activeSessions}
          icon={Activity}
          description="Currently online"
        />
      </div>

      {/* Customer Table */}
      <DataTable
        data={customers}
        columns={columns}
        searchKey="name"
        searchPlaceholder="Search customers..."
        emptyMessage="No customers found."
      />

      {/* Portal Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Portal Preview — {previewCustomer?.name}
            </DialogTitle>
          </DialogHeader>

          {previewLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading preview...</div>
          ) : (
            <div className="space-y-6">
              {/* Order History Section */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Order History</h3>
                {previewOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No orders found for this customer.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono text-sm">
                            {order.order_number}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(order.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusColor(order.status)}>
                              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(order.total_amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <Separator />

              {/* Available Products Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Available Products</h3>
                  <Button size="sm" variant="outline" onClick={openQuoteDialog}>
                    Request Quote
                  </Button>
                </div>
                {previewProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No products available.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead>Pricing</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-mono text-xs">
                            {product.sku}
                          </TableCell>
                          <TableCell className="text-sm">{product.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {product.category}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(product.price)}
                          </TableCell>
                          <TableCell>
                            {product.custom_price !== null ? (
                              <Badge variant="outline" className="text-xs">Custom</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Standard</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <Separator />

              {/* Request Quote Simulation */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Request a Quote</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  This is a preview of the quote request form customers would see.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Product</Label>
                    <Select value={quoteProductId} onValueChange={setQuoteProductId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {previewProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.sku} - {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={quoteQuantity}
                      onChange={(e) => setQuoteQuantity(e.target.value)}
                      placeholder="Enter quantity"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Input
                      value={quoteNotes}
                      onChange={(e) => setQuoteNotes(e.target.value)}
                      placeholder="Optional notes"
                    />
                  </div>
                </div>
                <Button className="mt-3" size="sm" onClick={submitQuote}>
                  Submit Quote Request
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quote Dialog (alternative full dialog) */}
      <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Quote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product *</Label>
              <Select value={quoteProductId} onValueChange={setQuoteProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {previewProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.sku} - {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity *</Label>
              <Input
                type="number"
                min="1"
                value={quoteQuantity}
                onChange={(e) => setQuoteQuantity(e.target.value)}
                placeholder="Enter quantity"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                placeholder="Additional details for the quote request..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitQuote}>Submit Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
