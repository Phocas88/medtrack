'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bell,
  AlertTriangle,
  Clock,
  Thermometer,
  FileWarning,
  ShieldAlert,
  Package,
  RotateCcw,
  CheckCheck,
  Info,
} from 'lucide-react';
import { formatRelativeDate } from '@/lib/format';
import type { Notification, NotificationType, NotificationPriority } from '@/types/database';

const typeIcons: Record<NotificationType, React.ElementType> = {
  low_stock: Package,
  expiring_lot: Clock,
  expiring_license: FileWarning,
  po_overdue: AlertTriangle,
  temp_excursion: Thermometer,
  reorder: RotateCcw,
  quarantine: ShieldAlert,
  recall: AlertTriangle,
  document_expiring: FileWarning,
  general: Info,
};

const typeLabels: Record<NotificationType, string> = {
  low_stock: 'Low Stock',
  expiring_lot: 'Expiring Lot',
  expiring_license: 'Expiring License',
  po_overdue: 'PO Overdue',
  temp_excursion: 'Temp Excursion',
  reorder: 'Reorder',
  quarantine: 'Quarantine',
  recall: 'Recall',
  document_expiring: 'Document Expiring',
  general: 'General',
};

const priorityColors: Record<NotificationPriority, string> = {
  critical: 'bg-red-500',
  high: 'bg-amber-500',
  medium: 'bg-blue-500',
  low: 'bg-gray-400',
};

const priorityBadgeVariants: Record<NotificationPriority, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-amber-100 text-amber-800 border-amber-200',
  medium: 'bg-blue-100 text-blue-800 border-blue-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
};

export default function NotificationsPage() {
  const { user, tenantId } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');

  const loadNotifications = useCallback(async () => {
    if (!tenantId || !user) return;
    const supabase = createClient();

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('tenant_id', tenantId)
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order('created_at', { ascending: false });

    if (filterType !== 'all') {
      query = query.eq('notification_type', filterType);
    }

    const { data } = await query.limit(200);
    setNotifications(data || []);
    setLoading(false);
  }, [tenantId, user, filterType]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function markAsRead(id: string) {
    const supabase = createClient();
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
    );
  }

  async function markAllRead() {
    if (!tenantId || !user) return;
    const supabase = createClient();
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', unreadIds);

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Notifications" />
        <div className="text-muted-foreground">Loading notifications...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Notifications"
        description="Stay updated on inventory alerts and system events"
        actions={
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <Badge variant="destructive">{unreadCount} unread</Badge>
            )}
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(typeLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={markAllRead} disabled={unreadCount === 0}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark All Read
            </Button>
          </div>
        }
      />

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Bell className="mx-auto mb-4 h-12 w-12 opacity-30" />
            <p>No notifications found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => {
            const Icon = typeIcons[notification.notification_type] || Info;
            return (
              <Card
                key={notification.id}
                className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                  !notification.is_read ? 'border-l-4 border-l-primary bg-primary/5' : ''
                }`}
                onClick={() => !notification.is_read && markAsRead(notification.id)}
              >
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="rounded-lg bg-muted p-2">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{notification.title}</span>
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          priorityColors[notification.priority]
                        }`}
                        title={notification.priority}
                      />
                      <Badge
                        variant="outline"
                        className={`text-xs ${priorityBadgeVariants[notification.priority]}`}
                      >
                        {notification.priority}
                      </Badge>
                      {!notification.is_read && (
                        <Badge variant="default" className="text-xs">New</Badge>
                      )}
                    </div>
                    {notification.message && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{typeLabels[notification.notification_type]}</span>
                      <span>{formatRelativeDate(notification.created_at)}</span>
                    </div>
                  </div>
                  {!notification.is_read && (
                    <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
