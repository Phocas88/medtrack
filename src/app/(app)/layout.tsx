"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { AuthProvider, useAuth } from "@/components/providers/auth-provider"
import { createClient } from "@/lib/supabase/client"

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { tenantId, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [checked, setChecked] = useState(false)

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

  if (!checked && !pathname.startsWith("/onboarding")) {
    return null
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
