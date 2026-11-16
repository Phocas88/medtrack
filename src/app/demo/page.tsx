import Link from "next/link";
import { StokoraNavigationLogo } from "@/components/ui/stokora-logo";
export default function DemoPage() {
  return (
    <div className="workspace-theme min-h-screen">
      <header className="flex items-center justify-between border-b bg-card px-6 py-3">
        <Link href="/" aria-label="Stokora home">
          <StokoraNavigationLogo />
        </Link>
        <Link href="/auth/login" className="text-sm">
          Sign in
        </Link>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-6 py-16">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Product preview
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            See the Stokora workspace
          </h1>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Explore the order-desk layout with sample orders. Search, filter and
            inspect records without creating an account.
          </p>
        </div>
        <Link
          href="/demo/workspace"
          className="inline-block bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
        >
          Open interactive preview →
        </Link>
        <section className="space-y-3 border-t pt-6">
          <h2 className="font-semibold">Try your own warehouse</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Create an account to set up your warehouse, add inventory and run
            receiving and shipping workflows. Integrations require configuration
            and provider authorization.
          </p>
          <Link
            href="/auth/signup"
            className="inline-block text-sm text-primary underline"
          >
            Create an account
          </Link>
        </section>
        <p className="border-t pt-5 text-xs leading-relaxed text-muted-foreground">
          The preview contains illustrative data and does not execute shipments,
          payments or accounting exports. Contact support to discuss your
          required workflows before starting a paid rollout.
        </p>
        <Link href="/support" className="inline-block text-sm underline">
          Contact support
        </Link>
      </main>
    </div>
  );
}
