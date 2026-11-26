'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/providers/auth-provider'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  ShieldAlert,
  Search,
  Download,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Plus,
  Eye,
  Shield,
} from 'lucide-react'
import { formatDate } from '@/lib/format'
import { exportToCSV } from '@/lib/csv'
import { toast } from 'sonner'

// --- Types ---
interface RecallAlert {
  id: string
  alert_date: string
  product_id: string | null
  product_name: string
  product_sku: string
  recall_source: 'FDA' | 'CPSC' | 'Manual'
  recall_number: string
  reason: string
  classification: 'Class I' | 'Class II' | 'Class III'
  status: 'new' | 'investigating' | 'cleared' | 'confirmed'
  affected_lots: string[]
  notes: string
  confidence_score: number | null
  resolution: string
  resolved_date: string | null
  resolved_by: string | null
}

interface ProductRef {
  id: string
  name: string
  sku: string
  manufacturer: string | null
}

interface FDARecall {
  recall_number: string;
  product_description: string;
  reason_for_recall: string;
  classification: 'Class I' | 'Class II' | 'Class III';
  recalling_firm: string;
  recall_initiation_date: string;
  status: string;
}

function classificationBadge(cls: string) {
  const variants: Record<string, 'destructive' | 'default' | 'secondary'> = {
    'Class I': 'destructive',
    'Class II': 'default',
    'Class III': 'secondary',
  }
  return <Badge variant={variants[cls] || 'outline'}>{cls}</Badge>
}

function alertStatusBadge(status: string) {
  const config: Record<string, { variant: 'destructive' | 'default' | 'secondary' | 'outline'; label: string }> = {
    new: { variant: 'destructive', label: 'New' },
    investigating: { variant: 'default', label: 'Investigating' },
    cleared: { variant: 'secondary', label: 'Cleared' },
    confirmed: { variant: 'destructive', label: 'Confirmed' },
  }
  const c = config[status] || config.new
  return <Badge variant={c.variant}>{c.label}</Badge>
}

