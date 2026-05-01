'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Package,
  FileText,
  ClipboardCheck,
  ShieldCheck,
  Pill,
  Warehouse,
  Download,
  Clock,
} from 'lucide-react';
import { formatDate, formatNumber } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';

interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const reportCards: ReportCard[] = [
  {
    id: 'state_board',
    title: 'State Board Inspection',
    description:
      'Products with storage requirements, lot counts by product, and expiration status summary. Required for state pharmacy board inspections.',
    icon: <ShieldCheck className="h-6 w-6 text-blue-600" />,
  },
  {
    id: 'fda_establishment',
    title: 'FDA Establishment',
    description:
      'Complete product listing with NDC codes, manufacturers, and current stock levels. Required for annual FDA establishment registration.',
    icon: <ClipboardCheck className="h-6 w-6 text-green-600" />,
  },
  {
    id: 'annual_inventory',
    title: 'Annual Physical Inventory',
    description:
      'Full inventory listing with quantities on hand and estimated valuations per product. Used for year-end physical inventory reconciliation.',
    icon: <Warehouse className="h-6 w-6 text-amber-600" />,
  },
  {
    id: 'controlled_substance',
    title: 'Controlled Substance Reconciliation',
    description:
      'Reconciliation of all controlled substance receipts, dispensations, and adjustments. Required by DEA for Schedule II-V substances.',
    icon: <Pill className="h-6 w-6 text-red-600" />,
  },
];

interface HistoryEntry {
  id: string;
  report_type: string;
  generated_at: string;
  generated_by: string;
}

export default function CompliancePage() {
  const { tenantId } = useAuth();
  const [totalProducts, setTotalProducts] = useState(0);
  const [activeLots, setActiveLots] = useState(0);
  const [documentsCount, setDocumentsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [history] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    async function loadStats() {
      if (!tenantId) return;
      const supabase = createClient();

      const [productsRes, lotsRes, docsRes] = await Promise.all([
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        supabase
          .from('lots')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'active'),
        supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
      ]);

      setTotalProducts(productsRes.count || 0);
      setActiveLots(lotsRes.count || 0);
      setDocumentsCount(docsRes.count || 0);
      setLoading(false);
    }

    loadStats();
  }, [tenantId]);

  async function generateReport(reportId: string) {
    if (!tenantId) return;
    setGenerating(reportId);
    const supabase = createClient();

    try {
      switch (reportId) {
        case 'state_board': {
          const { data: lots } = await supabase
            .from('lots')
            .select('product_id, lot_number, expiration_date, status, quantity, product:products(name, sku)')
            .eq('tenant_id', tenantId)
            .order('expiration_date');

          const rows = (lots || []).map((lot) => {
            const p = lot.product as unknown as { name: string; sku: string } | null;
            const now = new Date();
            const exp = lot.expiration_date ? new Date(lot.expiration_date) : null;
            let expiryStatus = 'N/A';
            if (exp) {
              const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              if (daysLeft < 0) expiryStatus = 'EXPIRED';
              else if (daysLeft <= 30) expiryStatus = 'CRITICAL (<30 days)';
              else if (daysLeft <= 90) expiryStatus = 'WARNING (<90 days)';
              else expiryStatus = 'OK';
            }
            return {
              product: p?.name || '',
              sku: p?.sku || '',
              lot_number: lot.lot_number,
              quantity: lot.quantity,
              status: lot.status,
              expiration_date: formatDate(lot.expiration_date),
              expiry_status: expiryStatus,
            };
          });

          exportToCSV(rows, 'state_board_inspection');
          toast.success('State Board Inspection report exported');
          break;
        }

        case 'fda_establishment': {
          const { data: products } = await supabase
            .from('products')
            .select('name, sku, ndc, manufacturer, category, current_stock, unit_of_measure')
            .eq('tenant_id', tenantId)
            .order('name');

          const rows = (products || []).map((p) => ({
            product_name: p.name,
            sku: p.sku,
            ndc: p.ndc || '',
            manufacturer: p.manufacturer || '',
            category: p.category || '',
            current_stock: p.current_stock,
            unit_of_measure: p.unit_of_measure || '',
          }));

          exportToCSV(rows, 'fda_establishment');
          toast.success('FDA Establishment report exported');
          break;
        }

        case 'annual_inventory': {
          const { data: products } = await supabase
            .from('products')
            .select('name, sku, category, current_stock, unit_cost, unit_of_measure')
            .eq('tenant_id', tenantId)
            .order('name');

          const rows = (products || []).map((p) => ({
            product_name: p.name,
            sku: p.sku,
            category: p.category || '',
            quantity_on_hand: p.current_stock,
            unit_cost: p.unit_cost || 0,
            total_value: (p.current_stock || 0) * (p.unit_cost || 0),
            unit_of_measure: p.unit_of_measure || '',
          }));

          exportToCSV(rows, 'annual_physical_inventory');
          toast.success('Annual Physical Inventory report exported');
          break;
        }

        case 'controlled_substance': {
          const { data: movements } = await supabase
            .from('stock_movements')
            .select('*, product:products(name, sku, dea_schedule), lot:lots(lot_number)')
            .eq('tenant_id', tenantId)
            .not('product.dea_schedule', 'is', null)
            .order('created_at', { ascending: false });

          const rows = (movements || [])
            .filter((m) => {
              const p = m.product as unknown as { dea_schedule: string | null } | null;
              return p?.dea_schedule;
            })
            .map((m) => {
              const p = m.product as unknown as { name: string; sku: string; dea_schedule: string } | null;
              const l = m.lot as unknown as { lot_number: string } | null;
              return {
                date: formatDate(m.created_at),
                product: p?.name || '',
                sku: p?.sku || '',
                dea_schedule: p?.dea_schedule || '',
                lot_number: l?.lot_number || '',
                movement_type: m.movement_type,
                quantity: m.quantity,
                reference: m.reference_number || '',
                reason: m.reason || '',
              };
            });

          exportToCSV(rows, 'controlled_substance_reconciliation');
          toast.success('Controlled Substance Reconciliation report exported');
          break;
        }
      }
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance Reports"
        description="Generate regulatory and compliance reports for inspections and audits"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Products"
          value={loading ? '...' : formatNumber(totalProducts)}
          icon={Package}
        />
        <StatCard
          title="Active Lots"
          value={loading ? '...' : formatNumber(activeLots)}
          icon={FileText}
        />
        <StatCard
          title="Documents on File"
          value={loading ? '...' : formatNumber(documentsCount)}
          icon={ClipboardCheck}
        />
      </div>

      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {reportCards.map((report) => (
              <Card key={report.id}>
                <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-2">
                  <div className="rounded-lg bg-muted p-2">{report.icon}</div>
                  <div className="flex-1">
                    <CardTitle className="text-base">{report.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    {report.description}
                  </p>
                  <Button
                    onClick={() => generateReport(report.id)}
                    disabled={generating !== null}
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {generating === report.id ? 'Generating...' : 'Generate Report'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Report History</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Clock className="h-10 w-10 mb-3 opacity-50" />
                  <p className="text-sm">No reports have been generated yet.</p>
                  <p className="text-xs mt-1">
                    Generated reports will appear here for your records.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Report Type</TableHead>
                      <TableHead>Generated At</TableHead>
                      <TableHead>Generated By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{entry.report_type}</TableCell>
                        <TableCell>{formatDate(entry.generated_at)}</TableCell>
                        <TableCell>{entry.generated_by}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
