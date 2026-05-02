'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Warehouse,
  Package,
  Truck,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  SkipForward,
  LayoutDashboard,
  Plus,
  Grid3X3,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

const TOTAL_STEPS = 5;

const INDUSTRIES = [
  'Medical Supply',
  'Food & Beverage',
  'Auto Parts',
  'Electronics',
  'General Wholesale',
  'Other',
];

const LOCATION_TYPES = [
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'store', label: 'Store' },
  { value: 'office', label: 'Office' },
];

const UNITS_OF_MEASURE = [
  { value: 'each', label: 'Each' },
  { value: 'box', label: 'Box' },
  { value: 'case', label: 'Case' },
  { value: 'pallet', label: 'Pallet' },
  { value: 'lb', label: 'Pound (lb)' },
  { value: 'kg', label: 'Kilogram (kg)' },
];

const STORAGE_REQUIREMENTS = [
  { value: 'room_temp', label: 'Room Temperature' },
  { value: 'refrigerated', label: 'Refrigerated' },
  { value: 'frozen', label: 'Frozen' },
];

interface OnboardingState {
  step: number;
  companyName: string;
  industry: string;
  locationName: string;
  locationCode: string;
  locationAddress: string;
  locationType: string;
  productName: string;
  productSku: string;
  productCost: string;
  productPrice: string;
  productUnit: string;
  productLowStock: string;
  productStorage: string;
  supplierName: string;
  supplierContact: string;
  supplierEmail: string;
  supplierPhone: string;
  createdLocations: number;
  createdProducts: number;
  createdSuppliers: number;
}

const DEFAULT_STATE: OnboardingState = {
  step: 1,
  companyName: '',
  industry: '',
  locationName: '',
  locationCode: '',
  locationAddress: '',
  locationType: 'warehouse',
  productName: '',
  productSku: '',
  productCost: '',
  productPrice: '',
  productUnit: 'each',
  productLowStock: '10',
  productStorage: 'room_temp',
  supplierName: '',
  supplierContact: '',
  supplierEmail: '',
  supplierPhone: '',
  createdLocations: 0,
  createdProducts: 0,
  createdSuppliers: 0,
};

const STORAGE_KEY = 'medtrack_onboarding';

function generateCode(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map((w) => w.slice(0, 3))
    .join('-')
    .slice(0, 12);
}

