'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  CheckCircle2,
  Timer,
  Zap,
  Download,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime, formatNumber } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskRow {
  id: string;
  task_type: string;
  status: string;
  assigned_to: string | null;
  started_at: string | null;
  completed_at: string | null;
  title: string;
  created_at: string;
}

interface UserRow {
  id: string;
  full_name: string;
  email: string;
}

interface AssociateStats {
  userId: string;
  name: string;
  email: string;
  tasksToday: number;
  tasksWeek: number;
  tasksMonth: number;
  avgTime: number; // seconds
  picksPerHour: number;
  fastestTask: number;
  slowestTask: number;
  totalTasks: number;
}

interface TaskTypeStats {
  taskType: string;
  totalCompleted: number;
  avgTime: number;
  medianTime: number;
  fastest: number;
  slowest: number;
}

interface DailyProductivity {
  date: string;
  totalTasks: number;
  totalHours: number;
  tasksPerHour: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function durationSeconds(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return diff > 0 ? diff / 1000 : null;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function taskTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    pick: 'Pick',
    putaway: 'Put-Away',
    cycle_count: 'Cycle Count',
    replenish: 'Replenish',
    verify_stock: 'Verify Stock',
    bin_to_bin: 'Bin-to-Bin',
    verify_bin: 'Verify Bin',
  };
  return labels[type] || type;
}

