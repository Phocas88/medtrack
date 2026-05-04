'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  Clock,
  Zap,
  Target,
  Calendar,
  TrendingUp,
} from 'lucide-react';

interface StatsData {
  todayCompleted: number;
  todayAvgMinutes: number;
  todayScans: number;
  weekCompleted: number;
  weekAvgMinutes: number;
  totalCompleted: number;
  recentTasks: {
    title: string;
    task_type: string;
    completed_at: string;
    duration_minutes: number;
  }[];
}

export default function ScannerStatsPage() {
  const { user, tenantId } = useAuth();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    if (!tenantId || !user) return;
    const supabase = createClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    // Get completed tasks
    const { data: allTasks } = await supabase
      .from('scan_tasks')
      .select('title, task_type, started_at, completed_at, status')
      .eq('tenant_id', tenantId)
      .eq('completed_by', user.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(200);

    const tasks = allTasks || [];

    // Today
    const todayTasks = tasks.filter((t) => t.completed_at && new Date(t.completed_at) >= today);
    const todayDurations = todayTasks
      .filter((t) => t.started_at && t.completed_at)
      .map((t) => (new Date(t.completed_at!).getTime() - new Date(t.started_at!).getTime()) / 60000);
    const todayAvg = todayDurations.length > 0
      ? todayDurations.reduce((a, b) => a + b, 0) / todayDurations.length
      : 0;

    // Week
    const weekTasks = tasks.filter((t) => t.completed_at && new Date(t.completed_at) >= weekAgo);
    const weekDurations = weekTasks
      .filter((t) => t.started_at && t.completed_at)
      .map((t) => (new Date(t.completed_at!).getTime() - new Date(t.started_at!).getTime()) / 60000);
    const weekAvg = weekDurations.length > 0
      ? weekDurations.reduce((a, b) => a + b, 0) / weekDurations.length
      : 0;

    // Scan logs count today
    const { count: scanCount } = await supabase
      .from('scan_logs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('scanned_by', user.id)
      .gte('scanned_at', today.toISOString());

    // Recent tasks with duration
    const recentTasks = tasks.slice(0, 10).map((t) => {
      const dur = t.started_at && t.completed_at
        ? (new Date(t.completed_at).getTime() - new Date(t.started_at).getTime()) / 60000
        : 0;
      return {
        title: t.title,
        task_type: t.task_type,
        completed_at: t.completed_at!,
        duration_minutes: Math.round(dur * 10) / 10,
      };
    });

    setStats({
      todayCompleted: todayTasks.length,
      todayAvgMinutes: Math.round(todayAvg * 10) / 10,
      todayScans: scanCount || 0,
      weekCompleted: weekTasks.length,
      weekAvgMinutes: Math.round(weekAvg * 10) / 10,
      totalCompleted: tasks.length,
      recentTasks,
    });
    setLoading(false);
  }, [tenantId, user]);

  useEffect(() => { loadStats(); }, [loadStats]);

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Loading stats...</div>;
  }

  if (!stats) return null;

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">My Performance</h2>

      {/* Today */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto text-green-500 mb-1" />
            <p className="text-2xl font-bold">{stats.todayCompleted}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Clock className="h-5 w-5 mx-auto text-blue-500 mb-1" />
            <p className="text-2xl font-bold">{stats.todayAvgMinutes}<span className="text-sm">m</span></p>
            <p className="text-[10px] text-muted-foreground uppercase">Avg Time</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Zap className="h-5 w-5 mx-auto text-amber-500 mb-1" />
            <p className="text-2xl font-bold">{stats.todayScans}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Scans</p>
          </CardContent>
        </Card>
      </div>

      {/* Week */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Calendar className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xl font-bold">{stats.weekCompleted}</p>
            <p className="text-[10px] text-muted-foreground uppercase">This Week</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xl font-bold">{stats.weekAvgMinutes}<span className="text-sm">m</span></p>
            <p className="text-[10px] text-muted-foreground uppercase">Week Avg</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Target className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xl font-bold">{stats.totalCompleted}</p>
            <p className="text-[10px] text-muted-foreground uppercase">All Time</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent tasks */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recent Tasks</CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-2">
          {stats.recentTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No completed tasks yet</p>
          ) : (
            stats.recentTasks.map((task, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] capitalize">{task.task_type.replace('_', ' ')}</Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(task.completed_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-sm font-bold">{task.duration_minutes}m</p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
