"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CreditCard,
  Check,
  X,
  Loader2,
  ExternalLink,
  AlertCircle,
  Users,
  Package,
  Warehouse,
} from "lucide-react";

// ── Plan definitions ───────────────────────────────────────────────────
const PLANS = [
  {
    key: "starter" as const,
    name: "Starter",
    price: 49,
    description: "For small warehouses getting started",
    userLimit: 5,
    features: {
      users: "Up to 5",
      locations: "1 warehouse",
      products: "1,000",
      orders: "500/mo",
      integrations: false,
      advancedAnalytics: false,
      customFields: false,
      apiAccess: false,
      prioritySupport: false,
      sla: false,
    },
  },
  {
    key: "professional" as const,
    name: "Professional",
    price: 99,
    description: "For growing operations",
    userLimit: 25,
    popular: true,
    features: {
      users: "Up to 25",
      locations: "3 warehouses",
      products: "10,000",
      orders: "5,000/mo",
      integrations: true,
      advancedAnalytics: true,
      customFields: false,
      apiAccess: false,
      prioritySupport: false,
      sla: false,
    },
  },
  {
    key: "enterprise" as const,
    name: "Enterprise",
    price: 199,
    description: "For large-scale distribution",
    userLimit: 999,
    features: {
      users: "Unlimited",
      locations: "Unlimited",
      products: "Unlimited",
      orders: "Unlimited",
      integrations: true,
      advancedAnalytics: true,
      customFields: false,
      apiAccess: true,
      prioritySupport: true,
      sla: true,
    },
  },
];

const FEATURE_LABELS: Record<string, string> = {
  users: "Team members",
  locations: "Warehouse locations",
  products: "Product catalog",
  orders: "Monthly orders",
  integrations: "Integrations (QuickBooks, etc.)",
  advancedAnalytics: "Advanced analytics",
  customFields: "Custom fields",
  apiAccess: "API access",
  prioritySupport: "Priority support",
  sla: "SLA guarantee",
};

interface BillingInfo {
  plan: string | null;
  status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

function getStatusVariant(
  status: string | null,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "past_due":
      return "destructive";
    case "cancelled":
    case "canceled":
    case "cancelling":
      return "secondary";
    case "trial":
    case "trialing":
      return "outline";
    default:
      return "secondary";
  }
}

export default function BillingPage() {
  const { tenantId } = useAuth();
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!tenantId) return;

    async function loadBilling() {
      const supabase = createClient();

      // Fetch tenant settings for billing info
      const { data: tenant } = await supabase
        .from("tenant_billing")
        .select("*")
        .eq("tenant_id", tenantId)
        .single();

      const billing = tenant as Record<string, unknown> | null;
      setBilling({
        plan: (billing?.plan as string) || null,
        status: (billing?.status as string) || null,
        stripe_customer_id: (billing?.stripe_customer_id as string) || null,
        stripe_subscription_id:
          (billing?.stripe_subscription_id as string) || null,
      });

      // Fetch user count for this tenant
      const { count } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId!);

      setUserCount(count || 0);
      setLoading(false);
    }

    loadBilling();
  }, [tenantId]);

  async function handleSubscribe(planKey: string) {
    if (!tenantId) return;

    setCheckoutLoading(planKey);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: planKey,
          tenantId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to start checkout");
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleManageSubscription() {
    if (!tenantId) return;

    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to open billing portal");
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast.error("Failed to open billing portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  }

  const currentPlan = PLANS.find((p) => p.key === billing?.plan);
  const isSubscribed =
    billing?.plan &&
    !["cancelled", "canceled", "incomplete_expired"].includes(
      billing?.status || "",
    );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Current Plan */}
      {isSubscribed && currentPlan ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Current Plan
                </CardTitle>
                <CardDescription>
                  Manage your subscription and billing
                </CardDescription>
              </div>
              <Badge variant={getStatusVariant(billing?.status ?? null)}>
                {billing?.status?.replace("_", " ") || "unknown"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Plan</p>
                <p className="text-2xl font-bold">{currentPlan.name}</p>
                <p className="text-sm text-muted-foreground">
                  ${currentPlan.price}/month
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Team Members</p>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <p className="text-2xl font-bold">
                    {userCount}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      / {currentPlan.features.users}
                    </span>
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Warehouses</p>
                <div className="flex items-center gap-2">
                  <Warehouse className="h-4 w-4 text-muted-foreground" />
                  <p className="text-2xl font-bold">
                    {currentPlan.features.locations}
                  </p>
                </div>
              </div>
            </div>

            {billing?.status === "past_due" && (
              <div className="mt-4 flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <p className="text-sm">
                  Your payment is past due. Please update your payment method to
                  avoid service interruption.
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex gap-3">
            <Button onClick={handleManageSubscription} disabled={portalLoading}>
              {portalLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Manage Subscription
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      ) : (
        /* No Plan - Show pricing cards */
        <>
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold">Choose Your Plan</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Select the plan that best fits your warehouse operations. All
              plans include core inventory management features.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {PLANS.map((plan) => (
              <Card
                key={plan.key}
                className={
                  plan.popular
                    ? "border-primary shadow-md relative"
                    : "relative"
                }
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge>Most Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="pt-2">
                    <span className="text-4xl font-bold">${plan.price}</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {plan.features.users} users
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Warehouse className="h-4 w-4 text-muted-foreground" />
                      {plan.features.locations}
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      {plan.features.products} products
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      {plan.features.orders} orders
                    </li>
                    <Separator className="my-2" />
                    {plan.features.integrations && (
                      <li className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500" />
                        Integrations
                      </li>
                    )}
                    {plan.features.advancedAnalytics && (
                      <li className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500" />
                        Advanced analytics
                      </li>
                    )}
                    {plan.features.customFields && (
                      <li className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500" />
                        Custom fields
                      </li>
                    )}
                    {plan.features.apiAccess && (
                      <li className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500" />
                        API access
                      </li>
                    )}
                    {plan.features.prioritySupport && (
                      <li className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500" />
                        Priority support
                      </li>
                    )}
                    {plan.features.sla && (
                      <li className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500" />
                        SLA guarantee
                      </li>
                    )}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={plan.popular ? "default" : "outline"}
                    onClick={() => handleSubscribe(plan.key)}
                    disabled={checkoutLoading !== null}
                  >
                    {checkoutLoading === plan.key && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Subscribe to {plan.name}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Billing History */}
      {isSubscribed && (
        <Card>
          <CardHeader>
            <CardTitle>Billing History</CardTitle>
            <CardDescription>
              View and download invoices from the Stripe Customer Portal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={handleManageSubscription}
              disabled={portalLoading}
            >
              {portalLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              View Invoices in Stripe
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Plan Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Comparison</CardTitle>
          <CardDescription>Compare features across all plans</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">Feature</TableHead>
                {PLANS.map((plan) => (
                  <TableHead key={plan.key} className="text-center">
                    {plan.name}
                    <br />
                    <span className="text-xs font-normal text-muted-foreground">
                      ${plan.price}/mo
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                <TableRow key={key}>
                  <TableCell className="font-medium">{label}</TableCell>
                  {PLANS.map((plan) => {
                    const value =
                      plan.features[key as keyof typeof plan.features];
                    return (
                      <TableCell key={plan.key} className="text-center">
                        {typeof value === "boolean" ? (
                          value ? (
                            <Check className="h-4 w-4 text-green-500 mx-auto" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground mx-auto" />
                          )
                        ) : (
                          <span className="text-sm">{value}</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
