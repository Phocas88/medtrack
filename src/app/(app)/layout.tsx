"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { AuthProvider, useAuth } from "@/components/providers/auth-provider"
import { createClient } from "@/lib/supabase/client"

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { tenantId, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    setSlow(false)
    const timeout = window.setTimeout(() => setSlow(true), 10000)
    return () => window.clearTimeout(timeout)
  }, [loading, tenantId, pathname])

  useEffect(() => {
    if (loading || !tenantId) return
    if (pathname.startsWith("/onboarding")) {
      setChecked(true)
      return
    }

    const supabase = createClient()
    supabase
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          setChecked(true)
          return
        }
        const settings = (data?.settings as Record<string, unknown>) || {}
        if (!settings.onboarding_completed) {
          router.replace("/onboarding")
        } else {
          setChecked(true)
        }
      })
  }, [tenantId, loading, pathname, router])

  if (loading || !tenantId || (!checked && !pathname.startsWith("/onboarding"))) {
    const missing = !loading && !tenantId
    return (
      <main className="mx-auto max-w-lg space-y-3 px-5 py-16">
        <h1 className="text-xl font-semibold">{missing ? "Warehouse workspace unavailable" : "Loading your warehouse workspace"}</h1>
        <p role="status" className="text-sm text-muted-foreground">
          {missing
            ? "Your warehouse profile could not be loaded. Contact your workspace administrator if this continues."
            : slow ? "This is taking longer than expected. Try reloading the page." : "Checking your account and workspace settings."}
        </p>
        {(missing || slow) && (
          <div className="flex flex-wrap gap-4 text-sm">
            <button type="button" className="underline" onClick={() => window.location.reload()}>Reload page</button>
            {missing && <Link className="underline" href="/support">Get support</Link>}
          </div>
        )}
      </main>
    )
  }

  return <>{children}</>
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <OnboardingGate>
        <div className="flex h-dvh flex-col overflow-hidden">
          <Header />
          <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
            {children}
          </main>
        </div>
      </OnboardingGate>
    </AuthProvider>
  )
}
