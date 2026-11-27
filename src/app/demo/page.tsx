import RoleWalkthroughs from "./role-walkthroughs";
import Link from "next/link";
import { InvexiqsNavigationLogo } from "@/components/ui/invexiqs-logo";
export default function DemoPage() {
  return (
    <div className="workspace-theme min-h-screen">
      <header className="flex items-center justify-between border-b bg-card px-6 py-3">
        <Link href="/" aria-label="Invexiqs home">
          <InvexiqsNavigationLogo />
        </Link>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-6 py-16">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Product preview
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-heading">
            See Invexiqs in action
          </h1>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Try a sample warehouse. Look up a bin, receive stock, or investigate a held order without creating an account.
          </p>
        </div>
        <Link
          href="/demo/workspace"
          className="brand-cta px-5 py-3 text-sm"
        >
          Enter the warehouse demo →
        </Link>
        <RoleWalkthroughs />
        <section className="space-y-3 border-t pt-6">
          <h2 className="font-semibold">Try your own warehouse</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Register now for warehouse access when Invexiqs launches in June 2027.
          </p>
          <Link
            href="/auth/signup"
            className="inline-block text-sm text-primary underline"
          >
            Create a prelaunch account
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