function generateSku(name: string): string {
  const prefix = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map((w) => w.slice(0, 3))
    .join('');
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${prefix.slice(0, 6)}-${num}`;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, tenantId, tenantName, loading: authLoading } = useAuth();
  const [state, setState] = useState<OnboardingState>(DEFAULT_STATE);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Load saved state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<OnboardingState>;
        setState((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore
    }
    setInitialized(true);
  }, []);

  // Pre-fill company name from tenant
  useEffect(() => {
    if (tenantName && !state.companyName && initialized) {
      setState((prev) => ({ ...prev, companyName: tenantName }));
    }
  }, [tenantName, initialized, state.companyName]);

  // Auto-save state to localStorage
  useEffect(() => {
    if (initialized) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state, initialized]);

  const updateState = useCallback((updates: Partial<OnboardingState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const goToStep = useCallback((step: number) => {
    setState((prev) => ({ ...prev, step }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Step 1: Save company info
  async function handleGetStarted() {
    if (!tenantId || !state.companyName) {
      toast.error('Please enter your company name');
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tenants')
        .update({
          name: state.companyName,
          settings: { industry: state.industry },
        })
        .eq('id', tenantId);
      if (error) throw error;
      goToStep(2);
    } catch {
      toast.error('Failed to save company info');
    } finally {
      setSaving(false);
    }
  }

  // Step 2: Create location
  async function handleCreateLocation() {
    if (!tenantId || !state.locationName) {
      toast.error('Please enter a location name');
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('locations').insert({
        tenant_id: tenantId,
        name: state.locationName,
        code: state.locationCode || generateCode(state.locationName),
        address: state.locationAddress || null,
        location_type: state.locationType,
        is_active: true,
      });
      if (error) throw error;
      toast.success('Location created!');
      updateState({
        createdLocations: state.createdLocations + 1,
        locationName: '',
        locationCode: '',
        locationAddress: '',
      });
      goToStep(3);
    } catch {
      toast.error('Failed to create location');
    } finally {
      setSaving(false);
    }
  }

  // Step 3: Create product
  async function handleCreateProduct() {
    if (!tenantId || !state.productName) {
      toast.error('Please enter a product name');
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('products').insert({
        tenant_id: tenantId,
        name: state.productName,
        sku: state.productSku || generateSku(state.productName),
        cost: parseFloat(state.productCost) || 0,
        price: parseFloat(state.productPrice) || 0,
        unit_of_measure: state.productUnit,
        low_stock_threshold: parseInt(state.productLowStock) || 10,
        storage_requirement: state.productStorage,
      });
      if (error) throw error;
      toast.success('Product created!');
      updateState({
        createdProducts: state.createdProducts + 1,
        productName: '',
        productSku: '',
        productCost: '',
        productPrice: '',
      });
      goToStep(4);
    } catch {
      toast.error('Failed to create product');
    } finally {
      setSaving(false);
    }
  }

  // Step 4: Create supplier
  async function handleCreateSupplier() {
    if (!tenantId || !state.supplierName) {
      toast.error('Please enter a supplier name');
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('suppliers').insert({
        tenant_id: tenantId,
        name: state.supplierName,
        contact_name: state.supplierContact || null,
        email: state.supplierEmail || null,
        phone: state.supplierPhone || null,
      });
      if (error) throw error;
      toast.success('Supplier created!');
      updateState({
        createdSuppliers: state.createdSuppliers + 1,
        supplierName: '',
        supplierContact: '',
        supplierEmail: '',
        supplierPhone: '',
      });
      goToStep(5);
    } catch {
      toast.error('Failed to create supplier');
    } finally {
      setSaving(false);
    }
  }

  // Step 5: Complete onboarding
  async function handleComplete() {
    if (!tenantId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      // Fetch current settings to merge
      const { data: tenant } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single();

      const currentSettings = (tenant?.settings as Record<string, unknown>) || {};
      const { error } = await supabase
        .from('tenants')
        .update({
          settings: { ...currentSettings, onboarding_completed: true },
        })
        .eq('id', tenantId);
      if (error) throw error;

      localStorage.removeItem(STORAGE_KEY);
      toast.success('Onboarding complete! Welcome aboard.');
      router.push('/dashboard');
    } catch {
      toast.error('Failed to complete onboarding');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !initialized) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const progress = (state.step / TOTAL_STEPS) * 100;

  return (
    <div className="mx-auto max-w-2xl py-8 px-4">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
          <span>Setup Progress</span>
          <span>Step {state.step} of {TOTAL_STEPS}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-in-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step 1: Welcome */}
      {state.step === 1 && (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">
              Welcome{user?.full_name ? `, ${user.full_name}` : ''}!
            </CardTitle>
            <CardDescription className="text-base">
              Let&apos;s set up your workspace in under 5 minutes.
              We&apos;ll walk you through the basics to get your inventory tracking up and running.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Separator />
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  placeholder="Your company name"
                  value={state.companyName}
                  onChange={(e) => updateState({ companyName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Select
                  value={state.industry}
                  onValueChange={(v) => updateState({ industry: v })}
                >
                  <SelectTrigger id="industry">
                    <SelectValue placeholder="Select your industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((ind) => (
                      <SelectItem key={ind} value={ind}>
                        {ind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handleGetStarted} disabled={saving || !state.companyName}>
                {saving ? 'Saving...' : 'Get Started'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: First Location */}
      {state.step === 2 && (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10">
              <Warehouse className="h-8 w-8 text-blue-500" />
            </div>
            <CardTitle className="text-2xl">Your First Location</CardTitle>
            <CardDescription className="text-base">
              Where do you store inventory? Add a warehouse, store, or office.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Separator />
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="locationName">Location Name</Label>
                <Input
                  id="locationName"
                  placeholder="e.g. Main Warehouse"
                  value={state.locationName}
                  onChange={(e) => {
                    const name = e.target.value;
                    updateState({
                      locationName: name,
                      locationCode: generateCode(name),
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="locationCode">Location Code</Label>
                <Input
                  id="locationCode"
                  placeholder="Auto-generated"
                  value={state.locationCode}
                  onChange={(e) => updateState({ locationCode: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Auto-generated from the name. You can customize it.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="locationAddress">Address (optional)</Label>
                <Input
                  id="locationAddress"
                  placeholder="123 Main St, City, State"
                  value={state.locationAddress}
                  onChange={(e) => updateState({ locationAddress: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="locationType">Location Type</Label>
                <Select
                  value={state.locationType}
                  onValueChange={(v) => updateState({ locationType: v })}
                >
                  <SelectTrigger id="locationType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => goToStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => goToStep(3)}>
                  <SkipForward className="mr-2 h-4 w-4" />
                  Skip
                </Button>
                <Button onClick={handleCreateLocation} disabled={saving || !state.locationName}>
                  {saving ? 'Creating...' : 'Next'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: First Product */}
      {state.step === 3 && (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <Package className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle className="text-2xl">Add Your First Product</CardTitle>
            <CardDescription className="text-base">
              What do you sell or distribute? Add a product to start tracking inventory.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Separator />
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="productName">Product Name</Label>
                  <Input
                    id="productName"
                    placeholder="e.g. Nitrile Gloves - Large"
                    value={state.productName}
                    onChange={(e) => {
                      const name = e.target.value;
                      updateState({
                        productName: name,
                        productSku: state.productSku || generateSku(name),
                      });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productSku">SKU</Label>
                  <Input
                    id="productSku"
                    placeholder="Auto-generated"
                    value={state.productSku}
                    onChange={(e) => updateState({ productSku: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="productCost">Cost ($)</Label>
                  <Input
                    id="productCost"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={state.productCost}
                    onChange={(e) => updateState({ productCost: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productPrice">Price ($)</Label>
                  <Input
                    id="productPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={state.productPrice}
                    onChange={(e) => updateState({ productPrice: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="productUnit">Unit of Measure</Label>
                  <Select
                    value={state.productUnit}
                    onValueChange={(v) => updateState({ productUnit: v })}
                  >
                    <SelectTrigger id="productUnit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS_OF_MEASURE.map((u) => (
                        <SelectItem key={u.value} value={u.value}>
                          {u.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productLowStock">Low Stock Threshold</Label>
                  <Input
                    id="productLowStock"
                    type="number"
                    min="0"
                    placeholder="10"
                    value={state.productLowStock}
                    onChange={(e) => updateState({ productLowStock: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productStorage">Storage</Label>
                  <Select
                    value={state.productStorage}
                    onValueChange={(v) => updateState({ productStorage: v })}
                  >
                    <SelectTrigger id="productStorage">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STORAGE_REQUIREMENTS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => goToStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => goToStep(4)}>
                  <SkipForward className="mr-2 h-4 w-4" />
                  Skip
                </Button>
                <Button onClick={handleCreateProduct} disabled={saving || !state.productName}>
                  {saving ? 'Creating...' : 'Next'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Add a Supplier */}
      {state.step === 4 && (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/10">
              <Truck className="h-8 w-8 text-orange-500" />
            </div>
            <CardTitle className="text-2xl">Add a Supplier</CardTitle>
            <CardDescription className="text-base">
              Who supplies your products? Add your primary vendor to get started.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Separator />
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="supplierName">Supplier Name</Label>
                <Input
                  id="supplierName"
                  placeholder="e.g. MedSupply Co."
                  value={state.supplierName}
                  onChange={(e) => updateState({ supplierName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplierContact">Contact Name (optional)</Label>
                <Input
                  id="supplierContact"
                  placeholder="John Smith"
                  value={state.supplierContact}
                  onChange={(e) => updateState({ supplierContact: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="supplierEmail">Email (optional)</Label>
                  <Input
                    id="supplierEmail"
                    type="email"
                    placeholder="supplier@example.com"
                    value={state.supplierEmail}
                    onChange={(e) => updateState({ supplierEmail: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplierPhone">Phone (optional)</Label>
                  <Input
                    id="supplierPhone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={state.supplierPhone}
                    onChange={(e) => updateState({ supplierPhone: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => goToStep(3)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => goToStep(5)}>
                  <SkipForward className="mr-2 h-4 w-4" />
                  Skip
                </Button>
                <Button onClick={handleCreateSupplier} disabled={saving || !state.supplierName}>
                  {saving ? 'Creating...' : 'Next'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Complete */}
      {state.step === 5 && (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle className="text-2xl">You&apos;re All Set!</CardTitle>
            <CardDescription className="text-base">
              Your workspace is ready. Here&apos;s a summary of what was set up.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Separator />
            <div className="flex flex-wrap items-center justify-center gap-3">
              {state.createdLocations > 0 && (
                <Badge variant="secondary" className="px-3 py-1.5 text-sm">
                  <Warehouse className="mr-1.5 h-3.5 w-3.5" />
                  {state.createdLocations} Location{state.createdLocations !== 1 ? 's' : ''}
                </Badge>
              )}
              {state.createdProducts > 0 && (
                <Badge variant="secondary" className="px-3 py-1.5 text-sm">
                  <Package className="mr-1.5 h-3.5 w-3.5" />
                  {state.createdProducts} Product{state.createdProducts !== 1 ? 's' : ''}
                </Badge>
              )}
              {state.createdSuppliers > 0 && (
                <Badge variant="secondary" className="px-3 py-1.5 text-sm">
                  <Truck className="mr-1.5 h-3.5 w-3.5" />
                  {state.createdSuppliers} Supplier{state.createdSuppliers !== 1 ? 's' : ''}
                </Badge>
              )}
              {state.createdLocations === 0 &&
                state.createdProducts === 0 &&
                state.createdSuppliers === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No items created yet, but you can add them anytime from the sidebar.
                  </p>
                )}
            </div>
            <Separator />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Button
                variant="outline"
                className="h-auto flex-col gap-2 py-4"
                onClick={() => {
                  handleComplete().then(() => router.push('/dashboard'));
                }}
              >
                <LayoutDashboard className="h-5 w-5" />
                <span className="text-xs">Go to Dashboard</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto flex-col gap-2 py-4"
                onClick={() => {
                  handleComplete().then(() => router.push('/products'));
                }}
              >
                <Plus className="h-5 w-5" />
                <span className="text-xs">Add More Products</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto flex-col gap-2 py-4"
                onClick={() => {
                  handleComplete().then(() => router.push('/bins'));
                }}
              >
                <Grid3X3 className="h-5 w-5" />
                <span className="text-xs">Set Up Bins</span>
              </Button>
            </div>
            <div className="flex justify-center pt-2">
              <Button size="lg" onClick={handleComplete} disabled={saving}>
                {saving ? 'Finishing up...' : 'Complete Setup'}
                <CheckCircle2 className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
