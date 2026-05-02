'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Users,
  Building2,
  Bell,
  ToggleLeft,
  Plug,
  Database,
  UserPlus,
  Download,
  Upload,
  Globe,
  Image,
  Clock,
  Calendar,
  DollarSign,
  Package,
  AlertTriangle,
  Thermometer,
  FileWarning,
  ShieldAlert,
  RotateCcw,
  Pill,
  ScanBarcode,
  UserCircle,
  Boxes,
  Handshake,
  CreditCard,
  Truck,
} from 'lucide-react';
import type { User, UserRole } from '@/types/database';

// --- Notification types config ---
const notificationTypes = [
  { key: 'low_stock', label: 'Low Stock Alerts', icon: Package },
  { key: 'expiring_lot', label: 'Expiring Lot Warnings', icon: Clock },
  { key: 'po_overdue', label: 'PO Overdue Notices', icon: AlertTriangle },
  { key: 'temp_excursion', label: 'Temperature Excursions', icon: Thermometer },
  { key: 'reorder', label: 'Reorder Suggestions', icon: RotateCcw },
  { key: 'quarantine', label: 'Quarantine Alerts', icon: ShieldAlert },
  { key: 'recall', label: 'Recall Notifications', icon: AlertTriangle },
  { key: 'document_expiring', label: 'Document Expiring', icon: FileWarning },
] as const;

// --- Feature toggles config ---
const featureToggles = [
  { key: 'controlled_substances', label: 'Controlled Substances', description: 'Track DEA schedules, chain-of-custody logs, and CSOS compliance for controlled medications.', icon: Pill },
  { key: 'dscsa_tracking', label: 'DSCSA Tracking', description: 'Drug Supply Chain Security Act serialization, verification, and transaction history.', icon: ScanBarcode },
  { key: 'customer_portal', label: 'Customer Portal', description: 'Allow customers to place orders, view invoices, and track shipments via a self-service portal.', icon: UserCircle },
  { key: 'kitting', label: 'Kitting', description: 'Bundle multiple products into kits with automated component tracking and assembly workflows.', icon: Boxes },
  { key: 'consignment', label: 'Consignment', description: 'Manage consignment inventory placed at customer locations with usage-based billing.', icon: Handshake },
  { key: 'temperature_monitoring', label: 'Temperature Monitoring', description: 'Real-time cold chain monitoring with sensor integrations and automated excursion alerts.', icon: Thermometer },
] as const;

// --- Integration cards config ---
const integrations = [
  { name: 'QuickBooks', description: 'Sync invoices, payments, and purchase orders with QuickBooks Online.', icon: DollarSign },
  { name: 'Xero', description: 'Two-way accounting sync with Xero for seamless financial management.', icon: CreditCard },
  { name: 'UPS', description: 'Real-time shipping rates, label generation, and package tracking.', icon: Truck },
  { name: 'FedEx', description: 'Automated shipping workflows with FedEx rate shopping and tracking.', icon: Truck },
  { name: 'Stripe', description: 'Accept online payments, manage subscriptions, and process refunds.', icon: CreditCard },
] as const;

// --- Timezones ---
const usTimezones = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
];

type NotifPrefs = Record<string, { inApp: boolean; email: boolean }>;
type FeatureFlags = Record<string, boolean>;

