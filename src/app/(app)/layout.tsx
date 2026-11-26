"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  WorkspaceNavigation,
  MobileSidebar,
} from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AuthProvider, useAuth } from "@/components/providers/auth-provider";
import Link from "next/link";
import { unavailableWorkflow } from "@/lib/release-scope";
import { createClient } from "@/lib/supabase/client";

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { tenantId, loading, accountEmail, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (loading || !tenantId) return;
    if (pathname.startsWith("/onboarding")) {
      setChecked(true);
      return;
    }

    const supabase = createClient();
    supabase
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          setChecked(true);
          return;
        }
        const settings = (data?.settings as Record<string, unknown>) || {};
        if (!settings.onboarding_completed) {
          router.replace("/onboarding");
        } else {
          setChecked(true);
        }
      });
  }, [tenantId, loading, pathname, router]);

  if (!loading && !tenantId)
    return (
      <div className="p-8 space-y-4">
        <h1>Account setup needs attention</h1>
        <p>
          Your warehouse profile is unavailable. Sign out and contact support if
          this continues.
        </p>
        {accountEmail && <p>Signed in as {accountEmail}</p>}
        <button type="button" className="underline" onClick={() => void signOut()}>Switch account</button>
        <Link className="ml-4 underline" href="/support">Contact support</Link>
      </div>
    );

  if (!checked && !pathname.startsWith("/onboarding")) {
    return <p role="status" className="p-4">Loading your warehouse workspace…</p>;
  }

  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const unavailable = unavailableWorkflow(usePathname());

  return (
    <AuthProvider>
      <OnboardingGate>
        <div className="workspace-theme flex h-dvh flex-col overflow-hidden">
          {/* Desktop sidebar */}
          <WorkspaceNavigation />

          {/* Mobile sidebar */}
          <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />

          {/* Main content area */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <Header onMenuClick={() => setMobileOpen(true)} />
            <main
              id="main-content"
              className="flex-1 overflow-y-auto p-4 md:p-6"
            >
              <div className="mx-auto w-full max-w-[1600px]">
                {unavailable ? (
                  <section className="max-w-xl space-y-4 border bg-card p-6">
                    <h1 className="text-xl font-semibold">
                      {unavailable.title}
                    </h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {unavailable.message}
                    </p>
                    <Link
                      href="/dashboard"
                      className="inline-block text-sm text-primary underline"
                    >
                      Open warehouse operations
                    </Link>
                  </section>
                ) : (
                  children
                )}
              </div>
            </main>
          </div>
        </div>
      </OnboardingGate>
    </AuthProvider>
  );
}
