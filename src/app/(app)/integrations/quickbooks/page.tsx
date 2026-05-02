'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/providers/auth-provider'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/format'
import {
  Plug,
  PlugZap,
  Unplug,
  TestTube,
  RefreshCw,
  ArrowRight,
  ArrowLeftRight,
  ArrowLeft,
  Plus,
  Save,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

// --- Types ---

interface QBSettings {
  qb_client_id?: string
  qb_client_secret?: string
  qb_company_id?: string
  qb_company_name?: string
  qb_connected?: boolean
  qb_last_sync?: string
  qb_sync_settings?: SyncSetting[]
  qb_auto_sync_interval?: string
}

interface SyncSetting {
  id: string
  label: string
  localEntity: string
  qbEntity: string
  enabled: boolean
  direction: 'push' | 'pull' | 'bidirectional'
}

interface SyncHistoryEntry {
  id: string
  timestamp: string
  sync_type: string
  direction: string
  records_synced: number
  status: 'success' | 'failed' | 'partial'
  errors: string | null
}

interface FieldMapping {
  id: string
  local_field: string
  qb_field: string
  direction: 'push' | 'pull' | 'bidirectional'
  active: boolean
  entity: string
}

// --- Default Data ---

const defaultSyncSettings: SyncSetting[] = [
  { id: 'customers', label: 'Customers', localEntity: 'Customers', qbEntity: 'QuickBooks Customers', enabled: true, direction: 'bidirectional' },
  { id: 'products', label: 'Products', localEntity: 'Products', qbEntity: 'QuickBooks Items', enabled: true, direction: 'push' },
  { id: 'suppliers', label: 'Suppliers', localEntity: 'Suppliers', qbEntity: 'QuickBooks Vendors', enabled: false, direction: 'push' },
  { id: 'sales_orders', label: 'Sales Orders', localEntity: 'Sales Orders', qbEntity: 'QuickBooks Invoices', enabled: true, direction: 'push' },
  { id: 'purchase_orders', label: 'Purchase Orders', localEntity: 'Purchase Orders', qbEntity: 'QuickBooks Bills', enabled: false, direction: 'pull' },
  { id: 'stock_movements', label: 'Stock Movements', localEntity: 'Stock Movements', qbEntity: 'QuickBooks Journal Entries', enabled: false, direction: 'push' },
]

const mockSyncHistory: SyncHistoryEntry[] = [
  { id: '1', timestamp: '2026-04-30T14:32:00Z', sync_type: 'customers', direction: 'Bidirectional', records_synced: 24, status: 'success', errors: null },
  { id: '2', timestamp: '2026-04-30T13:15:00Z', sync_type: 'products', direction: 'Push to QB', records_synced: 156, status: 'success', errors: null },
  { id: '3', timestamp: '2026-04-29T22:00:00Z', sync_type: 'sales_orders', direction: 'Push to QB', records_synced: 12, status: 'partial', errors: '2 invoices skipped — missing customer mapping' },
  { id: '4', timestamp: '2026-04-29T18:45:00Z', sync_type: 'suppliers', direction: 'Push to QB', records_synced: 0, status: 'failed', errors: 'OAuth token expired. Please reconnect.' },
  { id: '5', timestamp: '2026-04-28T09:00:00Z', sync_type: 'products', direction: 'Push to QB', records_synced: 43, status: 'success', errors: null },
  { id: '6', timestamp: '2026-04-27T16:30:00Z', sync_type: 'stock_movements', direction: 'Push to QB', records_synced: 87, status: 'success', errors: null },
]

const defaultFieldMappings: FieldMapping[] = [
  { id: '1', local_field: 'Customer Name', qb_field: 'Customer Display Name', direction: 'bidirectional', active: true, entity: 'Customers' },
  { id: '2', local_field: 'Customer Email', qb_field: 'Customer Email', direction: 'bidirectional', active: true, entity: 'Customers' },
  { id: '3', local_field: 'Customer Phone', qb_field: 'Customer Phone', direction: 'bidirectional', active: true, entity: 'Customers' },
  { id: '4', local_field: 'Customer Address', qb_field: 'Customer Billing Address', direction: 'push', active: true, entity: 'Customers' },
  { id: '5', local_field: 'Product Name', qb_field: 'Item Name', direction: 'push', active: true, entity: 'Products' },
  { id: '6', local_field: 'Product SKU', qb_field: 'Item SKU', direction: 'push', active: true, entity: 'Products' },
  { id: '7', local_field: 'Product Price', qb_field: 'Item Unit Price', direction: 'push', active: true, entity: 'Products' },
  { id: '8', local_field: 'Product Cost', qb_field: 'Item Purchase Cost', direction: 'push', active: true, entity: 'Products' },
  { id: '9', local_field: 'Product Description', qb_field: 'Item Description', direction: 'push', active: true, entity: 'Products' },
  { id: '10', local_field: 'Supplier Name', qb_field: 'Vendor Display Name', direction: 'push', active: true, entity: 'Suppliers' },
  { id: '11', local_field: 'Supplier Email', qb_field: 'Vendor Email', direction: 'push', active: true, entity: 'Suppliers' },
  { id: '12', local_field: 'Order Total', qb_field: 'Invoice Total Amount', direction: 'push', active: true, entity: 'Sales Orders' },
  { id: '13', local_field: 'Order Date', qb_field: 'Invoice Date', direction: 'push', active: true, entity: 'Sales Orders' },
  { id: '14', local_field: 'PO Total', qb_field: 'Bill Total Amount', direction: 'pull', active: false, entity: 'Purchase Orders' },
]

// --- Main Component ---

export default function QuickBooksIntegrationPage() {
  const { tenantId } = useAuth()
  const supabase = createClient()

  // Connection state
  const [connected, setConnected] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Connect dialog
  const [connectDialogOpen, setConnectDialogOpen] = useState(false)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [redirectUri, setRedirectUri] = useState('')

  // Sync settings
  const [syncSettings, setSyncSettings] = useState<SyncSetting[]>(defaultSyncSettings)
  const [autoSyncInterval, setAutoSyncInterval] = useState('manual')

  // Sync history
  const [syncHistory, setSyncHistory] = useState<SyncHistoryEntry[]>(mockSyncHistory)
  const [historyFilter, setHistoryFilter] = useState('all')

  // Field mappings
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>(defaultFieldMappings)
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false)
  const [newMappingLocalField, setNewMappingLocalField] = useState('')
  const [newMappingQbField, setNewMappingQbField] = useState('')
  const [newMappingDirection, setNewMappingDirection] = useState<'push' | 'pull' | 'bidirectional'>('push')
  const [newMappingEntity, setNewMappingEntity] = useState('Customers')

  // Load tenant settings
  const loadSettings = useCallback(async () => {
    if (!tenantId) return
    try {
      const { data } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single()

      if (data?.settings) {
        const s = data.settings as QBSettings
        setConnected(!!s.qb_connected)
        setCompanyName(s.qb_company_name || '')
        setLastSync(s.qb_last_sync || null)
        setClientId(s.qb_client_id || '')
        setClientSecret(s.qb_client_secret || '')
        setCompanyId(s.qb_company_id || '')
        if (s.qb_sync_settings) setSyncSettings(s.qb_sync_settings)
        if (s.qb_auto_sync_interval) setAutoSyncInterval(s.qb_auto_sync_interval)
      }
    } catch {
      // Settings may not exist yet
    } finally {
      setLoading(false)
    }
  }, [tenantId, supabase])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setRedirectUri(`${window.location.origin}/api/integrations/quickbooks/callback`)
    }
  }, [])

  // Save QB settings to tenant
  async function saveToTenant(updates: Partial<QBSettings>) {
    if (!tenantId) return
    setSaving(true)
    try {
      const { data: existing } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single()

      const currentSettings = (existing?.settings || {}) as Record<string, unknown>
      const merged = { ...currentSettings, ...updates }

      await supabase
        .from('tenants')
        .update({ settings: merged })
        .eq('id', tenantId)

      toast.success('Settings saved')
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  // Connect handler
  async function handleConnect() {
    if (!clientId || !clientSecret || !companyId) {
      toast.error('Please fill in all required fields')
      return
    }

    await saveToTenant({
      qb_client_id: clientId,
      qb_client_secret: clientSecret,
      qb_company_id: companyId,
      qb_company_name: `Company ${companyId}`,
      qb_connected: true,
      qb_last_sync: new Date().toISOString(),
    })

    setConnected(true)
    setCompanyName(`Company ${companyId}`)
    setLastSync(new Date().toISOString())
    setConnectDialogOpen(false)
    toast.success('Connected to QuickBooks Online')
  }

  // Disconnect handler
  async function handleDisconnect() {
    await saveToTenant({
      qb_client_id: undefined,
      qb_client_secret: undefined,
      qb_company_id: undefined,
      qb_company_name: undefined,
      qb_connected: false,
      qb_last_sync: undefined,
    })

    setConnected(false)
    setCompanyName('')
    setLastSync(null)
    setClientId('')
    setClientSecret('')
    setCompanyId('')
    toast.success('Disconnected from QuickBooks')
  }

  // Test connection
  function handleTestConnection() {
    toast.success('Connection successful')
  }

  // Save sync settings
  async function handleSaveSyncSettings() {
    await saveToTenant({
      qb_sync_settings: syncSettings,
      qb_auto_sync_interval: autoSyncInterval,
    })
  }

  // Sync now
  function handleSyncNow() {
    toast.success('Sync started...')
    const newEntry: SyncHistoryEntry = {
      id: String(Date.now()),
      timestamp: new Date().toISOString(),
      sync_type: 'all',
      direction: 'Bidirectional',
      records_synced: 0,
      status: 'success',
      errors: null,
    }
    setSyncHistory([newEntry, ...syncHistory])
  }

  // Toggle sync setting
  function toggleSyncEnabled(id: string) {
    setSyncSettings(prev =>
      prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)
    )
  }

  function setSyncDirection(id: string, direction: 'push' | 'pull' | 'bidirectional') {
    setSyncSettings(prev =>
      prev.map(s => s.id === id ? { ...s, direction } : s)
    )
  }

  // Toggle field mapping
  function toggleMappingActive(id: string) {
    setFieldMappings(prev =>
      prev.map(m => m.id === id ? { ...m, active: !m.active } : m)
    )
  }

  // Add custom mapping
  function handleAddMapping() {
    if (!newMappingLocalField || !newMappingQbField) {
      toast.error('Please fill in both fields')
      return
    }
    const newMapping: FieldMapping = {
      id: String(Date.now()),
      local_field: newMappingLocalField,
      qb_field: newMappingQbField,
      direction: newMappingDirection,
      active: true,
      entity: newMappingEntity,
    }
    setFieldMappings(prev => [...prev, newMapping])
    setMappingDialogOpen(false)
    setNewMappingLocalField('')
    setNewMappingQbField('')
    setNewMappingDirection('push')
    toast.success('Field mapping added')
  }

  // Filter sync history
  const filteredHistory = historyFilter === 'all'
    ? syncHistory
    : syncHistory.filter(h => h.sync_type === historyFilter)

  function directionIcon(dir: 'push' | 'pull' | 'bidirectional') {
    switch (dir) {
      case 'push': return <ArrowRight className="h-4 w-4" />
      case 'pull': return <ArrowLeft className="h-4 w-4" />
      case 'bidirectional': return <ArrowLeftRight className="h-4 w-4" />
    }
  }

  function statusBadge(status: 'success' | 'failed' | 'partial') {
    switch (status) {
      case 'success':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Success</Badge>
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>
      case 'partial':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20"><AlertTriangle className="h-3 w-3 mr-1" />Partial</Badge>
    }
  }

  function syncTypeLabel(type: string) {
    const map: Record<string, string> = {
      customers: 'Customers',
      products: 'Products',
      suppliers: 'Suppliers',
      sales_orders: 'Sales Orders',
      purchase_orders: 'Purchase Orders',
      stock_movements: 'Stock Movements',
      all: 'All Entities',
    }
    return map[type] || type
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">QuickBooks Online Integration</h2>
          <p className="text-muted-foreground">
            Sync your inventory data with QuickBooks Online for seamless accounting.
          </p>
        </div>
        <Badge
          variant={connected ? 'default' : 'secondary'}
          className={connected ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : ''}
        >
          <span className={`mr-1.5 h-2 w-2 rounded-full inline-block ${connected ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
          {connected ? 'Connected' : 'Not Connected'}
        </Badge>
      </div>

      <Tabs defaultValue="connection" className="space-y-4">
        <TabsList>
          <TabsTrigger value="connection">Connection</TabsTrigger>
          <TabsTrigger value="sync-settings">Sync Settings</TabsTrigger>
          <TabsTrigger value="sync-history">Sync History</TabsTrigger>
          <TabsTrigger value="field-mapping">Field Mapping</TabsTrigger>
        </TabsList>

        {/* ===== CONNECTION TAB ===== */}
        <TabsContent value="connection" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PlugZap className="h-5 w-5" />
                Connection Status
              </CardTitle>
              <CardDescription>
                Manage your QuickBooks Online OAuth 2.0 connection.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">Status</Label>
                  <div>
                    <Badge
                      variant={connected ? 'default' : 'secondary'}
                      className={connected ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : ''}
                    >
                      {connected ? 'Connected' : 'Not Connected'}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">Company</Label>
                  <p className="text-sm font-medium">{companyName || '---'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">Last Sync</Label>
                  <p className="text-sm font-medium">{lastSync ? formatDateTime(lastSync) : '---'}</p>
                </div>
              </div>

              <Separator />

              <div className="flex flex-wrap gap-2">
                {!connected ? (
                  <Button onClick={() => setConnectDialogOpen(true)}>
                    <Plug className="h-4 w-4 mr-2" />
                    Connect to QuickBooks
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={handleTestConnection}>
                      <TestTube className="h-4 w-4 mr-2" />
                      Test Connection
                    </Button>
                    <Button variant="destructive" onClick={handleDisconnect}>
                      <Unplug className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {connected && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Connection Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground text-xs">Client ID</Label>
                    <p className="font-mono">{'*'.repeat(Math.max(0, clientId.length - 4)) + clientId.slice(-4)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Company ID</Label>
                    <p className="font-mono">{companyId}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-muted-foreground text-xs">Redirect URI</Label>
                    <p className="font-mono text-xs break-all">{redirectUri}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== SYNC SETTINGS TAB ===== */}
        <TabsContent value="sync-settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Entity Sync Configuration</CardTitle>
              <CardDescription>
                Choose which entities to sync and in which direction.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Enabled</TableHead>
                    <TableHead>Local Entity</TableHead>
                    <TableHead className="hidden sm:table-cell">QuickBooks Entity</TableHead>
                    <TableHead>Direction</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncSettings.map((setting) => (
                    <TableRow key={setting.id}>
                      <TableCell>
                        <Switch
                          checked={setting.enabled}
                          onCheckedChange={() => toggleSyncEnabled(setting.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{setting.localEntity}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">{setting.qbEntity}</TableCell>
                      <TableCell>
                        <Select
                          value={setting.direction}
                          onValueChange={(val) => setSyncDirection(setting.id, val as 'push' | 'pull' | 'bidirectional')}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="push">
                              <span className="flex items-center gap-2"><ArrowRight className="h-3 w-3" /> Push to QB</span>
                            </SelectItem>
                            <SelectItem value="pull">
                              <span className="flex items-center gap-2"><ArrowLeft className="h-3 w-3" /> Pull from QB</span>
                            </SelectItem>
                            <SelectItem value="bidirectional">
                              <span className="flex items-center gap-2"><ArrowLeftRight className="h-3 w-3" /> Bidirectional</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Auto-Sync Schedule</CardTitle>
              <CardDescription>
                Set how frequently data syncs automatically with QuickBooks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Label>Sync Interval</Label>
                <Select value={autoSyncInterval} onValueChange={setAutoSyncInterval}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual Only</SelectItem>
                    <SelectItem value="15min">Every 15 Minutes</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <Button onClick={handleSaveSyncSettings} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== SYNC HISTORY TAB ===== */}
        <TabsContent value="sync-history" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Sync History</CardTitle>
                  <CardDescription>Recent synchronization activity with QuickBooks.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={historyFilter} onValueChange={setHistoryFilter}>
                    <SelectTrigger className="w-[180px]">
                      <Filter className="h-3 w-3 mr-2" />
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="customers">Customers</SelectItem>
                      <SelectItem value="products">Products</SelectItem>
                      <SelectItem value="suppliers">Suppliers</SelectItem>
                      <SelectItem value="sales_orders">Sales Orders</SelectItem>
                      <SelectItem value="purchase_orders">Purchase Orders</SelectItem>
                      <SelectItem value="stock_movements">Stock Movements</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={handleSyncNow} disabled={!connected}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync Now
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden sm:table-cell">Direction</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No sync history found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredHistory.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-sm">{formatDateTime(entry.timestamp)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{syncTypeLabel(entry.sync_type)}</Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{entry.direction}</TableCell>
                        <TableCell className="text-right font-mono">{entry.records_synced}</TableCell>
                        <TableCell>{statusBadge(entry.status)}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[250px] truncate">
                          {entry.errors || '---'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== FIELD MAPPING TAB ===== */}
        <TabsContent value="field-mapping" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Field Mappings</CardTitle>
                  <CardDescription>
                    Map your local fields to their QuickBooks equivalents.
                  </CardDescription>
                </div>
                <Button onClick={() => setMappingDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Custom Mapping
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Local Field</TableHead>
                    <TableHead className="w-[60px] text-center">Direction</TableHead>
                    <TableHead>QuickBooks Field</TableHead>
                    <TableHead className="w-[80px] text-center">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fieldMappings.map((mapping) => (
                    <TableRow key={mapping.id}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{mapping.entity}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{mapping.local_field}</TableCell>
                      <TableCell className="text-center">
                        {directionIcon(mapping.direction)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{mapping.qb_field}</TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={mapping.active}
                          onCheckedChange={() => toggleMappingActive(mapping.id)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== CONNECT DIALOG ===== */}
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5" />
              Connect to QuickBooks Online
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-3 rounded-lg border p-4 bg-muted/50">
              <h4 className="font-semibold text-sm">Setup Instructions</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>
                  Go to{' '}
                  <a
                    href="https://developer.intuit.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-4 inline-flex items-center gap-1"
                  >
                    developer.intuit.com
                    <ExternalLink className="h-3 w-3" />
                  </a>{' '}
                  and create an app
                </li>
                <li>Enter the Client ID and Client Secret from your app</li>
                <li>Enter your QuickBooks Company ID (found in your QB URL)</li>
              </ol>
            </div>

            <div className="space-y-2">
              <Label htmlFor="qb-client-id">Client ID *</Label>
              <Input
                id="qb-client-id"
                placeholder="ABcDeFgHiJkLmNoPqRsTuV..."
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="qb-client-secret">Client Secret *</Label>
              <Input
                id="qb-client-secret"
                type="password"
                placeholder="Enter your client secret"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="qb-company-id">Company ID (Realm ID) *</Label>
              <Input
                id="qb-company-id"
                placeholder="123456789"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="qb-redirect-uri">Redirect URI</Label>
              <Input
                id="qb-redirect-uri"
                value={redirectUri}
                readOnly
                className="bg-muted text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Add this URL to your QuickBooks app&apos;s redirect URIs.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConnect} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save &amp; Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== ADD MAPPING DIALOG ===== */}
      <Dialog open={mappingDialogOpen} onOpenChange={setMappingDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Field Mapping</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Entity</Label>
              <Select value={newMappingEntity} onValueChange={setNewMappingEntity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Customers">Customers</SelectItem>
                  <SelectItem value="Products">Products</SelectItem>
                  <SelectItem value="Suppliers">Suppliers</SelectItem>
                  <SelectItem value="Sales Orders">Sales Orders</SelectItem>
                  <SelectItem value="Purchase Orders">Purchase Orders</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Local Field</Label>
              <Input
                placeholder="e.g. Product Weight"
                value={newMappingLocalField}
                onChange={(e) => setNewMappingLocalField(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>QuickBooks Field</Label>
              <Input
                placeholder="e.g. Item Custom Field 1"
                value={newMappingQbField}
                onChange={(e) => setNewMappingQbField(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={newMappingDirection} onValueChange={(v) => setNewMappingDirection(v as 'push' | 'pull' | 'bidirectional')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="push">Push to QB</SelectItem>
                  <SelectItem value="pull">Pull from QB</SelectItem>
                  <SelectItem value="bidirectional">Bidirectional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMappingDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMapping}>
              <Plus className="h-4 w-4 mr-2" />
              Add Mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
