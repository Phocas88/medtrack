import { SetupChecklist } from "@/components/workspace/setup-checklist";
import { OrderDesk } from "@/components/workspace/order-desk";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 200) : "";
  return <div className="space-y-4"><SetupChecklist /><OrderDesk key={query} initialQuery={query} /></div>;
}
