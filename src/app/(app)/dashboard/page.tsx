import { SetupChecklist } from "@/components/workspace/setup-checklist";
import { OrderDesk } from "@/components/workspace/order-desk";

export default function DashboardPage() {
  return <div className="space-y-4"><SetupChecklist /><OrderDesk /></div>;
}
