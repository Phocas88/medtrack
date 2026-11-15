'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { CalendarDays, Truck, PackageOpen, Plus, Percent } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

interface DockAppointment {
  id: string;
  date: string;
  time_slot: string;
  dock_door: string;
  type: 'inbound' | 'outbound';
  carrier_name: string;
  reference: string;
  notes: string;
  status: 'scheduled' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
}

const DOCK_DOORS = ['Door 1', 'Door 2', 'Door 3', 'Door 4', 'Door 5', 'Door 6'];
const TIME_SLOTS: string[] = [];
for (let h = 6; h <= 19; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}
TIME_SLOTS.push('20:00');

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getWeekDates(): { date: string; label: string; dayName: string }[] {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map((name, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      date: d.toISOString().split('T')[0],
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dayName: name,
    };
  });
}

const statusColors: Record<string, string> = {
  scheduled: 'bg-gray-100 text-gray-700 border-gray-300',
  arrived: 'bg-blue-100 text-blue-700 border-blue-300',
  in_progress: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  completed: 'bg-green-100 text-green-700 border-green-300',
  cancelled: 'bg-red-100 text-red-700 border-red-300',
};

export default function DockSchedulingPage() {
  const { tenantId } = useAuth();
  const [appointments, setAppointments] = useState<DockAppointment[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterDate, setFilterDate] = useState('');
  const [activeTab, setActiveTab] = useState('schedule');

  // New appointment form
  const [formDate, setFormDate] = useState(getToday());
  const [formTime, setFormTime] = useState('08:00');
  const [formDoor, setFormDoor] = useState('Door 1');
  const [formType, setFormType] = useState<'inbound' | 'outbound'>('inbound');
  const [formCarrier, setFormCarrier] = useState('');
  const [formReference, setFormReference] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    createClient().from('dock_appointments').select('*').eq('tenant_id', tenantId).order('date').then(({ data, error }) => {
      if (error) toast.error('Could not load the shared dock schedule');
      else setAppointments(data || []);
    });
  }, [tenantId]);

  const resetForm = () => {
    setFormDate(getToday());
    setFormTime('08:00');
    setFormDoor('Door 1');
    setFormType('inbound');
    setFormCarrier('');
    setFormReference('');
    setFormNotes('');
  };

  const createAppointment = async () => {
    if (!tenantId) return;
    if (!formCarrier.trim()) {
      toast.error('Carrier name is required');
      return;
    }

    const appt: DockAppointment = {
      id: crypto.randomUUID(),
      date: formDate,
      time_slot: formTime,
      dock_door: formDoor,
      type: formType,
      carrier_name: formCarrier.trim(),
      reference: formReference.trim(),
      notes: formNotes.trim(),
      status: 'scheduled',
      created_at: new Date().toISOString(),
    };

    // Check for conflict
    const conflict = appointments.find(a =>
      a.date === appt.date && a.time_slot === appt.time_slot &&
      a.dock_door === appt.dock_door && a.status !== 'cancelled'
    );
    if (conflict) {
      toast.error(`${appt.dock_door} is already booked at ${appt.time_slot} on ${appt.date}`);
      return;
    }

    const { error } = await createClient().from('dock_appointments').insert({ ...appt, tenant_id: tenantId });
    if (error) { toast.error(error.code === '23505' ? 'That dock slot has just been booked' : 'Could not save appointment'); return; }
    const updated = [...appointments, appt];
    setAppointments(updated);
    setDialogOpen(false);
    resetForm();
    toast.success('Appointment scheduled');
  };

  const updateStatus = async (id: string, newStatus: DockAppointment['status']) => {
    if (!tenantId) return;
    const { error } = await createClient().from('dock_appointments').update({ status: newStatus }).eq('id', id).eq('tenant_id', tenantId);
    if (error) { toast.error('Could not update appointment'); return; }
    const updated = appointments.map(a =>
      a.id === id ? { ...a, status: newStatus } : a
    );
    setAppointments(updated);
    toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
  };

  const cancelAppointment = (id: string) => {
    updateStatus(id, 'cancelled');
  };

  const today = getToday();
  const todayAppts = useMemo(() =>
    appointments
      .filter(a => a.date === today && a.status !== 'cancelled')
      .sort((a, b) => a.time_slot.localeCompare(b.time_slot)),
    [appointments, today]
  );

  const filteredAppointments = useMemo(() => {
    let filtered = [...appointments].sort((a, b) => {
      const dateComp = a.date.localeCompare(b.date);
      if (dateComp !== 0) return dateComp;
      return a.time_slot.localeCompare(b.time_slot);
    });
    if (filterDate) {
      filtered = filtered.filter(a => a.date === filterDate);
    }
    return filtered;
  }, [appointments, filterDate]);

  const weekDates = useMemo(() => getWeekDates(), []);

  // Stats
  const inboundToday = todayAppts.filter(a => a.type === 'inbound').length;
  const outboundToday = todayAppts.filter(a => a.type === 'outbound').length;
  const totalSlotsPerDoor = TIME_SLOTS.length; // slots per door per day
  const totalSlots = DOCK_DOORS.length * totalSlotsPerDoor;
  const utilization = totalSlots > 0 ? Math.round((todayAppts.length / totalSlots) * 100) : 0;

  return (
    <div className="flex-1 space-y-6 p-6">
      <PageHeader
        title="Dock Scheduling"
        description="Manage dock door appointments for inbound and outbound shipments"
        actions={
          <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            New Appointment
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Today's Appointments" value={todayAppts.length} icon={CalendarDays} />
        <StatCard title="Inbound Today" value={inboundToday} icon={PackageOpen} />
        <StatCard title="Outbound Today" value={outboundToday} icon={Truck} />
        <StatCard title="Utilization %" value={`${utilization}%`} icon={Percent} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="today">Today ({todayAppts.length})</TabsTrigger>
          <TabsTrigger value="calendar">Calendar View</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>All Appointments</CardTitle>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="w-[180px]"
                  />
                  {filterDate && (
                    <Button variant="ghost" size="sm" onClick={() => setFilterDate('')}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Door</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Carrier</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-48">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAppointments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No appointments {filterDate ? 'for this date' : 'scheduled'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAppointments.map(appt => (
                        <TableRow key={appt.id}>
                          <TableCell>{formatDate(appt.date)}</TableCell>
                          <TableCell className="font-mono">{appt.time_slot}</TableCell>
                          <TableCell className="font-medium">{appt.dock_door}</TableCell>
                          <TableCell>
                            <Badge variant={appt.type === 'inbound' ? 'default' : 'secondary'}>
                              {appt.type}
                            </Badge>
                          </TableCell>
                          <TableCell>{appt.carrier_name}</TableCell>
                          <TableCell className="font-mono text-sm">{appt.reference || '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusColors[appt.status]}>
                              {appt.status.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {appt.status === 'scheduled' && (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => updateStatus(appt.id, 'arrived')}>
                                    Check In
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => cancelAppointment(appt.id)}>
                                    Cancel
                                  </Button>
                                </>
                              )}
                              {appt.status === 'arrived' && (
                                <Button size="sm" variant="outline" onClick={() => updateStatus(appt.id, 'in_progress')}>
                                  Start
                                </Button>
                              )}
                              {appt.status === 'in_progress' && (
                                <Button size="sm" onClick={() => updateStatus(appt.id, 'completed')}>
                                  Complete
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="today" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {todayAppts.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No appointments scheduled for today
                </div>
              ) : (
                <div className="space-y-3">
                  {todayAppts.map(appt => (
                    <div
                      key={appt.id}
                      className={`flex items-center gap-4 rounded-lg border p-4 ${
                        appt.status === 'scheduled' ? 'bg-gray-50 dark:bg-gray-900/30' :
                        appt.status === 'arrived' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200' :
                        appt.status === 'in_progress' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200' :
                        'bg-green-50 dark:bg-green-900/20 border-green-200'
                      }`}
                    >
                      <div className="text-center min-w-[60px]">
                        <div className="text-lg font-bold font-mono">{appt.time_slot}</div>
                      </div>
                      <div className="h-12 w-px bg-border" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{appt.dock_door}</span>
                          <Badge variant={appt.type === 'inbound' ? 'default' : 'secondary'} className="text-xs">
                            {appt.type}
                          </Badge>
                          <Badge variant="outline" className={statusColors[appt.status]}>
                            {appt.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {appt.carrier_name} {appt.reference ? `| ${appt.reference}` : ''}
                          {appt.notes ? ` | ${appt.notes}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {appt.status === 'scheduled' && (
                          <Button size="sm" onClick={() => updateStatus(appt.id, 'arrived')}>
                            Check In
                          </Button>
                        )}
                        {appt.status === 'arrived' && (
                          <Button size="sm" onClick={() => updateStatus(appt.id, 'in_progress')}>
                            Start
                          </Button>
                        )}
                        {appt.status === 'in_progress' && (
                          <Button size="sm" onClick={() => updateStatus(appt.id, 'completed')}>
                            Complete
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Week View</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Door</TableHead>
                      {weekDates.map(d => (
                        <TableHead key={d.date} className="text-center min-w-[100px]">
                          <div className={`${d.date === today ? 'text-primary font-bold' : ''}`}>
                            {d.dayName}
                          </div>
                          <div className={`text-xs ${d.date === today ? 'text-primary' : 'text-muted-foreground'}`}>
                            {d.label}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DOCK_DOORS.map(door => (
                      <TableRow key={door}>
                        <TableCell className="font-medium">{door}</TableCell>
                        {weekDates.map(d => {
                          const count = appointments.filter(a =>
                            a.date === d.date && a.dock_door === door && a.status !== 'cancelled'
                          ).length;
                          const inCount = appointments.filter(a =>
                            a.date === d.date && a.dock_door === door && a.type === 'inbound' && a.status !== 'cancelled'
                          ).length;
                          const outCount = appointments.filter(a =>
                            a.date === d.date && a.dock_door === door && a.type === 'outbound' && a.status !== 'cancelled'
                          ).length;
                          return (
                            <TableCell
                              key={d.date}
                              className={`text-center cursor-pointer hover:bg-accent transition-colors ${d.date === today ? 'bg-primary/5' : ''}`}
                              onClick={() => {
                                setFilterDate(d.date);
                                setActiveTab('schedule');
                              }}
                            >
                              {count > 0 ? (
                                <div className="space-y-1">
                                  <div className="text-lg font-bold">{count}</div>
                                  <div className="flex justify-center gap-1">
                                    {inCount > 0 && (
                                      <Badge variant="default" className="text-xs px-1.5 py-0">{inCount} in</Badge>
                                    )}
                                    {outCount > 0 && (
                                      <Badge variant="secondary" className="text-xs px-1.5 py-0">{outCount} out</Badge>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Click a cell to filter the Schedule tab by that day.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Appointment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Dock Appointment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Time Slot</Label>
                <Select value={formTime} onValueChange={setFormTime}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map(slot => (
                      <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Dock Door</Label>
                <Select value={formDoor} onValueChange={setFormDoor}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCK_DOORS.map(door => (
                      <SelectItem key={door} value={door}>{door}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as 'inbound' | 'outbound')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inbound">Inbound</SelectItem>
                    <SelectItem value="outbound">Outbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Carrier Name *</Label>
              <Input
                value={formCarrier}
                onChange={(e) => setFormCarrier(e.target.value)}
                placeholder="e.g., FedEx, UPS, ABC Logistics"
              />
            </div>
            <div className="space-y-2">
              <Label>Reference (PO# or SO#)</Label>
              <Input
                value={formReference}
                onChange={(e) => setFormReference(e.target.value)}
                placeholder="e.g., PO-0001 or SO-0042"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={createAppointment}>Schedule Appointment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
