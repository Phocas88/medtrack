import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';
import { PurchaseOrderGenerator, SkuGenerator } from './document-tools';
import { WarehouseTools } from './warehouse-tools';

export const metadata = { title: 'Free Warehouse Tools | Invexiqs', description: 'Make bin labels and estimate the inventory level at which to reorder.' };

export default function ToolsPage() {
  return <><PublicHeader /><main className="mx-auto max-w-5xl space-y-8 px-5 py-12">
    <h1 className="text-4xl font-bold text-brand-deep-plum">Free Warehouse Tools</h1>
    <WarehouseTools />
    <div className="grid gap-5 md:grid-cols-2">
      <SkuGenerator />
      <PurchaseOrderGenerator />
    </div>
    <section id="templates" className="space-y-3 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">CSV import templates</h2>
      <p>Use these sample files to prepare a product catalog or opening balances.</p>
      <div className="flex flex-wrap gap-4 text-brand-royal-plum">
        <a href="data:text/csv;charset=utf-8,sku%2Cname%2Clot_tracked%0ABOX-100%2CShipping%20box%2Cfalse%0A" download="invexiqs-products.csv" className="underline">Product catalog CSV</a>
        <a href="data:text/csv;charset=utf-8,sku%2Cbin%2Cquantity%2Clot%2Cexpiration%0ABOX-100%2CSTARTER%2C25%2C%2C%0A" download="invexiqs-opening-balances.csv" className="underline">Opening balances CSV</a>
      </div>
    </section>
  </main><PublicFooter /></>;
}