export default function RecallMonitorPage() {
  const { user, tenantId } = useAuth()
  const [products, setProducts] = useState<ProductRef[]>([])
  const [alerts, setAlerts] = useState<RecallAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [checkResults] = useState<
    { recall: FDARecall; product: ProductRef; score: number }[]
  >([])
  const [checking] = useState(false)

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all')
  const [historySourceFilter, setHistorySourceFilter] = useState('all')

  // Detail dialog
  const [detailAlert, setDetailAlert] = useState<RecallAlert | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Manual entry dialog
  const [manualOpen, setManualOpen] = useState(false)
  const [manualProductId, setManualProductId] = useState('')
  const [manualSource, setManualSource] = useState<string>('Manual')
  const [manualRecallNumber, setManualRecallNumber] = useState('')
  const [manualReason, setManualReason] = useState('')
  const [manualClassification, setManualClassification] = useState<string>('Class II')
  const [manualNotes, setManualNotes] = useState('')

  // Settings
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(false)
  const [monitorFDADrugs, setMonitorFDADrugs] = useState(true)
  const [monitorFDAFood, setMonitorFDAFood] = useState(true)
  const [monitorFDADevices, setMonitorFDADevices] = useState(true)
  const [monitorCPSC, setMonitorCPSC] = useState(false)
  const [emailNotifications, setEmailNotifications] = useState(false)
  const [watchlistManufacturers, setWatchlistManufacturers] = useState('')

  // Load alerts from product notes (stored as recall_alerts JSON in notes)
  const loadData = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    const supabase = createClient()

    const { data: productData } = await supabase
      .from('products')
      .select('id, name, sku, manufacturer, notes')
      .eq('tenant_id', tenantId)
      .order('name')

    const prods: ProductRef[] = (productData || []).map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      manufacturer: p.manufacturer,
    }))
    setProducts(prods)

    // Extract recall alerts stored in notes
    const allAlerts: RecallAlert[] = []
    for (const p of productData || []) {
      if (!p.notes) continue
      try {
        const parsed = JSON.parse(p.notes)
        if (parsed.recall_alerts && Array.isArray(parsed.recall_alerts)) {
          for (const ra of parsed.recall_alerts) {
            allAlerts.push({
              ...ra,
              product_id: p.id,
              product_name: p.name,
              product_sku: p.sku,
            })
          }
        }
      } catch {
        // not JSON notes
      }
    }
    setAlerts(allAlerts)
    setLoading(false)
  }, [tenantId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const activeAlerts = alerts.filter((a) => a.status === 'new' || a.status === 'investigating')
  const historyAlerts = alerts.filter((a) => a.status === 'cleared' || a.status === 'confirmed')

  const filteredActive = activeAlerts.filter((a) => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false
    return true
  })

  const filteredHistory = historyAlerts.filter((a) => {
    if (historyStatusFilter !== 'all' && a.status !== historyStatusFilter) return false
    if (historySourceFilter !== 'all' && a.recall_source !== historySourceFilter) return false
    return true
  })

  const stats = {
    active: activeAlerts.length,
    classI: activeAlerts.filter((a) => a.classification === 'Class I').length,
    investigating: activeAlerts.filter((a) => a.status === 'investigating').length,
    lotsAffected: activeAlerts.reduce((sum, a) => sum + (a.affected_lots?.length || 0), 0),
  }

  const checkAgainstFDA = async () => {
    toast.info('Automated FDA recall monitoring is not available. Use manual recall lookup and verified regulator notices.');
  }

  const saveAlert = async (alert: Omit<RecallAlert, 'id'>) => {
    if (!tenantId || !alert.product_id) return
    const supabase = createClient()

    const { data: productData } = await supabase
      .from('products')
      .select('notes')
      .eq('id', alert.product_id)
      .eq('tenant_id', tenantId)
      .single()

    let existing: Record<string, unknown> = {}
    if (productData?.notes) {
      try {
        existing = JSON.parse(productData.notes)
      } catch {
        existing = { original_notes: productData.notes }
      }
    }

    const existingAlerts = (existing.recall_alerts as RecallAlert[]) || []
    const newAlert = { ...alert, id: crypto.randomUUID() }
    existingAlerts.push(newAlert)
    existing.recall_alerts = existingAlerts

    await supabase
      .from('products')
      .update({ notes: JSON.stringify(existing) })
      .eq('id', alert.product_id)
      .eq('tenant_id', tenantId)

    return newAlert
  }

  const updateAlertStatus = async (alert: RecallAlert, newStatus: RecallAlert['status'], resolution?: string) => {
    if (!tenantId || !alert.product_id) return
    const supabase = createClient()

    const { data: productData } = await supabase
      .from('products')
      .select('notes')
      .eq('id', alert.product_id)
      .eq('tenant_id', tenantId)
      .single()

    if (!productData?.notes) return

    try {
      const parsed = JSON.parse(productData.notes)
      if (parsed.recall_alerts && Array.isArray(parsed.recall_alerts)) {
        const idx = parsed.recall_alerts.findIndex((ra: RecallAlert) => ra.id === alert.id)
        if (idx >= 0) {
          parsed.recall_alerts[idx].status = newStatus
          if (resolution) parsed.recall_alerts[idx].resolution = resolution
          if (newStatus === 'cleared' || newStatus === 'confirmed') {
            parsed.recall_alerts[idx].resolved_date = new Date().toISOString()
            parsed.recall_alerts[idx].resolved_by = user?.full_name || user?.email || 'Unknown'
          }
        }
        await supabase
          .from('products')
          .update({ notes: JSON.stringify(parsed) })
          .eq('id', alert.product_id)
          .eq('tenant_id', tenantId)
      }
    } catch {
      // parse error
    }

    // If confirmed, create quarantine hold
    if (newStatus === 'confirmed' && alert.affected_lots?.length) {
      for (const lotNumber of alert.affected_lots) {
        const { data: lotData } = await supabase
          .from('lots')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('lot_number', lotNumber)
          .single()

        if (lotData) {
          await supabase.from('quarantine_holds').insert({
            tenant_id: tenantId,
            lot_id: lotData.id,
            product_id: alert.product_id,
            reason: `Recall ${alert.recall_number}: ${alert.reason}`,
            status: 'held',
            held_by: user?.id,
            held_at: new Date().toISOString(),
          })
        }
      }
      toast.success('Quarantine holds created for affected lots')
    }

    loadData()
  }

  const handleManualEntry = async () => {
    if (!manualProductId || !manualReason) {
      toast.error('Product and reason are required')
      return
    }
    const product = products.find((p) => p.id === manualProductId)
    if (!product) return

    await saveAlert({
      alert_date: new Date().toISOString(),
      product_id: manualProductId,
      product_name: product.name,
      product_sku: product.sku,
      recall_source: manualSource as RecallAlert['recall_source'],
      recall_number: manualRecallNumber || `MANUAL-${Date.now()}`,
      reason: manualReason,
      classification: manualClassification as RecallAlert['classification'],
      status: 'new',
      affected_lots: [],
      notes: manualNotes,
      confidence_score: null,
      resolution: '',
      resolved_date: null,
      resolved_by: null,
    })

    toast.success('Recall alert added')
    setManualOpen(false)
    setManualProductId('')
    setManualSource('Manual')
    setManualRecallNumber('')
    setManualReason('')
    setManualClassification('Class II')
    setManualNotes('')
    loadData()
  }

  const createAlertFromMatch = async (recall: FDARecall, product: ProductRef, score: number) => {
    await saveAlert({
      alert_date: new Date().toISOString(),
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      recall_source: 'FDA',
      recall_number: recall.recall_number,
      reason: recall.reason_for_recall,
      classification: recall.classification,
      status: 'new',
      affected_lots: [],
      notes: `Matched from FDA recall. Recalling firm: ${recall.recalling_firm}. Confidence: ${score}%`,
      confidence_score: score,
      resolution: '',
      resolved_date: null,
      resolved_by: null,
    })

    toast.success(`Alert created for ${product.name}`)
    loadData()
  }

  const exportHistory = () => {
    const data = historyAlerts.map((a) => ({
      alert_date: a.alert_date,
      product: a.product_name,
      sku: a.product_sku,
      source: a.recall_source,
      recall_number: a.recall_number,
      reason: a.reason,
      classification: a.classification,
      status: a.status,
      resolution: a.resolution,
      resolved_date: a.resolved_date || '',
      resolved_by: a.resolved_by || '',
    }))
    exportToCSV(data, 'recall_history')
    toast.success('Recall history exported')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recall Monitor"
        description="National recall auto-flagging and product safety monitoring"
      />

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">
            Active Alerts
            {activeAlerts.length > 0 && (
              <Badge variant="destructive" className="ml-2">{activeAlerts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="check">Check Products</TabsTrigger>
          <TabsTrigger value="history">Recall History</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Active Alerts Tab */}
        <TabsContent value="active" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard title="Active Alerts" value={stats.active} icon={AlertTriangle} />
            <StatCard title="Class I (Most Serious)" value={stats.classI} icon={ShieldAlert} />
            <StatCard title="Under Investigation" value={stats.investigating} icon={Search} />
            <StatCard title="Lots Affected" value={stats.lotsAffected} icon={Shield} />
          </div>

          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Active</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="investigating">Investigating</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Recall #</TableHead>
                    <TableHead>Classification</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : filteredActive.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No active recall alerts
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredActive.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{formatDate(a.alert_date)}</TableCell>
                        <TableCell className="font-medium">{a.product_name}</TableCell>
                        <TableCell className="text-muted-foreground">{a.product_sku}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{a.recall_source}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{a.recall_number}</TableCell>
                        <TableCell>{classificationBadge(a.classification)}</TableCell>
                        <TableCell>{alertStatusBadge(a.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setDetailAlert(a)
                                setDetailOpen(true)
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {a.status === 'new' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateAlertStatus(a, 'investigating')}
                              >
                                Investigate
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateAlertStatus(a, 'cleared', 'Product not affected')}
                            >
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateAlertStatus(a, 'confirmed', 'Product confirmed affected')}
                            >
                              <XCircle className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Check Products Tab */}
        <TabsContent value="check" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>FDA Recall Cross-Reference</CardTitle>
                <CardDescription>
                  Check your product catalog against current FDA recall database
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This will cross-reference your {products.length} products against known FDA drug, food, and device
                  recalls using fuzzy matching on product names and manufacturers.
                </p>
                <Button onClick={checkAgainstFDA} disabled={checking}>
                  {checking ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Check All Products
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Manual Recall Entry</CardTitle>
                <CardDescription>Add a recall alert manually</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setManualOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Recall Alert
                </Button>
              </CardContent>
            </Card>
          </div>

          {checkResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Potential Matches ({checkResults.length})</CardTitle>
                <CardDescription>
                  Review matches and create alerts for products that may be affected
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recall #</TableHead>
                      <TableHead>FDA Product Description</TableHead>
                      <TableHead>Your Product</TableHead>
                      <TableHead>Classification</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checkResults.map((r, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm">{r.recall.recall_number}</TableCell>
                        <TableCell className="max-w-xs">
                          <p className="text-sm truncate">{r.recall.product_description}</p>
                          <p className="text-xs text-muted-foreground">{r.recall.recalling_firm}</p>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{r.product.name}</p>
                          <p className="text-xs text-muted-foreground">{r.product.sku}</p>
                        </TableCell>
                        <TableCell>{classificationBadge(r.recall.classification)}</TableCell>
                        <TableCell>
                          <Badge variant={r.score >= 70 ? 'destructive' : r.score >= 50 ? 'default' : 'secondary'}>
                            {r.score}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => createAlertFromMatch(r.recall, r.product, r.score)}
                          >
                            Create Alert
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Recall History Tab */}
        <TabsContent value="history" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={historyStatusFilter} onValueChange={setHistoryStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="cleared">Cleared</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={historySourceFilter} onValueChange={setHistorySourceFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="FDA">FDA</SelectItem>
                <SelectItem value="CPSC">CPSC</SelectItem>
                <SelectItem value="Manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <Button variant="outline" onClick={exportHistory} disabled={filteredHistory.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Recall #</TableHead>
                    <TableHead>Classification</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Resolution</TableHead>
                    <TableHead>Resolved By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No recall history records
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredHistory.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{formatDate(a.alert_date)}</TableCell>
                        <TableCell className="font-medium">{a.product_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{a.recall_source}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{a.recall_number}</TableCell>
                        <TableCell>{classificationBadge(a.classification)}</TableCell>
                        <TableCell>{alertStatusBadge(a.status)}</TableCell>
                        <TableCell className="max-w-xs truncate">{a.resolution || '\u2014'}</TableCell>
                        <TableCell>{a.resolved_by || '\u2014'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Automatic Monitoring</CardTitle>
              <CardDescription>Configure automatic recall checking</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Auto-check recalls daily</p>
                  <p className="text-sm text-muted-foreground">
                    Automatically cross-reference your catalog against new recalls
                  </p>
                </div>
                <Switch checked={autoCheckEnabled} onCheckedChange={setAutoCheckEnabled} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Email notifications</p>
                  <p className="text-sm text-muted-foreground">
                    Send email alerts when new recall matches are found
                  </p>
                </div>
                <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recall Sources</CardTitle>
              <CardDescription>Select which recall databases to monitor</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Checkbox checked={monitorFDADrugs} onCheckedChange={(c) => setMonitorFDADrugs(!!c)} />
                <div>
                  <p className="font-medium text-sm">FDA Drug Recalls</p>
                  <p className="text-xs text-muted-foreground">Drug enforcement reports from openFDA</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox checked={monitorFDAFood} onCheckedChange={(c) => setMonitorFDAFood(!!c)} />
                <div>
                  <p className="font-medium text-sm">FDA Food Recalls</p>
                  <p className="text-xs text-muted-foreground">Food enforcement reports from openFDA</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox checked={monitorFDADevices} onCheckedChange={(c) => setMonitorFDADevices(!!c)} />
                <div>
                  <p className="font-medium text-sm">FDA Device Recalls</p>
                  <p className="text-xs text-muted-foreground">Medical device enforcement reports</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox checked={monitorCPSC} onCheckedChange={(c) => setMonitorCPSC(!!c)} />
                <div>
                  <p className="font-medium text-sm">CPSC Recalls</p>
                  <p className="text-xs text-muted-foreground">Consumer Product Safety Commission recalls</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manufacturer Watchlist</CardTitle>
              <CardDescription>
                Add specific manufacturers to always check against recalls (one per line)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={watchlistManufacturers}
                onChange={(e) => setWatchlistManufacturers(e.target.value)}
                rows={5}
                placeholder="Enter manufacturer names, one per line..."
              />
              <Button
                className="mt-3"
                variant="outline"
                onClick={() => toast.success('Watchlist saved')}
              >
                Save Watchlist
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Recall Alert Details</DialogTitle>
          </DialogHeader>
          {detailAlert && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Product</p>
                  <p className="font-medium">{detailAlert.product_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">SKU</p>
                  <p className="font-medium">{detailAlert.product_sku}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Recall Number</p>
                  <p className="font-mono">{detailAlert.recall_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Source</p>
                  <Badge variant="outline">{detailAlert.recall_source}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Classification</p>
                  {classificationBadge(detailAlert.classification)}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  {alertStatusBadge(detailAlert.status)}
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-1">Reason</p>
                <p className="text-sm">{detailAlert.reason}</p>
              </div>
              {detailAlert.notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{detailAlert.notes}</p>
                </div>
              )}
              {detailAlert.affected_lots.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Affected Lots</p>
                  <div className="flex flex-wrap gap-1">
                    {detailAlert.affected_lots.map((lot) => (
                      <Badge key={lot} variant="outline">{lot}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {detailAlert.confidence_score !== null && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Match Confidence</p>
                  <Badge variant={detailAlert.confidence_score >= 70 ? 'destructive' : 'secondary'}>
                    {detailAlert.confidence_score}%
                  </Badge>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Entry Dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Recall Alert</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Product</Label>
              <Select value={manualProductId} onValueChange={setManualProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Recall Source</Label>
                <Select value={manualSource} onValueChange={setManualSource}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FDA">FDA</SelectItem>
                    <SelectItem value="CPSC">CPSC</SelectItem>
                    <SelectItem value="Manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Classification</Label>
                <Select value={manualClassification} onValueChange={setManualClassification}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Class I">Class I</SelectItem>
                    <SelectItem value="Class II">Class II</SelectItem>
                    <SelectItem value="Class III">Class III</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Recall Number</Label>
              <Input
                value={manualRecallNumber}
                onChange={(e) => setManualRecallNumber(e.target.value)}
                placeholder="e.g., D-1234-2026"
              />
            </div>
            <div>
              <Label>Reason for Recall</Label>
              <Textarea
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                rows={3}
                placeholder="Describe the recall reason..."
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                rows={2}
                placeholder="Additional notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleManualEntry}>Add Alert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