function perfBadge(value: number, avg: number): React.ReactNode {
  if (avg === 0) return null;
  const ratio = value / avg;
  if (ratio >= 1.15) return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Above Avg</Badge>;
  if (ratio >= 0.85) return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Near Avg</Badge>;
  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Below Avg</Badge>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LaborPage() {
  const { tenantId } = useAuth();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  // ── Data fetching ──
  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const [tasksRes, usersRes] = await Promise.all([
        supabase
          .from('scan_tasks')
          .select('id, task_type, status, assigned_to, started_at, completed_at, title, created_at')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false }),
        supabase
          .from('users')
          .select('id, full_name, email')
          .eq('tenant_id', tenantId)
          .eq('is_active', true),
      ]);

      if (tasksRes.error) throw tasksRes.error;
      if (usersRes.error) throw usersRes.error;
      setTasks((tasksRes.data as TaskRow[]) || []);
      setUsers((usersRes.data as UserRow[]) || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load labor data');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived data ──
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  const completedTasks = useMemo(() => tasks.filter((t) => t.status === 'completed' && t.started_at && t.completed_at), [tasks]);

  const tasksToday = useMemo(() => completedTasks.filter((t) => new Date(t.completed_at!) >= todayStart), [completedTasks, todayStart]);

  const userMap = useMemo(() => {
    const m: Record<string, UserRow> = {};
    users.forEach((u) => { m[u.id] = u; });
    return m;
  }, [users]);

  // Active associates (users with tasks today)
  const activeAssociates = useMemo(() => {
    const ids = new Set(tasksToday.map((t) => t.assigned_to).filter(Boolean));
    return ids.size;
  }, [tasksToday]);

  // Avg task time today
  const avgTaskTimeToday = useMemo(() => {
    const durations = tasksToday.map((t) => durationSeconds(t.started_at, t.completed_at)).filter((d): d is number => d !== null);
    return durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  }, [tasksToday]);

  // Picks per hour today
  const picksPerHourToday = useMemo(() => {
    const pickTasks = tasksToday.filter((t) => t.task_type === 'pick');
    if (pickTasks.length === 0) return 0;
    const totalSeconds = pickTasks
      .map((t) => durationSeconds(t.started_at, t.completed_at))
      .filter((d): d is number => d !== null)
      .reduce((a, b) => a + b, 0);
    if (totalSeconds === 0) return 0;
    return (pickTasks.length / totalSeconds) * 3600;
  }, [tasksToday]);

  // ── Associate stats ──
  const associateStats = useMemo((): AssociateStats[] => {
    const grouped: Record<string, TaskRow[]> = {};
    completedTasks.forEach((t) => {
      if (!t.assigned_to) return;
      if (!grouped[t.assigned_to]) grouped[t.assigned_to] = [];
      grouped[t.assigned_to].push(t);
    });

    return Object.entries(grouped).map(([userId, userTasks]) => {
      const user = userMap[userId];
      const durations = userTasks
        .map((t) => durationSeconds(t.started_at, t.completed_at))
        .filter((d): d is number => d !== null);

      const todayTasks = userTasks.filter((t) => new Date(t.completed_at!) >= todayStart);
      const weekTasks = userTasks.filter((t) => new Date(t.completed_at!) >= weekStart);
      const monthTasks = userTasks.filter((t) => new Date(t.completed_at!) >= monthStart);

      const pickTasks = userTasks.filter((t) => t.task_type === 'pick');
      const pickSeconds = pickTasks
        .map((t) => durationSeconds(t.started_at, t.completed_at))
        .filter((d): d is number => d !== null)
        .reduce((a, b) => a + b, 0);

      return {
        userId,
        name: user?.full_name || 'Unknown',
        email: user?.email || '',
        tasksToday: todayTasks.length,
        tasksWeek: weekTasks.length,
        tasksMonth: monthTasks.length,
        avgTime: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
        picksPerHour: pickSeconds > 0 ? (pickTasks.length / pickSeconds) * 3600 : 0,
        fastestTask: durations.length > 0 ? Math.min(...durations) : 0,
        slowestTask: durations.length > 0 ? Math.max(...durations) : 0,
        totalTasks: userTasks.length,
      };
    }).sort((a, b) => b.tasksMonth - a.tasksMonth);
  }, [completedTasks, userMap, todayStart, weekStart, monthStart]);

  const overallAvgPicksPerHour = useMemo(() => {
    const vals = associateStats.filter((a) => a.picksPerHour > 0).map((a) => a.picksPerHour);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [associateStats]);

  // ── Task type stats ──
  const taskTypeStats = useMemo((): TaskTypeStats[] => {
    const grouped: Record<string, number[]> = {};
    completedTasks.forEach((t) => {
      const dur = durationSeconds(t.started_at, t.completed_at);
      if (dur === null) return;
      if (!grouped[t.task_type]) grouped[t.task_type] = [];
      grouped[t.task_type].push(dur);
    });

    return Object.entries(grouped)
      .map(([taskType, durations]) => ({
        taskType,
        totalCompleted: durations.length,
        avgTime: durations.reduce((a, b) => a + b, 0) / durations.length,
        medianTime: median(durations),
        fastest: Math.min(...durations),
        slowest: Math.max(...durations),
      }))
      .sort((a, b) => b.totalCompleted - a.totalCompleted);
  }, [completedTasks]);

  // ── Productivity report data ──
  const productivityData = useMemo((): DailyProductivity[] => {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);

    const filtered = completedTasks.filter((t) => {
      const d = new Date(t.completed_at!);
      return d >= from && d <= to;
    });

    const byDate: Record<string, { tasks: number; seconds: number }> = {};
    filtered.forEach((t) => {
      const dateKey = t.completed_at!.split('T')[0];
      const dur = durationSeconds(t.started_at, t.completed_at) || 0;
      if (!byDate[dateKey]) byDate[dateKey] = { tasks: 0, seconds: 0 };
      byDate[dateKey].tasks++;
      byDate[dateKey].seconds += dur;
    });

    return Object.entries(byDate)
      .map(([date, { tasks, seconds }]) => ({
        date,
        totalTasks: tasks,
        totalHours: seconds / 3600,
        tasksPerHour: seconds > 0 ? (tasks / seconds) * 3600 : 0,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [completedTasks, dateFrom, dateTo]);

  const productivitySummary = useMemo(() => {
    const totalHours = productivityData.reduce((s, d) => s + d.totalHours, 0);
    const totalTasks = productivityData.reduce((s, d) => s + d.totalTasks, 0);
    return {
      totalHours,
      totalTasks,
      overallEfficiency: totalHours > 0 ? totalTasks / totalHours : 0,
    };
  }, [productivityData]);

  // ── Recent completed feed ──
  const recentCompleted = useMemo(() => tasksToday.slice(0, 20), [tasksToday]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Labor Tracking"
        description="Monitor warehouse associate performance and task productivity"
      />

      <Tabs defaultValue="dashboard" className="space-y-6">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="by-associate">By Associate</TabsTrigger>
          <TabsTrigger value="by-task-type">By Task Type</TabsTrigger>
          <TabsTrigger value="productivity">Productivity Report</TabsTrigger>
        </TabsList>

        {/* ── Dashboard Tab ── */}
        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Active Associates" value={activeAssociates} icon={Users} description="Users with tasks today" />
            <StatCard title="Tasks Completed Today" value={tasksToday.length} icon={CheckCircle2} description="Finished tasks" />
            <StatCard title="Avg Task Time" value={formatDuration(avgTaskTimeToday)} icon={Timer} description="Today's average" />
            <StatCard title="Picks Per Hour" value={picksPerHourToday > 0 ? picksPerHourToday.toFixed(1) : '--'} icon={Zap} description="Today's pick rate" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Live Feed - Recent Completed Tasks</CardTitle>
              <CardDescription>Most recent completed tasks today</CardDescription>
            </CardHeader>
            <CardContent>
              {recentCompleted.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No completed tasks today yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Associate</TableHead>
                      <TableHead>Task Type</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentCompleted.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{userMap[t.assigned_to!]?.full_name || 'Unknown'}</TableCell>
                        <TableCell><Badge variant="outline">{taskTypeLabel(t.task_type)}</Badge></TableCell>
                        <TableCell className="max-w-[200px] truncate">{t.title}</TableCell>
                        <TableCell>{formatDuration(durationSeconds(t.started_at, t.completed_at))}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{formatDateTime(t.completed_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── By Associate Tab ── */}
        <TabsContent value="by-associate" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Associate Performance</CardTitle>
              <CardDescription>Click a row to see detailed breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              {associateStats.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No associate activity found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Associate</TableHead>
                      <TableHead className="text-right">Today</TableHead>
                      <TableHead className="text-right">This Week</TableHead>
                      <TableHead className="text-right">This Month</TableHead>
                      <TableHead className="text-right">Avg Time</TableHead>
                      <TableHead className="text-right">Picks/Hr</TableHead>
                      <TableHead className="text-right">Fastest</TableHead>
                      <TableHead className="text-right">Slowest</TableHead>
                      <TableHead>Performance</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {associateStats.map((a) => (
                      <>
                        <TableRow
                          key={a.userId}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setExpandedUser(expandedUser === a.userId ? null : a.userId)}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium">{a.name}</p>
                              <p className="text-xs text-muted-foreground">{a.email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{a.tasksToday}</TableCell>
                          <TableCell className="text-right">{a.tasksWeek}</TableCell>
                          <TableCell className="text-right">{a.tasksMonth}</TableCell>
                          <TableCell className="text-right">{formatDuration(a.avgTime)}</TableCell>
                          <TableCell className="text-right">{a.picksPerHour > 0 ? a.picksPerHour.toFixed(1) : '--'}</TableCell>
                          <TableCell className="text-right">{formatDuration(a.fastestTask)}</TableCell>
                          <TableCell className="text-right">{formatDuration(a.slowestTask)}</TableCell>
                          <TableCell>{perfBadge(a.picksPerHour, overallAvgPicksPerHour)}</TableCell>
                          <TableCell>
                            {expandedUser === a.userId ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </TableCell>
                        </TableRow>
                        {expandedUser === a.userId && (
                          <TableRow key={`${a.userId}-detail`}>
                            <TableCell colSpan={10} className="bg-muted/30 p-4">
                              <div className="grid gap-4 md:grid-cols-3">
                                <div>
                                  <p className="text-sm font-medium">Total Tasks (All Time)</p>
                                  <p className="text-2xl font-bold">{a.totalTasks}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium">Avg Completion Time</p>
                                  <p className="text-2xl font-bold">{formatDuration(a.avgTime)}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium">Pick Rate</p>
                                  <p className="text-2xl font-bold">{a.picksPerHour > 0 ? `${a.picksPerHour.toFixed(1)}/hr` : 'N/A'}</p>
                                </div>
                              </div>
                              <div className="mt-3">
                                <p className="text-sm font-medium mb-1">Task Breakdown</p>
                                <div className="flex flex-wrap gap-2">
                                  {(() => {
                                    const userTasks = completedTasks.filter((t) => t.assigned_to === a.userId);
                                    const byType: Record<string, number> = {};
                                    userTasks.forEach((t) => { byType[t.task_type] = (byType[t.task_type] || 0) + 1; });
                                    return Object.entries(byType).map(([type, count]) => (
                                      <Badge key={type} variant="secondary">{taskTypeLabel(type)}: {count}</Badge>
                                    ));
                                  })()}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── By Task Type Tab ── */}
        <TabsContent value="by-task-type" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Task Type Performance</CardTitle>
              <CardDescription>Breakdown by task type across all associates</CardDescription>
            </CardHeader>
            <CardContent>
              {taskTypeStats.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No completed tasks found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task Type</TableHead>
                      <TableHead className="text-right">Total Completed</TableHead>
                      <TableHead className="text-right">Avg Time</TableHead>
                      <TableHead className="text-right">Median Time</TableHead>
                      <TableHead className="text-right">Fastest</TableHead>
                      <TableHead className="text-right">Slowest</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taskTypeStats.map((s) => (
                      <TableRow key={s.taskType}>
                        <TableCell className="font-medium">
                          <Badge variant="outline">{taskTypeLabel(s.taskType)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatNumber(s.totalCompleted)}</TableCell>
                        <TableCell className="text-right">{formatDuration(s.avgTime)}</TableCell>
                        <TableCell className="text-right">{formatDuration(s.medianTime)}</TableCell>
                        <TableCell className="text-right">{formatDuration(s.fastest)}</TableCell>
                        <TableCell className="text-right">{formatDuration(s.slowest)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Productivity Report Tab ── */}
        <TabsContent value="productivity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Productivity Report</CardTitle>
              <CardDescription>Daily productivity metrics for the selected date range</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <Label>From</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label>To</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    exportToCSV(
                      productivityData.map((d) => ({
                        date: d.date,
                        total_tasks: d.totalTasks,
                        total_hours: d.totalHours.toFixed(2),
                        tasks_per_hour: d.tasksPerHour.toFixed(2),
                      })),
                      'productivity_report'
                    )
                  }
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>

              {/* Summary */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Total Labor Hours</p>
                    <p className="text-2xl font-bold">{productivitySummary.totalHours.toFixed(1)}h</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Total Tasks</p>
                    <p className="text-2xl font-bold">{formatNumber(productivitySummary.totalTasks)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Overall Efficiency</p>
                    <p className="text-2xl font-bold">{productivitySummary.overallEfficiency.toFixed(1)} tasks/hr</p>
                  </CardContent>
                </Card>
              </div>

              {productivityData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No data for selected range.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Tasks</TableHead>
                      <TableHead className="text-right">Labor Hours</TableHead>
                      <TableHead className="text-right">Tasks/Hour</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productivityData.map((d) => (
                      <TableRow key={d.date}>
                        <TableCell className="font-medium">{d.date}</TableCell>
                        <TableCell className="text-right">{d.totalTasks}</TableCell>
                        <TableCell className="text-right">{d.totalHours.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{d.tasksPerHour.toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
