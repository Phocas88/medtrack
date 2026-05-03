'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/providers/auth-provider'
import { toast } from 'sonner'
import {
  Zap,
  Copy,
  RefreshCw,
  TestTube,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Key,
  Webhook,
  Activity,
  Info,
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
import { Separator } from '@/components/ui/separator'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface WebhookLog {
  id: string
  timestamp: string
  direction: 'inbound' | 'outbound'
  action: string
  status: 'success' | 'error'
  details: string
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const TRIGGERS = [
  { name: 'New Stock Movement', description: 'Fires when inventory is moved, received, or adjusted', type: 'movement' },
  { name: 'New Sales Order', description: 'Fires when a new sales order is created', type: 'order' },
  { name: 'New Purchase Order', description: 'Fires when a new purchase order is created', type: 'po' },
  { name: 'Inventory Alert', description: 'Fires when stock falls below reorder point', type: 'movement' },
]

const ACTIONS = [
  { name: 'Create Product', description: 'Add a new product to your inventory', action: 'create_product' },
  { name: 'Create Order', description: 'Create a new sales order with line items', action: 'create_order' },
  { name: 'Create Customer', description: 'Add a new customer record', action: 'create_customer' },
  { name: 'Adjust Inventory', description: 'Create a stock movement / adjustment', action: 'adjust_inventory' },
]

const MOCK_LOGS: WebhookLog[] = [
  { id: '1', timestamp: new Date(Date.now() - 3600000).toISOString(), direction: 'outbound', action: 'Trigger: New Stock Movement', status: 'success', details: 'Returned 12 events' },
  { id: '2', timestamp: new Date(Date.now() - 7200000).toISOString(), direction: 'inbound', action: 'Action: Create Product', status: 'success', details: 'Created product SKU-9921' },
  { id: '3', timestamp: new Date(Date.now() - 10800000).toISOString(), direction: 'inbound', action: 'Action: Adjust Inventory', status: 'error', details: 'Missing product_id field' },
  { id: '4', timestamp: new Date(Date.now() - 14400000).toISOString(), direction: 'outbound', action: 'Trigger: New Sales Order', status: 'success', details: 'Returned 3 events' },
  { id: '5', timestamp: new Date(Date.now() - 18000000).toISOString(), direction: 'inbound', action: 'Action: Create Customer', status: 'success', details: 'Created customer Acme Corp' },
]

export default function ZapierIntegrationPage() {
  const { tenantId } = useAuth()
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; count?: number; error?: string } | null>(null)
  const [logs, setLogs] = useState<WebhookLog[]>([])

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  const fetchApiKey = useCallback(async () => {
    if (!tenantId) return
    const supabase = createClient()
    const { data } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single()

    const settings = (data?.settings as Record<string, unknown>) || {}
    setApiKey((settings.zapier_api_key as string) || null)
    setLoading(false)
  }, [tenantId])

  useEffect(() => {
    fetchApiKey()
  }, [fetchApiKey])

  useEffect(() => {
    // Load logs from localStorage or use mock data
    const stored = localStorage.getItem(`zapier_logs_${tenantId}`)
    if (stored) {
      try {
        setLogs(JSON.parse(stored))
      } catch {
        setLogs(MOCK_LOGS)
        localStorage.setItem(`zapier_logs_${tenantId}`, JSON.stringify(MOCK_LOGS))
      }
    } else {
      setLogs(MOCK_LOGS)
      if (tenantId) {
        localStorage.setItem(`zapier_logs_${tenantId}`, JSON.stringify(MOCK_LOGS))
      }
    }
  }, [tenantId])

  const generateApiKey = async () => {
    if (!tenantId) return
    setRegenerating(true)
    try {
      const newKey = generateUUID()
      const supabase = createClient()

      // Get current settings
      const { data: current } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single()

      const settings = (current?.settings as Record<string, unknown>) || {}
      settings.zapier_api_key = newKey

      const { error } = await supabase
        .from('tenants')
        .update({ settings })
        .eq('id', tenantId)

      if (error) throw error

      setApiKey(newKey)
      toast.success(apiKey ? 'API key regenerated' : 'API key generated')

      // Log it
      const logEntry: WebhookLog = {
        id: generateUUID(),
        timestamp: new Date().toISOString(),
        direction: 'inbound',
        action: apiKey ? 'API Key Regenerated' : 'API Key Generated',
        status: 'success',
        details: 'New Zapier API key created',
      }
      const updatedLogs = [logEntry, ...logs].slice(0, 50)
      setLogs(updatedLogs)
      localStorage.setItem(`zapier_logs_${tenantId}`, JSON.stringify(updatedLogs))
    } catch {
      toast.error('Failed to generate API key')
    } finally {
      setRegenerating(false)
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard`)
  }

  const testConnection = async () => {
    if (!apiKey) {
      toast.error('Generate an API key first')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`${baseUrl}/api/zapier/trigger?type=all`, {
        headers: { 'x-api-key': apiKey },
      })
      if (!res.ok) {
        const err = await res.json()
        setTestResult({ success: false, error: err.error || `HTTP ${res.status}` })
      } else {
        const data = await res.json()
        setTestResult({ success: true, count: Array.isArray(data) ? data.length : 0 })
      }

      const logEntry: WebhookLog = {
        id: generateUUID(),
        timestamp: new Date().toISOString(),
        direction: 'outbound',
        action: 'Test Connection',
        status: 'success',
        details: `Connection test completed`,
      }
      const updatedLogs = [logEntry, ...logs].slice(0, 50)
      setLogs(updatedLogs)
      localStorage.setItem(`zapier_logs_${tenantId}`, JSON.stringify(updatedLogs))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setTestResult({ success: false, error: err.message || 'Network error' })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Zap className="h-6 w-6 text-orange-500" />
          Zapier Integration
        </h2>
        <p className="text-muted-foreground mt-1">
          Connect TrackFlow to 6,000+ apps via Zapier webhooks.
        </p>
      </div>

      {/* API Key Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Key
          </CardTitle>
          <CardDescription>
            Your Zapier API key authenticates all webhook requests. Keep it secret.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  value={apiKey || 'No API key generated yet'}
                  readOnly
                  className="font-mono text-sm"
                />
                {apiKey && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(apiKey, 'API key')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <Button
              onClick={generateApiKey}
              disabled={regenerating}
              variant={apiKey ? 'outline' : 'default'}
            >
              {regenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {apiKey ? 'Regenerate' : 'Generate Key'}
            </Button>
          </div>

          {apiKey && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Keep this key safe</AlertTitle>
              <AlertDescription>
                Regenerating will invalidate the previous key and break any existing Zapier connections.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Webhook URLs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Webhook URLs
          </CardTitle>
          <CardDescription>
            Use these URLs when setting up your Zaps in Zapier.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Trigger URL (Zapier polls this)</Label>
            <div className="flex gap-2">
              <Input
                value={`${baseUrl}/api/zapier/trigger`}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(`${baseUrl}/api/zapier/trigger`, 'Trigger URL')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Query params: <code>?type=movement|order|po|all</code> and <code>?since=ISO_DATE</code>
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Action URL (Zapier sends data here)</Label>
            <div className="flex gap-2">
              <Input
                value={`${baseUrl}/api/zapier/action`}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(`${baseUrl}/api/zapier/action`, 'Action URL')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              POST with <code>{'{ "action": "...", "data": {...}, "api_key": "..." }'}</code>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Test Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            Test Connection
          </CardTitle>
          <CardDescription>
            Verify your API key works by fetching recent events from the trigger endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={testConnection} disabled={testing || !apiKey}>
            {testing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <TestTube className="mr-2 h-4 w-4" />
            )}
            Test Connection
          </Button>

          {testResult && (
            <Alert variant={testResult.success ? 'default' : 'destructive'}>
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertTitle>{testResult.success ? 'Connection Successful' : 'Connection Failed'}</AlertTitle>
              <AlertDescription>
                {testResult.success
                  ? `Retrieved ${testResult.count} event(s) from the trigger endpoint.`
                  : `Error: ${testResult.error}`}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Supported Triggers & Actions */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5 text-green-500" />
              Supported Triggers
            </CardTitle>
            <CardDescription>
              Events that fire from TrackFlow to Zapier.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {TRIGGERS.map((trigger) => (
                <div key={trigger.name} className="flex items-start gap-3 p-3 rounded-lg border">
                  <Badge variant="secondary" className="mt-0.5 shrink-0">
                    {trigger.type}
                  </Badge>
                  <div>
                    <p className="font-medium text-sm">{trigger.name}</p>
                    <p className="text-xs text-muted-foreground">{trigger.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowLeft className="h-5 w-5 text-blue-500" />
              Supported Actions
            </CardTitle>
            <CardDescription>
              Actions that Zapier can perform in TrackFlow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ACTIONS.map((action) => (
                <div key={action.name} className="flex items-start gap-3 p-3 rounded-lg border">
                  <Badge variant="outline" className="mt-0.5 shrink-0">
                    {action.action}
                  </Badge>
                  <div>
                    <p className="font-medium text-sm">{action.name}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            Setup Instructions
          </CardTitle>
          <CardDescription>
            Step-by-step guide to connect TrackFlow with Zapier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4 text-sm">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
              <div>
                <p className="font-medium">Generate an API Key</p>
                <p className="text-muted-foreground">Click the &quot;Generate Key&quot; button above to create your Zapier API key.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
              <div>
                <p className="font-medium">Create a Zap in Zapier</p>
                <p className="text-muted-foreground">
                  Go to <a href="https://zapier.com" target="_blank" rel="noopener noreferrer" className="underline">zapier.com</a> and click &quot;Create Zap&quot;.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
              <div>
                <p className="font-medium">Set Up a Trigger (TrackFlow &rarr; other app)</p>
                <p className="text-muted-foreground">
                  Choose &quot;Webhooks by Zapier&quot; as the trigger, select &quot;Retrieve Poll&quot;, and paste the <strong>Trigger URL</strong> above. Add header <code>x-api-key</code> with your API key.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">4</span>
              <div>
                <p className="font-medium">Set Up an Action (other app &rarr; TrackFlow)</p>
                <p className="text-muted-foreground">
                  Choose &quot;Webhooks by Zapier&quot; as the action, select &quot;POST&quot;, and paste the <strong>Action URL</strong> above.
                  Set the body to JSON with <code>action</code>, <code>data</code>, and <code>api_key</code> fields.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">5</span>
              <div>
                <p className="font-medium">Test and Enable</p>
                <p className="text-muted-foreground">
                  Use the &quot;Test Connection&quot; button above to verify everything works, then turn on your Zap in Zapier.
                </p>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Recent Webhook Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Webhook Activity
          </CardTitle>
          <CardDescription>
            Last 50 webhook interactions logged locally.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No webhook activity yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={log.direction === 'inbound' ? 'outline' : 'secondary'}>
                        {log.direction === 'inbound' ? 'IN' : 'OUT'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{log.action}</TableCell>
                    <TableCell>
                      {log.status === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.details}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
