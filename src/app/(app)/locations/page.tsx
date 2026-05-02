'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Warehouse,
  Box,
  Package,
  ChevronRight,
  ArrowLeft,
  Search,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber, formatDateTime, storageLabel } from '@/lib/format';
import type {
  Location,
  Zone,
  Bin,
  BinInventory,
  StorageRequirement,
  BinType,
  Product,
  Lot,
  ProductBinAssignment,
} from '@/types/database';

// ── Types for aggregated data ──
interface LocationWithCounts extends Location {
  zone_count: number;
  bin_count: number;
  item_count: number;
}

interface ZoneWithCounts extends Zone {
  bin_count: number;
  item_count: number;
}

interface BinWithCounts extends Bin {
  item_count: number;
  total_quantity: number;
}

interface BinInventoryRow extends BinInventory {
  product?: Product;
  lot?: Lot;
}

// ── Drill level type ──
type DrillLevel =
  | { level: 'locations' }
  | { level: 'location'; locationId: string }
  | { level: 'zone'; locationId: string; zoneId: string }
  | { level: 'bin'; locationId: string; zoneId: string; binId: string };

// ── Storage requirement badge colors ──
function storageBadgeVariant(req: StorageRequirement): 'secondary' | 'default' | 'destructive' | 'outline' {
  switch (req) {
    case 'room_temp':
      return 'secondary';
    case 'refrigerated':
      return 'default';
    case 'frozen':
      return 'destructive';
    default:
      return 'outline';
  }
}

function storageBadgeClass(req: StorageRequirement): string {
  switch (req) {
    case 'refrigerated':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100';
    case 'frozen':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-100';
    default:
      return '';
  }
}