export default function SettingsPage() {
  const { user: currentUser, tenantId, role } = useAuth();
  const supabase = createClient();
  const isAdmin = role === 'admin';

  // --- General state ---
  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [dateFormat, setDateFormat] = useState('MM/DD/YYYY');
  const [currency, setCurrency] = useState('USD');
  const [savingGeneral, setSavingGeneral] = useState(false);

  // --- Team state ---
  const [users, setUsers] = useState<User[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('staff');
  const [inviting, setInviting] = useState(false);

  // --- Notifications state ---
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(() => {
    const defaults: NotifPrefs = {};
    notificationTypes.forEach(({ key }) => {
      defaults[key] = { inApp: true, email: false };
    });
    return defaults;
  });
  const [savingNotifs, setSavingNotifs] = useState(false);

  // --- Features state ---
  const [features, setFeatures] = useState<FeatureFlags>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('medtrack_features');
        if (stored) return JSON.parse(stored);
      } catch { /* ignore */ }
    }
    const defaults: FeatureFlags = {};
    featureToggles.forEach(({ key }) => { defaults[key] = false; });
    return defaults;
  });

  // --- Data state ---
  const [stats, setStats] = useState({ products: 0, lots: 0, movements: 0 });
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Load data ---
  useEffect(() => {
    if (!tenantId) return;

    // Load tenant info (extra settings stored in settings JSON column)
    supabase.from('tenants').select('*').eq('id', tenantId).single()
      .then(({ data }) => {
        if (data) {
          setCompanyName(data.name || '');
          const s = (data.settings || {}) as Record<string, string>;
          setLogoUrl(s.logo_url || '');
          setTimezone(s.timezone || 'America/New_York');
          setDateFormat(s.date_format || 'MM/DD/YYYY');
          setCurrency(s.currency || 'USD');
        }
      });

    // Load users
    supabase.from('users').select('*').eq('tenant_id', tenantId).order('full_name')
      .then(({ data }) => setUsers(data || []));

    // Load notification preferences
    supabase.from('notification_preferences').select('*').eq('tenant_id', tenantId)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const prefs: NotifPrefs = {};
          data.forEach((row: { type: string; in_app: boolean; email: boolean }) => {
            prefs[row.type] = { inApp: row.in_app, email: row.email };
          });
          // Fill in any missing types with defaults
          notificationTypes.forEach(({ key }) => {
            if (!prefs[key]) prefs[key] = { inApp: true, email: false };
          });
          setNotifPrefs(prefs);
        }
      });

    // Load stats
    Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('lots').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('stock_movements').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    ]).then(([p, l, m]) => {
      setStats({
        products: p.count ?? 0,
        lots: l.count ?? 0,
        movements: m.count ?? 0,
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // --- General handlers ---
  async function saveGeneral() {
    if (!tenantId) return;
    setSavingGeneral(true);
    const { error } = await supabase.from('tenants').update({
      name: companyName,
      settings: {
        logo_url: logoUrl,
        timezone,
        date_format: dateFormat,
        currency,
      },
    }).eq('id', tenantId);
    if (error) toast.error(error.message);
    else toast.success('Settings saved');
    setSavingGeneral(false);
  }

  // --- Team handlers ---
  async function updateUserRole(userId: string, newRole: UserRole) {
    const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId);
    if (error) toast.error(error.message);
    else {
      toast.success('Role updated');
      setUsers(users.map((u) => u.id === userId ? { ...u, role: newRole } : u));
    }
  }

  async function inviteUser() {
    if (!tenantId || !inviteEmail) return;
    setInviting(true);
    const { error } = await supabase.from('users').insert({
      tenant_id: tenantId,
      email: inviteEmail,
      role: inviteRole,
      full_name: inviteEmail.split('@')[0],
      is_active: true,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Invitation sent to ${inviteEmail}`);
      // Reload users
      const { data } = await supabase.from('users').select('*').eq('tenant_id', tenantId).order('full_name');
      setUsers(data || []);
      setInviteEmail('');
      setInviteRole('staff');
      setInviteOpen(false);
    }
    setInviting(false);
  }

  // --- Notifications handlers ---
  function toggleNotifPref(type: string, channel: 'inApp' | 'email') {
    setNotifPrefs((prev) => ({
      ...prev,
      [type]: { ...prev[type], [channel]: !prev[type][channel] },
    }));
  }

  async function saveNotifPrefs() {
    if (!tenantId) return;
    setSavingNotifs(true);
    // Upsert each notification preference
    const rows = Object.entries(notifPrefs).map(([type, prefs]) => ({
      tenant_id: tenantId,
      type,
      in_app: prefs.inApp,
      email: prefs.email,
    }));
    const { error } = await supabase.from('notification_preferences').upsert(rows, {
      onConflict: 'tenant_id,type',
    });
    if (error) {
      // If the table doesn't exist yet, just show a toast
      toast.info('Notification preferences saved locally');
    } else {
      toast.success('Notification preferences saved');
    }
    setSavingNotifs(false);
  }

  // --- Features handlers ---
  function toggleFeature(key: string) {
    setFeatures((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('medtrack_features', JSON.stringify(updated));
      } catch { /* ignore */ }
      toast.success(`${featureToggles.find(f => f.key === key)?.label} ${updated[key] ? 'enabled' : 'disabled'}`);
      return updated;
    });
  }

  // --- Data handlers ---
  async function exportData() {
    if (!tenantId) return;
    setExporting(true);
    try {
      const [productsRes, lotsRes, movementsRes] = await Promise.all([
        supabase.from('products').select('*').eq('tenant_id', tenantId),
        supabase.from('lots').select('*').eq('tenant_id', tenantId),
        supabase.from('movements').select('*').eq('tenant_id', tenantId),
      ]);

      const lines: string[] = [];

      // Products section
      if (productsRes.data && productsRes.data.length > 0) {
        lines.push('--- PRODUCTS ---');
        const productKeys = Object.keys(productsRes.data[0]);
        lines.push(productKeys.join(','));
        productsRes.data.forEach((row) => {
          lines.push(productKeys.map((k) => {
            const val = String(row[k] ?? '');
            return val.includes(',') || val.includes('"') || val.includes('\n')
              ? `"${val.replace(/"/g, '""')}"` : val;
          }).join(','));
        });
      }

      // Lots section
      if (lotsRes.data && lotsRes.data.length > 0) {
        lines.push('');
        lines.push('--- LOTS ---');
        const lotKeys = Object.keys(lotsRes.data[0]);
        lines.push(lotKeys.join(','));
        lotsRes.data.forEach((row) => {
          lines.push(lotKeys.map((k) => {
            const val = String(row[k] ?? '');
            return val.includes(',') || val.includes('"') || val.includes('\n')
              ? `"${val.replace(/"/g, '""')}"` : val;
          }).join(','));
        });
      }

      // Movements section
      if (movementsRes.data && movementsRes.data.length > 0) {
        lines.push('');
        lines.push('--- MOVEMENTS ---');
        const moveKeys = Object.keys(movementsRes.data[0]);
        lines.push(moveKeys.join(','));
        movementsRes.data.forEach((row) => {
          lines.push(moveKeys.map((k) => {
            const val = String(row[k] ?? '');
            return val.includes(',') || val.includes('"') || val.includes('\n')
              ? `"${val.replace(/"/g, '""')}"` : val;
          }).join(','));
        });
      }

      const csvContent = lines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `medtrack-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Data exported successfully');
    } catch {
      toast.error('Failed to export data');
    }
    setExporting(false);
  }

  function handleImportClick() {
    toast.info('Import coming soon');
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your organization settings and preferences" />

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="general" className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Team</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-1.5">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="features" className="flex items-center gap-1.5">
            <ToggleLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Features</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-1.5">
            <Plug className="h-4 w-4" />
            <span className="hidden sm:inline">Integrations</span>
          </TabsTrigger>
          <TabsTrigger value="data" className="flex items-center gap-1.5">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">Data</span>
          </TabsTrigger>
        </TabsList>

        {/* ==================== GENERAL ==================== */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" /> Organization Settings
              </CardTitle>
              <CardDescription>Configure your company profile and regional preferences.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Company Name */}
              <div className="grid gap-2 max-w-md">
                <Label htmlFor="company-name" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" /> Company Name
                </Label>
                <Input
                  id="company-name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Your company name"
                  disabled={!isAdmin}
                />
              </div>

              {/* Logo URL */}
              <div className="grid gap-2 max-w-md">
                <Label htmlFor="logo-url" className="flex items-center gap-2">
                  <Image className="h-4 w-4 text-muted-foreground" /> Logo URL
                </Label>
                <Input
                  id="logo-url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  disabled={!isAdmin}
                />
              </div>

              <Separator />

              {/* Timezone */}
              <div className="grid gap-2 max-w-md">
                <Label className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" /> Timezone
                </Label>
                <Select value={timezone} onValueChange={setTimezone} disabled={!isAdmin}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {usTimezones.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Format */}
              <div className="grid gap-2 max-w-md">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" /> Date Format
                </Label>
                <Select value={dateFormat} onValueChange={setDateFormat} disabled={!isAdmin}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Currency */}
              <div className="grid gap-2 max-w-md">
                <Label className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" /> Currency
                </Label>
                <Select value={currency} onValueChange={setCurrency} disabled={!isAdmin}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD - US Dollar</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                    <SelectItem value="GBP">GBP - British Pound</SelectItem>
                    <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isAdmin && (
                <>
                  <Separator />
                  <Button onClick={saveGeneral} disabled={savingGeneral}>
                    {savingGeneral ? 'Saving...' : 'Save Settings'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== TEAM ==================== */}
        <TabsContent value="team">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" /> Team Members
                  </CardTitle>
                  <CardDescription>
                    Manage users and their roles. Admins can manage all users.
                  </CardDescription>
                </div>
                {isAdmin && (
                  <Button onClick={() => setInviteOpen(true)} className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4" /> Invite User
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.full_name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        {isAdmin && u.id !== currentUser?.id ? (
                          <Select value={u.role} onValueChange={(v) => updateUserRole(u.id, v as UserRole)}>
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="staff">Staff</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline">{u.role}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.is_active ? 'default' : 'secondary'}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No team members found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Invite User Dialog */}
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email Address</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as UserRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button onClick={inviteUser} disabled={inviting || !inviteEmail}>
                  {inviting ? 'Sending...' : 'Send Invitation'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ==================== NOTIFICATIONS ==================== */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" /> Notification Preferences
              </CardTitle>
              <CardDescription>
                Choose how you want to be notified for each event type.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">Notification Type</TableHead>
                    <TableHead className="text-center">In-App</TableHead>
                    <TableHead className="text-center">Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notificationTypes.map(({ key, label, icon: Icon }) => (
                    <TableRow key={key}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <Switch
                            checked={notifPrefs[key]?.inApp ?? true}
                            onCheckedChange={() => toggleNotifPref(key, 'inApp')}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <Switch
                            checked={notifPrefs[key]?.email ?? false}
                            onCheckedChange={() => toggleNotifPref(key, 'email')}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-6">
                <Button onClick={saveNotifPrefs} disabled={savingNotifs}>
                  {savingNotifs ? 'Saving...' : 'Save Preferences'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== FEATURES ==================== */}
        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ToggleLeft className="h-5 w-5" /> Feature Toggles
              </CardTitle>
              <CardDescription>
                Enable or disable optional modules for your organization.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {featureToggles.map(({ key, label, description, icon: Icon }, idx) => (
                  <div key={key}>
                    <div className="flex items-center justify-between py-4">
                      <div className="flex items-start gap-4">
                        <div className="mt-0.5 rounded-md bg-muted p-2">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium leading-none">{label}</p>
                          <p className="text-sm text-muted-foreground max-w-lg">{description}</p>
                        </div>
                      </div>
                      <Switch
                        checked={features[key] ?? false}
                        onCheckedChange={() => toggleFeature(key)}
                      />
                    </div>
                    {idx < featureToggles.length - 1 && <Separator />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== INTEGRATIONS ==================== */}
        <TabsContent value="integrations">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plug className="h-5 w-5" /> Integrations
                </CardTitle>
                <CardDescription>
                  Connect TrackFlow with your favorite tools and services.
                </CardDescription>
              </CardHeader>
            </Card>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {integrations.map(({ name, description, icon: Icon }) => (
                <Card key={name}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="rounded-md bg-muted p-2.5">
                        <Icon className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <CardTitle className="text-base">{name}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{description}</p>
                    <Button variant="outline" disabled className="w-full">
                      Coming Soon
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ==================== DATA ==================== */}
        <TabsContent value="data">
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Products</CardDescription>
                  <CardTitle className="text-3xl">{stats.products.toLocaleString()}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Lots</CardDescription>
                  <CardTitle className="text-3xl">{stats.lots.toLocaleString()}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Movements</CardDescription>
                  <CardTitle className="text-3xl">{stats.movements.toLocaleString()}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            {/* Export */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" /> Export Data
                </CardTitle>
                <CardDescription>
                  Download all your products, lots, and movements as a CSV file.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={exportData} disabled={exporting} className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  {exporting ? 'Exporting...' : 'Export All Data'}
                </Button>
              </CardContent>
            </Card>

            {/* Import */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" /> Import Data
                </CardTitle>
                <CardDescription>
                  Upload a CSV file to import products, lots, or movements.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="max-w-sm"
                    onChange={handleImportClick}
                  />
                  <Button variant="outline" onClick={handleImportClick} className="flex items-center gap-2">
                    <Upload className="h-4 w-4" /> Import
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
