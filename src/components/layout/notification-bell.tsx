"use client"

import { useEffect, useState, useCallback } from "react"
import { Bell, Package, Clock, Truck, Thermometer, RotateCcw, ShieldAlert, AlertTriangle, FileWarning, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { createClient } from "@/lib/supabase/client"
import type { Notification, NotificationType } from "@/types/database"
import Link from "next/link"

const typeIcons: Record<NotificationType, React.ElementType> = {
  low_stock: Package,
  expiring_lot: Clock,
  expiring_license: FileWarning,
  po_overdue: Truck,
  temp_excursion: Thermometer,
  reorder: RotateCcw,
  quarantine: ShieldAlert,
  recall: AlertTriangle,
  document_expiring: FileWarning,
  general: Bell,
}

const priorityColors: Record<string, string> = {
  critical: "text-red-500",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-muted-foreground",
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return new Date(dateStr).toLocaleDateString()
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchNotifications = useCallback(async () => {
    try {
      const supabase = createClient()

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      if (!authUser) return

      // Get the user's tenant_id
      const { data: dbUser } = await supabase
        .from("users")
        .select("tenant_id")
        .eq("id", authUser.id)
        .single()

      if (!dbUser) return

      // Fetch recent notifications for this user (targeted or broadcast)
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("tenant_id", dbUser.tenant_id)
        .or(`user_id.eq.${authUser.id},user_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(10)

      if (error) {
        console.error("Failed to fetch notifications:", error)
        return
      }

      setNotifications(data ?? [])

      // Count unread
      const { count, error: countErr } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", dbUser.tenant_id)
        .or(`user_id.eq.${authUser.id},user_id.is.null`)
        .eq("is_read", false)

      if (!countErr) {
        setUnreadCount(count ?? 0)
      }
    } catch (err) {
      console.error("Notification fetch error:", err)
    }
  }, [])

  // Initial fetch and polling
  useEffect(() => {
    fetchNotifications()

    // Poll every 60 seconds
    const interval = setInterval(fetchNotifications, 60000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Refetch when popover opens
  useEffect(() => {
    if (open) {
      fetchNotifications()
    }
  }, [open, fetchNotifications])

  const markAsRead = async (notificationId: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notificationId)

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        )
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    }
  }

  const markAllAsRead = async () => {
    setLoading(true)
    try {
      const supabase = createClient()

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (!authUser) return

      const { data: dbUser } = await supabase
        .from("users")
        .select("tenant_id")
        .eq("id", authUser.id)
        .single()
      if (!dbUser) return

      // Mark all unread notifications for this user as read
      const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id)
      if (unreadIds.length > 0) {
        await supabase
          .from("notifications")
          .update({ is_read: true, read_at: new Date().toISOString() })
          .in("id", unreadIds)
      }

      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      )
      setUnreadCount(0)
    } catch (err) {
      console.error("Mark all read error:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={markAllAsRead}
              disabled={loading}
            >
              <Check className="mr-1 h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>
        <Separator />

        {/* Notification list */}
        <ScrollArea className="h-[320px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((notification) => {
                const Icon = typeIcons[notification.notification_type] ?? Bell
                const priorityColor = priorityColors[notification.priority] ?? "text-muted-foreground"

                return (
                  <button
                    key={notification.id}
                    className={`flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                      !notification.is_read ? "bg-muted/30" : ""
                    }`}
                    onClick={() => {
                      if (!notification.is_read) {
                        markAsRead(notification.id)
                      }
                    }}
                  >
                    <div className={`mt-0.5 shrink-0 ${priorityColor}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-tight ${!notification.is_read ? "font-medium" : "text-muted-foreground"}`}>
                        {notification.title}
                      </p>
                      {notification.message && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {notification.message}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-muted-foreground/70">
                        {timeAgo(notification.created_at)}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <Separator />
        <div className="p-2">
          <Link
            href="/notifications"
            className="flex w-full items-center justify-center rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
