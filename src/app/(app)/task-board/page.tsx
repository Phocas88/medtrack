'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Plus,
  ClipboardList,
  UserCheck,
  Users,
} from 'lucide-react';
import { formatRelativeDate } from '@/lib/format';
import type { User as DBUser, ScanTaskType } from '@/types/database';

interface TaskRow {
  id: string;
  task_type: ScanTaskType;
  title: string;
  instructions: string | null;
  status: string;
  priority: number;
  assigned_to: string | null;
  assigned_user?: { full_name: string } | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
}

const TASK_TYPES: { value: ScanTaskType; label: string }[] = [
  { value: 'pick', label: 'Pick' },
  { value: 'putaway', label: 'Put Away' },
  { value: 'replenish', label: 'Replenish' },
  { value: 'cycle_count', label: 'Cycle Count' },
  { value: 'verify_stock', label: 'Verify Stock' },
  { value: 'verify_bin', label: 'Verify Bin' },
  { value: 'bin_to_bin', label: 'Bin Transfer' },
];

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  assigned: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function TaskBoardPage() {
  const { user, tenantId, role } = useAuth();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [workers, setWorkers] = useState<DBUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    task_type: '' as ScanTaskType | '',
    title: '',
    instructions: '',
    assigned_to: '',
    priority: '5',
  });

  const isManager = role === 'admin' || role === 'manager';

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    let query = supabase
      .from('scan_tasks')
      .select('*, assigned_user:users!scan_tasks_assigned_to_fkey(full_name)')
      .eq('tenant_id', tenantId)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (statusFilter === 'active') {
      query = query.in('status', ['pending', 'assigned', 'in_progress']);
    } else if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const [taskRes, workerRes] = await Promise.all([
      query,
      supabase.from('users').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('full_name'),
    ]);

    setTasks((taskRes.data as TaskRow[]) || []);
    setWorkers(workerRes.data || []);
    setLoading(false);
  }, [tenantId, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async () => {
    if (!tenantId || !user || !form.task_type || !form.title) {
      toast.error('Task type and title required');
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase.from('scan_tasks').insert({
      tenant_id: tenantId,
      task_type: form.task_type,
      title: form.title,
      instructions: form.instructions || null,
      assigned_to: form.assigned_to || null,
      assigned_by: user.id,
      assigned_at: form.assigned_to ? new Date().toISOString() : null,
      status: form.assigned_to ? 'assigned' : 'pending',
      priority: parseInt(form.priority, 10) || 5,
    });

    setSaving(false);
    if (error) toast.error('Failed to create task');
    else {
      toast.success('Task created');
      setCreateOpen(false);
      setForm({ task_type: '', title: '', instructions: '', assigned_to: '', priority: '5' });
      loadData();
    }
  };

  const handleReassign = async (taskId: string, userId: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('scan_tasks')
      .update({
        assigned_to: userId || null,
        status: userId ? 'assigned' : 'pending',
        assigned_at: userId ? new Date().toISOString() : null,
      })
      .eq('id', taskId);

    if (error) toast.error('Failed to reassign');
    else { toast.success('Task reassigned'); loadData(); }
  };

  const handleCancel = async (taskId: string) => {
    const supabase = createClient();
    await supabase.from('scan_tasks').update({ status: 'cancelled' }).eq('id', taskId);
    toast.success('Task cancelled');
    loadData();
  };

  // Stats
  const pending = tasks.filter((t) => t.status === 'pending').length;
  const assigned = tasks.filter((t) => t.status === 'assigned').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const completed = tasks.filter((t) => t.status === 'completed').length;

  // Worker load
  const workerLoad = new Map<string, number>();
  tasks.filter((t) => t.assigned_to && ['assigned', 'in_progress'].includes(t.status)).forEach((t) => {
    workerLoad.set(t.assigned_to!, (workerLoad.get(t.assigned_to!) || 0) + 1);
  });

  if (!isManager) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-center space-y-3">
          <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-lg font-semibold">Manager access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Task Board"
        description="Assign and manage warehouse tasks for your team"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Assign Task
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-gray-600">{pending}</p><p className="text-xs text-muted-foreground">Unassigned</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-blue-600">{assigned}</p><p className="text-xs text-muted-foreground">Assigned</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-amber-600">{inProgress}</p><p className="text-xs text-muted-foreground">In Progress</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-green-600">{completed}</p><p className="text-xs text-muted-foreground">Completed</p></CardContent></Card>
      </div>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks"><ClipboardList className="h-4 w-4 mr-1" /> Tasks</TabsTrigger>
          <TabsTrigger value="workers"><Users className="h-4 w-4 mr-1" /> Team Load</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-4">
          {/* Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">Loading...</div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No tasks found</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{task.title}</p>
                          {task.instructions && <p className="text-xs text-muted-foreground line-clamp-1">{task.instructions}</p>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {task.task_type.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isManager && ['pending', 'assigned'].includes(task.status) ? (
                            <Select
                              value={task.assigned_to || ''}
                              onValueChange={(v) => handleReassign(task.id, v)}
                            >
                              <SelectTrigger className="w-36 h-8"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                              <SelectContent>
                                {workers.map((w) => (
                                  <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm">{task.assigned_user?.full_name || '—'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={task.priority >= 8 ? 'destructive' : 'outline'} className="text-xs">
                            {task.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[task.status] || ''}>{task.status.replace('_', ' ')}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatRelativeDate(task.created_at)}</TableCell>
                        <TableCell>
                          {['pending', 'assigned'].includes(task.status) && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => handleCancel(task.id)}>
                              Cancel
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workers">
          <Card>
            <CardHeader><CardTitle className="text-base">Team Workload</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {workers.map((w) => {
                  const load = workerLoad.get(w.id) || 0;
                  return (
                    <div key={w.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{w.full_name}</span>
                        <Badge variant="outline" className="text-[10px] capitalize">{w.role}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${load > 5 ? 'bg-red-500' : load > 2 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${Math.min(load * 15, 100)}%` }} />
                        </div>
                        <span className="text-sm font-bold w-6 text-right">{load}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Task Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Task</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Task Type *</Label>
              <Select value={form.task_type} onValueChange={(v) => setForm((p) => ({ ...p, task_type: v as ScanTaskType }))}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g., Replenish Aisle 4 — Paper Towels" />
            </div>
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea value={form.instructions} onChange={(e) => setForm((p) => ({ ...p, instructions: e.target.value }))} placeholder="Detailed instructions for the associate" rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={form.assigned_to} onValueChange={(v) => setForm((p) => ({ ...p, assigned_to: v }))}>
                <SelectTrigger><SelectValue placeholder="Select worker" /></SelectTrigger>
                <SelectContent>
                  {workers.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.full_name} ({workerLoad.get(w.id) || 0} tasks)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority (1-10)</Label>
              <Input type="number" min={1} max={10} value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Assign Task'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
