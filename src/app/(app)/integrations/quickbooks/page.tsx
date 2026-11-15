import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
export default function QuickBooksPage() {
  return <div className="space-y-6"><PageHeader title="QuickBooks" description="Accounting integration" /><Card><CardContent className="pt-6 space-y-3"><h2 className="font-semibold">QuickBooks synchronization is not available yet</h2><p>No QuickBooks account is connected and no accounting records are synchronized. Do not enter QuickBooks credentials into Stokora.</p><p>You can export warehouse reports from the Reports page.</p><a className="underline" href="/reports">Open reports</a></CardContent></Card></div>;
}