export default function LocationsPage() {
  const { tenantId } = useAuth();
  const supabase = createClient();

  // ── Drill state ──
  const [drill, setDrill] = useState<DrillLevel>({ level: 'locations' });
  const [searchQuery, setSearchQuery] = useState('');

  // ── Data state ──
  const [locations, setLocations] = useState<LocationWithCounts[]>([]);
  const [zones, setZones] = useState<ZoneWithCounts[]>([]);
  const [bins, setBins] = useState<BinWithCounts[]>([]);
  const [binInventory, setBinInventory] = useState<BinInventoryRow[]>([]);
  const [binAssignments, setBinAssignments] = useState<(ProductBinAssignment & { product?: Product })[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Current entity references for headers ──
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [currentZone, setCurrentZone] = useState<Zone | null>(null);
  const [currentBin, setCurrentBin] = useState<Bin | null>(null);

  // ── Dialog states ──
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [binDialogOpen, setBinDialogOpen] = useState(false);
  const [editingBin, setEditingBin] = useState<Bin | null>(null);
  const [inventoryDialogOpen, setInventoryDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustingInventory, setAdjustingInventory] = useState<BinInventoryRow | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; name: string } | null>(null);

  // ── Form state ──
  const [formSaving, setFormSaving] = useState(false);
  const [locForm, setLocForm] = useState({ name: '', code: '', address: '', location_type: 'warehouse' });
  const [zoneForm, setZoneForm] = useState({ name: '', code: '', storage_requirement: 'room_temp' as StorageRequirement, temperature_min: '', temperature_max: '', notes: '' });
  const [binForm, setBinForm] = useState({ bin_code: '', bin_type: 'primary' as BinType, description: '', max_weight: '', max_volume: '' });
  const [invForm, setInvForm] = useState({ product_id: '', lot_id: '', quantity: '' });
  const [adjustQty, setAdjustQty] = useState('');

  // ── Data loading ──
  const loadLocations = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    const { data: locs } = await supabase
      .from('locations')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name');

    const allLocations = locs || [];

    // Get zone counts per location
    const { data: allZones } = await supabase
      .from('zones')
      .select('id, location_id')
      .eq('tenant_id', tenantId);

    // Get bin counts per location
    const { data: allBins } = await supabase
      .from('bins')
      .select('id, location_id')
      .eq('tenant_id', tenantId);

    // Get inventory counts per location via bins
    const { data: allInv } = await supabase
      .from('bin_inventory')
      .select('bin_id, quantity')
      .eq('tenant_id', tenantId);

    const binLocationMap: Record<string, string> = {};
    for (const b of allBins || []) {
      binLocationMap[b.id] = b.location_id;
    }

    const locationsWithCounts: LocationWithCounts[] = allLocations.map((loc) => {
      const zoneCount = (allZones || []).filter((z) => z.location_id === loc.id).length;
      const locBins = (allBins || []).filter((b) => b.location_id === loc.id);
      const locBinIds = new Set(locBins.map((b) => b.id));
      const itemCount = (allInv || []).filter((i) => locBinIds.has(i.bin_id)).reduce((sum, i) => sum + (i.quantity || 0), 0);
      return { ...loc, zone_count: zoneCount, bin_count: locBins.length, item_count: itemCount };
    });

    setLocations(locationsWithCounts);
    setLoading(false);
  }, [tenantId]);

  const loadLocationDetail = useCallback(async (locationId: string) => {
    if (!tenantId) return;
    setLoading(true);

    const [locRes, zonesRes, binsRes] = await Promise.all([
      supabase.from('locations').select('*').eq('id', locationId).single(),
      supabase.from('zones').select('*').eq('tenant_id', tenantId).eq('location_id', locationId).order('name'),
      supabase.from('bins').select('*').eq('tenant_id', tenantId).eq('location_id', locationId).order('bin_code'),
    ]);

    setCurrentLocation(locRes.data);

    const zoneList = zonesRes.data || [];
    const binList = binsRes.data || [];

    // Get inventory for all bins in location
    const binIds = binList.map((b) => b.id);
    let invData: { bin_id: string; quantity: number }[] = [];
    if (binIds.length > 0) {
      const { data } = await supabase
        .from('bin_inventory')
        .select('bin_id, quantity')
        .eq('tenant_id', tenantId)
        .in('bin_id', binIds);
      invData = data || [];
    }

    const zonesWithCounts: ZoneWithCounts[] = zoneList.map((z) => {
      const zoneBins = binList.filter((b) => b.zone_id === z.id);
      const zoneBinIds = new Set(zoneBins.map((b) => b.id));
      const itemCount = invData.filter((i) => zoneBinIds.has(i.bin_id)).reduce((sum, i) => sum + (i.quantity || 0), 0);
      return { ...z, bin_count: zoneBins.length, item_count: itemCount };
    });

    setZones(zonesWithCounts);

    // Also set bins that have no zone (directly in location)
    const binsNoZone = binList.filter((b) => !b.zone_id);
    const binsWithCounts: BinWithCounts[] = binsNoZone.map((b) => {
      const items = invData.filter((i) => i.bin_id === b.id);
      return { ...b, item_count: items.length, total_quantity: items.reduce((s, i) => s + (i.quantity || 0), 0) };
    });
    setBins(binsWithCounts);

    setLoading(false);
  }, [tenantId]);

  const loadZoneDetail = useCallback(async (zoneId: string, locationId: string) => {
    if (!tenantId) return;
    setLoading(true);

    const [locRes, zoneRes, binsRes] = await Promise.all([
      supabase.from('locations').select('*').eq('id', locationId).single(),
      supabase.from('zones').select('*').eq('id', zoneId).single(),
      supabase.from('bins').select('*').eq('tenant_id', tenantId).eq('zone_id', zoneId).order('bin_code'),
    ]);

    setCurrentLocation(locRes.data);
    setCurrentZone(zoneRes.data);

    const binList = binsRes.data || [];
    const binIds = binList.map((b) => b.id);

    let invData: { bin_id: string; quantity: number }[] = [];
    if (binIds.length > 0) {
      const { data } = await supabase
        .from('bin_inventory')
        .select('bin_id, quantity')
        .eq('tenant_id', tenantId)
        .in('bin_id', binIds);
      invData = data || [];
    }

    const binsWithCounts: BinWithCounts[] = binList.map((b) => {
      const items = invData.filter((i) => i.bin_id === b.id);
      return { ...b, item_count: items.length, total_quantity: items.reduce((s, i) => s + (i.quantity || 0), 0) };
    });
    setBins(binsWithCounts);
    setLoading(false);
  }, [tenantId]);

  const loadBinDetail = useCallback(async (binId: string, zoneId: string, locationId: string) => {
    if (!tenantId) return;
    setLoading(true);

    const [locRes, zoneRes, binRes, invRes, assignRes] = await Promise.all([
      supabase.from('locations').select('*').eq('id', locationId).single(),
      zoneId ? supabase.from('zones').select('*').eq('id', zoneId).single() : Promise.resolve({ data: null }),
      supabase.from('bins').select('*').eq('id', binId).single(),
      supabase.from('bin_inventory').select('*, product:products(*), lot:lots(*)').eq('tenant_id', tenantId).eq('bin_id', binId),
      supabase.from('product_bin_assignments').select('*, product:products(*)').eq('tenant_id', tenantId).eq('bin_id', binId),
    ]);

    setCurrentLocation(locRes.data);
    setCurrentZone(zoneRes.data);
    setCurrentBin(binRes.data);
    setBinInventory(invRes.data || []);
    setBinAssignments(assignRes.data || []);

    // Load products and lots for add inventory dialog
    const [prodRes, lotRes] = await Promise.all([
      supabase.from('products').select('*').eq('tenant_id', tenantId).eq('is_archived', false).order('name'),
      supabase.from('lots').select('*').eq('tenant_id', tenantId).eq('status', 'active').order('lot_number'),
    ]);
    setProducts(prodRes.data || []);
    setLots(lotRes.data || []);

    setLoading(false);
  }, [tenantId]);

  // ── Effect: load data based on drill level ──
  useEffect(() => {
    setSearchQuery('');
    if (drill.level === 'locations') {
      loadLocations();
    } else if (drill.level === 'location') {
      loadLocationDetail(drill.locationId);
    } else if (drill.level === 'zone') {
      loadZoneDetail(drill.zoneId, drill.locationId);
    } else if (drill.level === 'bin') {
      loadBinDetail(drill.binId, drill.zoneId, drill.locationId);
    }
  }, [drill, loadLocations, loadLocationDetail, loadZoneDetail, loadBinDetail]);

  // ── Navigation helpers ──
  function goToLocations() {
    setDrill({ level: 'locations' });
  }
  function goToLocation(locationId: string) {
    setDrill({ level: 'location', locationId });
  }
  function goToZone(locationId: string, zoneId: string) {
    setDrill({ level: 'zone', locationId, zoneId });
  }
  function goToBin(locationId: string, zoneId: string, binId: string) {
    setDrill({ level: 'bin', locationId, zoneId, binId });
  }

  // ── Dialog openers ──
  function openLocationDialog(loc: Location | null) {
    setEditingLocation(loc);
    setLocForm(loc
      ? { name: loc.name, code: loc.code, address: loc.address || '', location_type: loc.location_type }
      : { name: '', code: '', address: '', location_type: 'warehouse' }
    );
    setLocationDialogOpen(true);
  }

  function openZoneDialog(zone: Zone | null) {
    setEditingZone(zone);
    setZoneForm(zone
      ? { name: zone.name, code: zone.code, storage_requirement: zone.storage_requirement, temperature_min: zone.temperature_min?.toString() || '', temperature_max: zone.temperature_max?.toString() || '', notes: zone.notes || '' }
      : { name: '', code: '', storage_requirement: 'room_temp', temperature_min: '', temperature_max: '', notes: '' }
    );
    setZoneDialogOpen(true);
  }

  function openBinDialog(bin: Bin | null) {
    setEditingBin(bin);
    setBinForm(bin
      ? { bin_code: bin.bin_code, bin_type: bin.bin_type, description: bin.description || '', max_weight: bin.max_weight?.toString() || '', max_volume: bin.max_volume?.toString() || '' }
      : { bin_code: '', bin_type: 'primary', description: '', max_weight: '', max_volume: '' }
    );
    setBinDialogOpen(true);
  }

  function openInventoryDialog() {
    setInvForm({ product_id: '', lot_id: '', quantity: '' });
    setInventoryDialogOpen(true);
  }

  function openAdjustDialog(inv: BinInventoryRow) {
    setAdjustingInventory(inv);
    setAdjustQty(inv.quantity.toString());
    setAdjustDialogOpen(true);
  }

  function openDeleteDialog(type: string, id: string, name: string) {
    setDeleteTarget({ type, id, name });
    setDeleteDialogOpen(true);
  }

  // ── Save handlers ──
  async function saveLocation() {
    if (!tenantId || !locForm.name || !locForm.code) {
      toast.error('Name and code are required');
      return;
    }
    setFormSaving(true);
    const fields = {
      name: locForm.name,
      code: locForm.code,
      address: locForm.address || null,
      location_type: locForm.location_type,
    };

    if (editingLocation) {
      const { error } = await supabase.from('locations').update(fields).eq('id', editingLocation.id);
      if (error) { toast.error(error.message); setFormSaving(false); return; }
      toast.success('Location updated');
    } else {
      const { error } = await supabase.from('locations').insert({ ...fields, tenant_id: tenantId, is_active: true });
      if (error) { toast.error(error.message); setFormSaving(false); return; }
      toast.success('Location created');
    }
    setFormSaving(false);
    setLocationDialogOpen(false);
    if (drill.level === 'locations') loadLocations();
    else if (drill.level === 'location') loadLocationDetail((drill as { locationId: string }).locationId);
  }

  async function saveZone() {
    if (!tenantId || !zoneForm.name || !zoneForm.code) {
      toast.error('Name and code are required');
      return;
    }
    if (drill.level !== 'location' && drill.level !== 'zone') return;
    const locationId = drill.locationId;

    setFormSaving(true);
    const fields = {
      name: zoneForm.name,
      code: zoneForm.code,
      location_id: locationId,
      storage_requirement: zoneForm.storage_requirement,
      temperature_min: zoneForm.temperature_min ? parseFloat(zoneForm.temperature_min) : null,
      temperature_max: zoneForm.temperature_max ? parseFloat(zoneForm.temperature_max) : null,
      notes: zoneForm.notes || null,
    };

    if (editingZone) {
      const { error } = await supabase.from('zones').update(fields).eq('id', editingZone.id);
      if (error) { toast.error(error.message); setFormSaving(false); return; }
      toast.success('Zone updated');
    } else {
      const { error } = await supabase.from('zones').insert({ ...fields, tenant_id: tenantId });
      if (error) { toast.error(error.message); setFormSaving(false); return; }
      toast.success('Zone created');
    }
    setFormSaving(false);
    setZoneDialogOpen(false);
    loadLocationDetail(locationId);
  }

  async function saveBin() {
    if (!tenantId || !binForm.bin_code) {
      toast.error('Bin code is required');
      return;
    }
    if (drill.level !== 'zone' && drill.level !== 'location') return;
    const locationId = drill.locationId;
    const zoneId = drill.level === 'zone' ? drill.zoneId : null;

    setFormSaving(true);
    const fields = {
      bin_code: binForm.bin_code,
      bin_type: binForm.bin_type,
      location_id: locationId,
      zone_id: zoneId,
      description: binForm.description || null,
      max_weight: binForm.max_weight ? parseFloat(binForm.max_weight) : null,
      max_volume: binForm.max_volume ? parseFloat(binForm.max_volume) : null,
      is_active: true,
    };

    if (editingBin) {
      const { error } = await supabase.from('bins').update(fields).eq('id', editingBin.id);
      if (error) { toast.error(error.message); setFormSaving(false); return; }
      toast.success('Bin updated');
    } else {
      const { error } = await supabase.from('bins').insert({ ...fields, tenant_id: tenantId });
      if (error) { toast.error(error.message); setFormSaving(false); return; }
      toast.success('Bin created');
    }
    setFormSaving(false);
    setBinDialogOpen(false);
    if (drill.level === 'zone') loadZoneDetail(drill.zoneId, drill.locationId);
    else loadLocationDetail(locationId);
  }

  async function saveInventory() {
    if (!tenantId || !invForm.product_id || !invForm.quantity) {
      toast.error('Product and quantity are required');
      return;
    }
    if (drill.level !== 'bin') return;

    setFormSaving(true);
    const { error } = await supabase.from('bin_inventory').insert({
      tenant_id: tenantId,
      bin_id: drill.binId,
      product_id: invForm.product_id,
      lot_id: invForm.lot_id || null,
      quantity: parseInt(invForm.quantity),
    });
    if (error) { toast.error(error.message); setFormSaving(false); return; }
    toast.success('Inventory added');
    setFormSaving(false);
    setInventoryDialogOpen(false);
    loadBinDetail(drill.binId, drill.zoneId, drill.locationId);
  }

  async function saveAdjustment() {
    if (!adjustingInventory || !adjustQty) {
      toast.error('Quantity is required');
      return;
    }
    setFormSaving(true);
    const { error } = await supabase
      .from('bin_inventory')
      .update({ quantity: parseInt(adjustQty) })
      .eq('id', adjustingInventory.id);
    if (error) { toast.error(error.message); setFormSaving(false); return; }
    toast.success('Quantity adjusted');
    setFormSaving(false);
    setAdjustDialogOpen(false);
    if (drill.level === 'bin') loadBinDetail(drill.binId, drill.zoneId, drill.locationId);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setFormSaving(true);
    const { error } = await supabase.from(
      deleteTarget.type === 'location' ? 'locations'
        : deleteTarget.type === 'zone' ? 'zones'
        : deleteTarget.type === 'bin' ? 'bins'
        : 'bin_inventory'
    ).delete().eq('id', deleteTarget.id);

    if (error) { toast.error(error.message); setFormSaving(false); return; }
    toast.success(`${deleteTarget.type === 'bin_inventory' ? 'Inventory row' : deleteTarget.type.charAt(0).toUpperCase() + deleteTarget.type.slice(1)} deleted`);
    setFormSaving(false);
    setDeleteDialogOpen(false);
    setDeleteTarget(null);

    // Reload current level
    if (deleteTarget.type === 'location') loadLocations();
    else if (deleteTarget.type === 'zone' && drill.level === 'location') loadLocationDetail((drill as { locationId: string }).locationId);
    else if (deleteTarget.type === 'bin' && drill.level === 'zone') loadZoneDetail((drill as { zoneId: string; locationId: string }).zoneId, (drill as { locationId: string }).locationId);
    else if (drill.level === 'bin') loadBinDetail((drill as { binId: string }).binId, (drill as { zoneId: string }).zoneId, (drill as { locationId: string }).locationId);
  }

  // ── Breadcrumbs ──
  function renderBreadcrumbs() {
    const crumbs: { label: string; onClick?: () => void }[] = [];

    crumbs.push({
      label: 'All Locations',
      onClick: drill.level !== 'locations' ? goToLocations : undefined,
    });

    if (drill.level === 'location' || drill.level === 'zone' || drill.level === 'bin') {
      crumbs.push({
        label: currentLocation?.name || '...',
        onClick: drill.level !== 'location' ? () => goToLocation(drill.locationId) : undefined,
      });
    }

    if (drill.level === 'zone' || drill.level === 'bin') {
      if (currentZone) {
        crumbs.push({
          label: `Zone: ${currentZone.name}`,
          onClick: drill.level !== 'zone' ? () => goToZone(drill.locationId, drill.zoneId) : undefined,
        });
      }
    }

    if (drill.level === 'bin') {
      crumbs.push({
        label: `Bin: ${currentBin?.bin_code || '...'}`,
      });
    }

    return (
      <nav className="flex items-center gap-1 text-sm flex-wrap">
        {crumbs.map((crumb, i) => (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            {crumb.onClick ? (
              <button
                onClick={crumb.onClick}
                className="text-primary hover:underline font-medium"
              >
                {crumb.label}
              </button>
            ) : (
              <span className="text-muted-foreground font-medium">{crumb.label}</span>
            )}
          </div>
        ))}
      </nav>
    );
  }

  // ── Filtered data ──
  const filteredLocations = useMemo(() => {
    if (!searchQuery) return locations;
    const q = searchQuery.toLowerCase();
    return locations.filter(
      (l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q) || l.address?.toLowerCase().includes(q)
    );
  }, [locations, searchQuery]);

  const filteredZones = useMemo(() => {
    if (!searchQuery) return zones;
    const q = searchQuery.toLowerCase();
    return zones.filter(
      (z) => z.name.toLowerCase().includes(q) || z.code.toLowerCase().includes(q)
    );
  }, [zones, searchQuery]);

  const filteredBins = useMemo(() => {
    if (!searchQuery) return bins;
    const q = searchQuery.toLowerCase();
    return bins.filter(
      (b) => b.bin_code.toLowerCase().includes(q) || b.bin_type.toLowerCase().includes(q)
    );
  }, [bins, searchQuery]);

  const filteredInventory = useMemo(() => {
    if (!searchQuery) return binInventory;
    const q = searchQuery.toLowerCase();
    return binInventory.filter(
      (i) =>
        i.product?.name?.toLowerCase().includes(q) ||
        i.product?.sku?.toLowerCase().includes(q) ||
        i.lot?.lot_number?.toLowerCase().includes(q)
    );
  }, [binInventory, searchQuery]);

  // ── Stats ──
  const totalZones = locations.reduce((s, l) => s + l.zone_count, 0);
  const totalBins = locations.reduce((s, l) => s + l.bin_count, 0);
  const totalItems = locations.reduce((s, l) => s + l.item_count, 0);

  // ── Render ──
  return (
    <div className="space-y-6">
      <PageHeader
        title="Locations"
        description="Manage storage locations, zones, bins, and inventory placement"
      />

      {/* Breadcrumbs */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {drill.level !== 'locations' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (drill.level === 'location') goToLocations();
                else if (drill.level === 'zone') goToLocation(drill.locationId);
                else if (drill.level === 'bin') {
                  if (drill.zoneId) goToZone(drill.locationId, drill.zoneId);
                  else goToLocation(drill.locationId);
                }
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
          {renderBreadcrumbs()}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* ────────────────────────────────────────────── */}
      {/* LEVEL 1: All Locations                        */}
      {/* ────────────────────────────────────────────── */}
      {drill.level === 'locations' && (
        <>
          {/* Stats */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total Locations" value={formatNumber(locations.length)} icon={MapPin} />
            <StatCard title="Total Zones" value={formatNumber(totalZones)} icon={Layers} />
            <StatCard title="Total Bins" value={formatNumber(totalBins)} icon={Box} />
            <StatCard title="Total Inventory" value={formatNumber(totalItems)} icon={Package} />
          </div>

          {/* Add button */}
          <div className="flex justify-end">
            <Button onClick={() => openLocationDialog(null)}>
              <Plus className="h-4 w-4 mr-2" /> Add Location
            </Button>
          </div>

          {/* Location cards grid */}
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading locations...</div>
          ) : filteredLocations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {searchQuery ? 'No locations match your search.' : 'No locations yet. Create your first location to get started.'}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredLocations.map((loc) => (
                <Card
                  key={loc.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors group"
                  onClick={() => goToLocation(loc.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base group-hover:text-primary transition-colors">
                          {loc.name}
                        </CardTitle>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{loc.code}</code>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="capitalize">{loc.location_type.replace('_', ' ')}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); openLocationDialog(loc); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                          onClick={(e) => { e.stopPropagation(); openDeleteDialog('location', loc.id, loc.name); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {loc.address && (
                      <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {loc.address}
                      </p>
                    )}
                    <Separator className="mb-3" />
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-semibold">{loc.zone_count}</p>
                        <p className="text-xs text-muted-foreground">Zones</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold">{loc.bin_count}</p>
                        <p className="text-xs text-muted-foreground">Bins</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold">{formatNumber(loc.item_count)}</p>
                        <p className="text-xs text-muted-foreground">Items</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ────────────────────────────────────────────── */}
      {/* LEVEL 2: Single Location                      */}
      {/* ────────────────────────────────────────────── */}
      {drill.level === 'location' && currentLocation && (
        <>
          {/* Location header */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold">{currentLocation.name}</h2>
                    <Badge variant="outline" className="capitalize">{currentLocation.location_type.replace('_', ' ')}</Badge>
                    <Badge variant={currentLocation.is_active ? 'default' : 'secondary'}>
                      {currentLocation.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>Code: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{currentLocation.code}</code></span>
                    {currentLocation.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{currentLocation.address}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openLocationDialog(currentLocation)}>
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatCard title="Zones" value={zones.length} icon={Layers} />
            <StatCard title="Bins" value={bins.length + zones.reduce((s, z) => s + z.bin_count, 0)} icon={Box} />
            <StatCard title="Total Items" value={formatNumber(zones.reduce((s, z) => s + z.item_count, 0) + bins.reduce((s, b) => s + b.total_quantity, 0))} icon={Package} />
            <StatCard
              title="Temperature Zones"
              value={zones.filter((z) => z.storage_requirement !== 'room_temp').length}
              icon={Warehouse}
              description={`${zones.filter((z) => z.storage_requirement === 'refrigerated').length} refrigerated, ${zones.filter((z) => z.storage_requirement === 'frozen').length} frozen`}
            />
          </div>

          {/* Add Zone button */}
          <div className="flex justify-end gap-2">
            {zones.length === 0 && (
              <Button variant="outline" onClick={() => openBinDialog(null)}>
                <Plus className="h-4 w-4 mr-2" /> Add Bin
              </Button>
            )}
            <Button onClick={() => openZoneDialog(null)}>
              <Plus className="h-4 w-4 mr-2" /> Add Zone
            </Button>
          </div>

          {/* Zone cards */}
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : zones.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredZones.map((zone) => (
                <Card
                  key={zone.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors group"
                  onClick={() => goToZone(drill.locationId, zone.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base group-hover:text-primary transition-colors">
                          {zone.name}
                        </CardTitle>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{zone.code}</code>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge className={storageBadgeClass(zone.storage_requirement)} variant={storageBadgeVariant(zone.storage_requirement)}>
                          {storageLabel(zone.storage_requirement)}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); openZoneDialog(zone); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                          onClick={(e) => { e.stopPropagation(); openDeleteDialog('zone', zone.id, zone.name); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {(zone.temperature_min !== null || zone.temperature_max !== null) && (
                      <p className="text-xs text-muted-foreground mb-3">
                        Temp: {zone.temperature_min !== null ? `${zone.temperature_min}` : '---'} to {zone.temperature_max !== null ? `${zone.temperature_max}` : '---'} °F
                      </p>
                    )}
                    <Separator className="mb-3" />
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div>
                        <p className="text-lg font-semibold">{zone.bin_count}</p>
                        <p className="text-xs text-muted-foreground">Bins</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold">{formatNumber(zone.item_count)}</p>
                        <p className="text-xs text-muted-foreground">Items</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}

          {/* Bins directly in location (no zone) */}
          {zones.length === 0 && bins.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Bins in this Location</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bin Code</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Total Qty</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBins.map((bin) => (
                        <TableRow
                          key={bin.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => goToBin(drill.locationId, '', bin.id)}
                        >
                          <TableCell className="font-medium">{bin.bin_code}</TableCell>
                          <TableCell><Badge variant="outline" className="capitalize">{bin.bin_type}</Badge></TableCell>
                          <TableCell>{bin.item_count}</TableCell>
                          <TableCell>{formatNumber(bin.total_quantity)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openBinDialog(bin); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); openDeleteDialog('bin', bin.id, bin.bin_code); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ────────────────────────────────────────────── */}
      {/* LEVEL 3: Single Zone                          */}
      {/* ────────────────────────────────────────────── */}
      {drill.level === 'zone' && currentZone && (
        <>
          {/* Zone header */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold">{currentZone.name}</h2>
                    <Badge className={storageBadgeClass(currentZone.storage_requirement)} variant={storageBadgeVariant(currentZone.storage_requirement)}>
                      {storageLabel(currentZone.storage_requirement)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>Code: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{currentZone.code}</code></span>
                    {(currentZone.temperature_min !== null || currentZone.temperature_max !== null) && (
                      <span>
                        Temp: {currentZone.temperature_min ?? '---'} to {currentZone.temperature_max ?? '---'} °F
                      </span>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => openZoneDialog(currentZone)}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Add Bin */}
          <div className="flex justify-end">
            <Button onClick={() => openBinDialog(null)}>
              <Plus className="h-4 w-4 mr-2" /> Add Bin
            </Button>
          </div>

          {/* Bins table */}
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Bins ({bins.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {filteredBins.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {searchQuery ? 'No bins match your search.' : 'No bins in this zone yet.'}
                  </p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Bin Code</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead>Total Qty</TableHead>
                          <TableHead>Capacity</TableHead>
                          <TableHead className="w-[80px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredBins.map((bin) => {
                          const utilization = bin.max_weight
                            ? Math.min(100, Math.round((bin.total_quantity / bin.max_weight) * 100))
                            : null;
                          return (
                            <TableRow
                              key={bin.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => goToBin(drill.locationId, drill.zoneId, bin.id)}
                            >
                              <TableCell className="font-medium">{bin.bin_code}</TableCell>
                              <TableCell><Badge variant="outline" className="capitalize">{bin.bin_type}</Badge></TableCell>
                              <TableCell>{bin.item_count}</TableCell>
                              <TableCell>{formatNumber(bin.total_quantity)}</TableCell>
                              <TableCell>
                                {utilization !== null ? (
                                  <div className="flex items-center gap-2">
                                    <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${utilization > 90 ? 'bg-red-500' : utilization > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                        style={{ width: `${utilization}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-muted-foreground">{utilization}%</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">---</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openBinDialog(bin); }}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); openDeleteDialog('bin', bin.id, bin.bin_code); }}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ────────────────────────────────────────────── */}
      {/* LEVEL 4: Single Bin                           */}
      {/* ────────────────────────────────────────────── */}
      {drill.level === 'bin' && currentBin && (
        <>
          {/* Bin header */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold">{currentBin.bin_code}</h2>
                    <Badge variant="outline" className="capitalize">{currentBin.bin_type}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                    {currentLocation && <span>Location: {currentLocation.name}</span>}
                    {currentZone && <span>Zone: {currentZone.name}</span>}
                    {currentBin.description && <span>{currentBin.description}</span>}
                    {currentBin.max_weight && <span>Max Weight: {currentBin.max_weight}</span>}
                    {currentBin.max_volume && <span>Max Volume: {currentBin.max_volume}</span>}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => openBinDialog(currentBin)}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Add Inventory */}
          <div className="flex justify-end">
            <Button onClick={openInventoryDialog}>
              <Plus className="h-4 w-4 mr-2" /> Add Inventory
            </Button>
          </div>

          {/* Inventory table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bin Inventory ({binInventory.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : filteredInventory.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {searchQuery ? 'No inventory matches your search.' : 'No inventory in this bin.'}
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Lot Number</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Last Updated</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[120px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInventory.map((inv) => {
                        // Check reorder point from assignments
                        const assignment = binAssignments.find(
                          (a) => a.product_id === inv.product_id
                        );
                        const belowReorder = assignment && assignment.reorder_point > 0 && inv.quantity <= assignment.reorder_point;

                        return (
                          <TableRow key={inv.id} className={belowReorder ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                            <TableCell className="font-medium">{inv.product?.name || '---'}</TableCell>
                            <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{inv.product?.sku || '---'}</code></TableCell>
                            <TableCell>{inv.lot?.lot_number || '---'}</TableCell>
                            <TableCell>
                              <span className={belowReorder ? 'text-red-600 font-semibold' : ''}>
                                {formatNumber(inv.quantity)}
                              </span>
                              {belowReorder && (
                                <AlertTriangle className="inline h-3.5 w-3.5 ml-1 text-red-500" />
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDateTime(inv.updated_at)}</TableCell>
                            <TableCell>
                              {belowReorder ? (
                                <Badge variant="destructive">Below Reorder</Badge>
                              ) : (
                                <Badge variant="secondary">OK</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="outline" size="sm" onClick={() => openAdjustDialog(inv)}>
                                  Adjust
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => openDeleteDialog('bin_inventory', inv.id, inv.product?.name || 'item')}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Product Bin Assignments */}
          {binAssignments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Product Bin Assignments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Min Qty</TableHead>
                        <TableHead>Max Qty</TableHead>
                        <TableHead>Reorder Point</TableHead>
                        <TableHead>UOM</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {binAssignments.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.product?.name || '---'}</TableCell>
                          <TableCell><Badge variant="outline" className="capitalize">{a.bin_role}</Badge></TableCell>
                          <TableCell>{formatNumber(a.min_quantity)}</TableCell>
                          <TableCell>{formatNumber(a.max_quantity)}</TableCell>
                          <TableCell>{formatNumber(a.reorder_point)}</TableCell>
                          <TableCell>{a.unit_of_measure}</TableCell>
                          <TableCell>
                            <Badge variant={a.is_active ? 'default' : 'secondary'}>
                              {a.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ────────────────────────────────────────────── */}
      {/* DIALOGS                                        */}
      {/* ────────────────────────────────────────────── */}

      {/* Location Dialog */}
      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLocation ? 'Edit Location' : 'New Location'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} placeholder="Main Warehouse" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Code *</Label>
                <Input value={locForm.code} onChange={(e) => setLocForm({ ...locForm, code: e.target.value })} placeholder="WH-01" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={locForm.location_type} onValueChange={(v) => setLocForm({ ...locForm, location_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">Warehouse</SelectItem>
                    <SelectItem value="store">Store</SelectItem>
                    <SelectItem value="office">Office</SelectItem>
                    <SelectItem value="receiving_dock">Receiving Dock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={locForm.address} onChange={(e) => setLocForm({ ...locForm, address: e.target.value })} placeholder="123 Main St" />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setLocationDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveLocation} disabled={formSaving}>
                {formSaving ? 'Saving...' : editingLocation ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Zone Dialog */}
      <Dialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingZone ? 'Edit Zone' : 'New Zone'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} placeholder="Cold Storage A" />
              </div>
              <div className="space-y-2">
                <Label>Code *</Label>
                <Input value={zoneForm.code} onChange={(e) => setZoneForm({ ...zoneForm, code: e.target.value })} placeholder="CS-A" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Storage Requirement</Label>
              <Select value={zoneForm.storage_requirement} onValueChange={(v) => setZoneForm({ ...zoneForm, storage_requirement: v as StorageRequirement })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="room_temp">Room Temperature</SelectItem>
                  <SelectItem value="refrigerated">Refrigerated</SelectItem>
                  <SelectItem value="frozen">Frozen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Temp (°F)</Label>
                <Input type="number" value={zoneForm.temperature_min} onChange={(e) => setZoneForm({ ...zoneForm, temperature_min: e.target.value })} placeholder="e.g. 36" />
              </div>
              <div className="space-y-2">
                <Label>Max Temp (°F)</Label>
                <Input type="number" value={zoneForm.temperature_max} onChange={(e) => setZoneForm({ ...zoneForm, temperature_max: e.target.value })} placeholder="e.g. 46" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={zoneForm.notes} onChange={(e) => setZoneForm({ ...zoneForm, notes: e.target.value })} placeholder="Optional notes" />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setZoneDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveZone} disabled={formSaving}>
                {formSaving ? 'Saving...' : editingZone ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bin Dialog */}
      <Dialog open={binDialogOpen} onOpenChange={setBinDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBin ? 'Edit Bin' : 'New Bin'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bin Code *</Label>
                <Input value={binForm.bin_code} onChange={(e) => setBinForm({ ...binForm, bin_code: e.target.value })} placeholder="A-01-03" />
              </div>
              <div className="space-y-2">
                <Label>Bin Type</Label>
                <Select value={binForm.bin_type} onValueChange={(v) => setBinForm({ ...binForm, bin_type: v as BinType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">Primary</SelectItem>
                    <SelectItem value="secondary">Secondary</SelectItem>
                    <SelectItem value="bulk">Bulk</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="returns">Returns</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={binForm.description} onChange={(e) => setBinForm({ ...binForm, description: e.target.value })} placeholder="Optional description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Weight</Label>
                <Input type="number" value={binForm.max_weight} onChange={(e) => setBinForm({ ...binForm, max_weight: e.target.value })} placeholder="e.g. 500" />
              </div>
              <div className="space-y-2">
                <Label>Max Volume</Label>
                <Input type="number" value={binForm.max_volume} onChange={(e) => setBinForm({ ...binForm, max_volume: e.target.value })} placeholder="e.g. 100" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setBinDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveBin} disabled={formSaving}>
                {formSaving ? 'Saving...' : editingBin ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Inventory Dialog */}
      <Dialog open={inventoryDialogOpen} onOpenChange={setInventoryDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Inventory to Bin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product *</Label>
              <Select value={invForm.product_id} onValueChange={(v) => setInvForm({ ...invForm, product_id: v, lot_id: '' })}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Lot (optional)</Label>
              <Select value={invForm.lot_id} onValueChange={(v) => setInvForm({ ...invForm, lot_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select lot" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {lots
                    .filter((l) => !invForm.product_id || l.product_id === invForm.product_id)
                    .map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.lot_number}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity *</Label>
              <Input type="number" value={invForm.quantity} onChange={(e) => setInvForm({ ...invForm, quantity: e.target.value })} placeholder="e.g. 100" />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setInventoryDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveInventory} disabled={formSaving}>
                {formSaving ? 'Saving...' : 'Add'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Adjust Quantity Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adjust Quantity</DialogTitle>
          </DialogHeader>
          {adjustingInventory && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Product: <span className="font-medium text-foreground">{adjustingInventory.product?.name}</span>
                {adjustingInventory.lot && <span className="ml-2">Lot: {adjustingInventory.lot.lot_number}</span>}
              </p>
              <div className="space-y-2">
                <Label>New Quantity *</Label>
                <Input
                  type="number"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setAdjustDialogOpen(false)}>Cancel</Button>
                <Button onClick={saveAdjustment} disabled={formSaving}>
                  {formSaving ? 'Saving...' : 'Update'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={formSaving}>
              {formSaving ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
