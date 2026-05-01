'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Plus, Pencil, Thermometer, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime, storageLabel } from '@/lib/format';
import type { Location, Zone, TemperatureLog, StorageRequirement } from '@/types/database';

export default function LocationsPage() {
  const { tenantId, user } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [zones, setZones] = useState<(Zone & { location?: Location })[]>([]);
  const [tempLogs, setTempLogs] = useState<Record<string, TemperatureLog[]>>({});
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [editLocation, setEditLocation] = useState<Location | null>(null);
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [editZone, setEditZone] = useState<Zone | null>(null);
  const [tempDialogOpen, setTempDialogOpen] = useState(false);
  const [tempZone, setTempZone] = useState<Zone | null>(null);

  // Location form
  const [locName, setLocName] = useState('');
  const [locCode, setLocCode] = useState('');
  const [locType, setLocType] = useState('warehouse');
  const [locAddress, setLocAddress] = useState('');
  const [locActive, setLocActive] = useState(true);
  const [locSaving, setLocSaving] = useState(false);

  // Zone form
  const [zoneName, setZoneName] = useState('');
  const [zoneCode, setZoneCode] = useState('');
  const [zoneLocationId, setZoneLocationId] = useState('');
  const [zoneStorage, setZoneStorage] = useState<StorageRequirement>('room_temp');
  const [zoneTempMin, setZoneTempMin] = useState('');
  const [zoneTempMax, setZoneTempMax] = useState('');
  const [zoneNotes, setZoneNotes] = useState('');
  const [zoneSaving, setZoneSaving] = useState(false);

  // Temp log form
  const [tempValue, setTempValue] = useState('');
  const [tempNotes, setTempNotes] = useState('');
  const [tempSaving, setTempSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    const [locRes, zoneRes] = await Promise.all([
      supabase
        .from('locations')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name'),
      supabase
        .from('zones')
        .select('*, location:locations(*)')
        .eq('tenant_id', tenantId)
        .order('name'),
    ]);

    const locs = locRes.data || [];
    const zns = zoneRes.data || [];
    setLocations(locs);
    setZones(zns);

    // Load recent temp logs for all zones (last 5 per zone)
    if (zns.length > 0) {
      const zoneIds = zns.map((z) => z.id);
      const { data: logs } = await supabase
        .from('temperature_logs')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('zone_id', zoneIds)
        .order('recorded_at', { ascending: false })
        .limit(100);

      const grouped: Record<string, TemperatureLog[]> = {};
      for (const log of logs || []) {
        if (!grouped[log.zone_id]) grouped[log.zone_id] = [];
        if (grouped[log.zone_id].length < 5) {
          grouped[log.zone_id].push(log);
        }
      }
      setTempLogs(grouped);
    }

    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // -- Location dialog helpers --
  function openLocationDialog(loc: Location | null) {
    setEditLocation(loc);
    if (loc) {
      setLocName(loc.name);
      setLocCode(loc.code);
      setLocType(loc.location_type);
      setLocAddress(loc.address || '');
      setLocActive(loc.is_active);
    } else {
      setLocName('');
      setLocCode('');
      setLocType('warehouse');
      setLocAddress('');
      setLocActive(true);
    }
    setLocationDialogOpen(true);
  }

  async function saveLocation() {
    if (!tenantId || !locName || !locCode) {
      toast.error('Name and code are required');
      return;
    }
    setLocSaving(true);
    const supabase = createClient();
    const fields = {
      name: locName,
      code: locCode,
      location_type: locType,
      address: locAddress || null,
      is_active: locActive,
    };

    if (editLocation) {
      const { error } = await supabase.from('locations').update(fields).eq('id', editLocation.id);
      if (error) { toast.error(error.message); setLocSaving(false); return; }
      toast.success('Location updated');
    } else {
      const { error } = await supabase.from('locations').insert({ ...fields, tenant_id: tenantId });
      if (error) { toast.error(error.message); setLocSaving(false); return; }
      toast.success('Location created');
    }
    setLocSaving(false);
    setLocationDialogOpen(false);
    loadData();
  }

  // -- Zone dialog helpers --
  function openZoneDialog(zone: Zone | null) {
    setEditZone(zone);
    if (zone) {
      setZoneName(zone.name);
      setZoneCode(zone.code);
      setZoneLocationId(zone.location_id);
      setZoneStorage(zone.storage_requirement);
      setZoneTempMin(zone.temperature_min?.toString() || '');
      setZoneTempMax(zone.temperature_max?.toString() || '');
      setZoneNotes(zone.notes || '');
    } else {
      setZoneName('');
      setZoneCode('');
      setZoneLocationId(locations[0]?.id || '');
      setZoneStorage('room_temp');
      setZoneTempMin('');
      setZoneTempMax('');
      setZoneNotes('');
    }
    setZoneDialogOpen(true);
  }

  async function saveZone() {
    if (!tenantId || !zoneName || !zoneCode || !zoneLocationId) {
      toast.error('Name, code, and location are required');
      return;
    }
    setZoneSaving(true);
    const supabase = createClient();
    const fields = {
      name: zoneName,
      code: zoneCode,
      location_id: zoneLocationId,
      storage_requirement: zoneStorage,
      temperature_min: zoneTempMin ? parseFloat(zoneTempMin) : null,
      temperature_max: zoneTempMax ? parseFloat(zoneTempMax) : null,
      notes: zoneNotes || null,
    };

    if (editZone) {
      const { error } = await supabase.from('zones').update(fields).eq('id', editZone.id);
      if (error) { toast.error(error.message); setZoneSaving(false); return; }
      toast.success('Zone updated');
    } else {
      const { error } = await supabase.from('zones').insert({ ...fields, tenant_id: tenantId });
      if (error) { toast.error(error.message); setZoneSaving(false); return; }
      toast.success('Zone created');
    }
    setZoneSaving(false);
    setZoneDialogOpen(false);
    loadData();
  }

  // -- Temperature log --
  function openTempDialog(zone: Zone) {
    setTempZone(zone);
    setTempValue('');
    setTempNotes('');
    setTempDialogOpen(true);
  }

  async function saveTemp() {
    if (!tenantId || !tempZone || !tempValue) {
      toast.error('Temperature reading is required');
      return;
    }
    setTempSaving(true);
    const supabase = createClient();
    const temp = parseFloat(tempValue);
    const isExcursion =
      (tempZone.temperature_min !== null && temp < tempZone.temperature_min) ||
      (tempZone.temperature_max !== null && temp > tempZone.temperature_max);

    const { error } = await supabase.from('temperature_logs').insert({
      tenant_id: tenantId,
      zone_id: tempZone.id,
      temperature: temp,
      is_excursion: isExcursion,
      recorded_by: user?.id || null,
      recorded_at: new Date().toISOString(),
      notes: tempNotes || null,
    });

    if (error) {
      toast.error(error.message);
      setTempSaving(false);
      return;
    }

    if (isExcursion) {
      toast.error('Temperature excursion recorded! Reading is outside acceptable range.');
    } else {
      toast.success('Temperature logged');
    }
    setTempSaving(false);
    setTempDialogOpen(false);
    loadData();
  }

  // Group zones by location
  const zonesByLocation: Record<string, Zone[]> = {};
  for (const zone of zones) {
    const locId = zone.location_id;
    if (!zonesByLocation[locId]) zonesByLocation[locId] = [];
    zonesByLocation[locId].push(zone);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Locations & Zones"
        description="Manage storage locations, zones, and temperature monitoring"
      />

      {/* ── Locations Section ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">Locations</CardTitle>
          <Button size="sm" onClick={() => openLocationDialog(null)}>
            <Plus className="h-4 w-4 mr-2" /> Add Location
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      {loading ? 'Loading...' : 'No locations found.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  locations.map((loc) => (
                    <TableRow key={loc.id}>
                      <TableCell className="font-medium">{loc.name}</TableCell>
                      <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{loc.code}</code></TableCell>
                      <TableCell className="capitalize">{loc.location_type}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{loc.address || '---'}</TableCell>
                      <TableCell>
                        <Badge variant={loc.is_active ? 'default' : 'secondary'}>
                          {loc.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openLocationDialog(loc)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Zones Section ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">Zones</CardTitle>
          <Button size="sm" onClick={() => openZoneDialog(null)} disabled={locations.length === 0}>
            <Plus className="h-4 w-4 mr-2" /> Add Zone
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {locations.length === 0 && !loading && (
            <p className="text-center text-muted-foreground py-8">Create a location first to add zones.</p>
          )}
          {locations.map((loc) => {
            const locZones = zonesByLocation[loc.id] || [];
            if (locZones.length === 0) return null;
            return (
              <div key={loc.id} className="space-y-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-medium">{loc.name} <span className="text-muted-foreground text-sm">({loc.code})</span></h3>
                </div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Zone</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Storage</TableHead>
                        <TableHead>Temp Range</TableHead>
                        <TableHead>Recent Readings</TableHead>
                        <TableHead className="w-[120px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {locZones.map((zone) => {
                        const logs = tempLogs[zone.id] || [];
                        return (
                          <TableRow key={zone.id}>
                            <TableCell className="font-medium">{zone.name}</TableCell>
                            <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{zone.code}</code></TableCell>
                            <TableCell>
                              <Badge variant="outline">{storageLabel(zone.storage_requirement)}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {zone.temperature_min !== null && zone.temperature_max !== null
                                ? `${zone.temperature_min}°F - ${zone.temperature_max}°F`
                                : zone.temperature_min !== null
                                  ? `Min ${zone.temperature_min}°F`
                                  : zone.temperature_max !== null
                                    ? `Max ${zone.temperature_max}°F`
                                    : '---'}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {logs.length === 0 ? (
                                  <span className="text-xs text-muted-foreground">No readings</span>
                                ) : (
                                  logs.map((log) => (
                                    <Badge
                                      key={log.id}
                                      variant={log.is_excursion ? 'destructive' : 'secondary'}
                                      className="text-xs"
                                      title={formatDateTime(log.recorded_at)}
                                    >
                                      {log.temperature}°F
                                    </Badge>
                                  ))
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => openTempDialog(zone)} title="Log temperature">
                                  <Thermometer className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => openZoneDialog(zone)} title="Edit zone">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Location Dialog ── */}
      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editLocation ? 'Edit Location' : 'New Location'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={locName} onChange={(e) => setLocName(e.target.value)} placeholder="Main Warehouse" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Code *</Label>
                <Input value={locCode} onChange={(e) => setLocCode(e.target.value)} placeholder="WH-01" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={locType} onValueChange={setLocType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">Warehouse</SelectItem>
                    <SelectItem value="pharmacy">Pharmacy</SelectItem>
                    <SelectItem value="clinic">Clinic</SelectItem>
                    <SelectItem value="office">Office</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea value={locAddress} onChange={(e) => setLocAddress(e.target.value)} rows={2} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={locActive} onCheckedChange={setLocActive} id="loc-active" />
              <Label htmlFor="loc-active">Active</Label>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setLocationDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveLocation} disabled={locSaving}>
                {locSaving ? 'Saving...' : editLocation ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Zone Dialog ── */}
      <Dialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editZone ? 'Edit Zone' : 'New Zone'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Location *</Label>
              <Select value={zoneLocationId} onValueChange={setZoneLocationId}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name} ({loc.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Zone Name *</Label>
                <Input value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="Cold Storage A" />
              </div>
              <div className="space-y-2">
                <Label>Code *</Label>
                <Input value={zoneCode} onChange={(e) => setZoneCode(e.target.value)} placeholder="CS-A" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Storage Requirement</Label>
              <Select value={zoneStorage} onValueChange={(v) => setZoneStorage(v as StorageRequirement)}>
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
                <Input type="number" value={zoneTempMin} onChange={(e) => setZoneTempMin(e.target.value)} placeholder="e.g. 36" />
              </div>
              <div className="space-y-2">
                <Label>Max Temp (°F)</Label>
                <Input type="number" value={zoneTempMax} onChange={(e) => setZoneTempMax(e.target.value)} placeholder="e.g. 46" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={zoneNotes} onChange={(e) => setZoneNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setZoneDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveZone} disabled={zoneSaving}>
                {zoneSaving ? 'Saving...' : editZone ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Temperature Log Dialog ── */}
      <Dialog open={tempDialogOpen} onOpenChange={setTempDialogOpen}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Temperature</DialogTitle>
          </DialogHeader>
          {tempZone && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Zone: <span className="font-medium text-foreground">{tempZone.name}</span>
                {tempZone.temperature_min !== null && tempZone.temperature_max !== null && (
                  <span className="ml-2">(Range: {tempZone.temperature_min}°F - {tempZone.temperature_max}°F)</span>
                )}
              </div>
              <div className="space-y-2">
                <Label>Temperature (°F) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={tempValue}
                  onChange={(e) => setTempValue(e.target.value)}
                  placeholder="e.g. 38.5"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={tempNotes} onChange={(e) => setTempNotes(e.target.value)} rows={2} />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setTempDialogOpen(false)}>Cancel</Button>
                <Button onClick={saveTemp} disabled={tempSaving}>
                  {tempSaving ? 'Saving...' : 'Log Reading'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
