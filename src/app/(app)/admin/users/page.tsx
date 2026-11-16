'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  UserPlus,
  MoreHorizontal,
  Shield,
  ShieldCheck,
  Users,
  Smartphone,
  Monitor,
  Search,
  UserCog,
  Ban,
  CheckCircle2,
  KeyRound,
} from 'lucide-react';
import type { User, UserRole } from '@/types/database';

type AccessLevel = 'full' | 'scanner_only';

interface UserWithMeta extends User {
  access_level?: AccessLevel;
  last_active?: string | null;
}

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  manager: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  staff: 'bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-300',
};

const ROLE_ICONS: Record<UserRole, typeof Shield> = {
  admin: ShieldCheck,
  manager: Shield,
  staff: Users,
};

export default function AdminUsersPage() {
  const { user: currentUser, tenantId, role } = useAuth();

  const [users, setUsers] = useState<UserWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Create user dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    full_name: '',
    role: 'staff' as UserRole,
    access_level: 'full' as AccessLevel,
  });

  // Edit user dialog
  const [editUser, setEditUser] = useState<UserWithMeta | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const isAdmin = role === 'admin';

  const loadUsers = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    if (error) {
      toast.error('Failed to load users');
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Filter users
  const filtered = users.filter((u) => {
    if (search && !u.full_name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (statusFilter === 'active' && !u.is_active) return false;
    if (statusFilter === 'inactive' && u.is_active) return false;
    return true;
  });

  // Create user via service API
  const handleCreateUser = async () => {
    if (!tenantId || !newUser.email || !newUser.full_name) {
      toast.error('Name and email are required');
      return;
    }
    setCreating(true);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          email: newUser.email,
          full_name: newUser.full_name,
          role: newUser.role,
          access_level: newUser.access_level,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || 'Failed to create user');
      } else {
        if (result.login_note) {
          toast.success(result.login_note, { duration: 10000 });
        } else {
          toast.success(`User ${newUser.full_name} invitation requested by email.`);
        }
        if (result.temp_password) {
          toast.info(`Temp password: ${result.temp_password}`, { duration: 15000 });
        }
        setCreateOpen(false);
        setNewUser({ email: '', full_name: '', role: 'staff', access_level: 'full' });
        loadUsers();
      }
    } catch {
      toast.error('Network error');
    }

    setCreating(false);
  };

  // Update user role/status
  const handleUpdateUser = async () => {
    if (!editUser) return;
    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('users')
      .update({
        role: editUser.role,
        is_active: editUser.is_active,
      })
      .eq('id', editUser.id);

    if (error) {
      toast.error('Failed to update user');
    } else {
      toast.success(`Updated ${editUser.full_name}`);

      // Log to audit trail
      await supabase.from('stock_movements').insert({
        tenant_id: tenantId!,
        product_id: null,
        user_id: currentUser!.id,
        quantity: 0,
        movement_type: 'adjust',
        reason: `User management: updated ${editUser.full_name} (${editUser.email}) — role: ${editUser.role}, active: ${editUser.is_active}`,
        reference_number: `USER-${editUser.id.slice(0, 8)}`,
        metadata: {
          action: 'user_update',
          target_user_id: editUser.id,
          target_user_email: editUser.email,
          changes: { role: editUser.role, is_active: editUser.is_active },
        },
      }).then(() => {});

      setEditOpen(false);
      setEditUser(null);
      loadUsers();
    }
    setSaving(false);
  };

  // Toggle active
  const handleToggleActive = async (user: UserWithMeta) => {
    if (user.id === currentUser?.id) {
      toast.error("You can't deactivate yourself");
      return;
    }

    const supabase = createClient();
    const newStatus = !user.is_active;

    const { error } = await supabase
      .from('users')
      .update({ is_active: newStatus })
      .eq('id', user.id);

    if (error) {
      toast.error('Failed to update');
    } else {
      toast.success(`${user.full_name} ${newStatus ? 'activated' : 'deactivated'}`);
      loadUsers();
    }
  };

  // Reset password
  const handleResetPassword = async (user: UserWithMeta) => {
    try {
      const response = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });

      if (response.ok) {
        toast.success(`Password reset email sent to ${user.email}`);
      } else {
        toast.error('Failed to send reset email');
      }
    } catch {
      toast.error('Network error');
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-center space-y-3">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-lg font-semibold">Admin access required</p>
          <p className="text-sm text-muted-foreground">Only administrators can manage users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Create accounts, assign roles, and manage access for your team"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" /> New User
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold">{users.length}</p>
            <p className="text-xs text-muted-foreground">Total Users</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-green-600">{users.filter(u => u.is_active).length}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-blue-600">{users.filter(u => u.role === 'admin').length}</p>
            <p className="text-xs text-muted-foreground">Admins</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-slate-600">{users.filter(u => u.role === 'staff').length}</p>
            <p className="text-xs text-muted-foreground">Staff</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading users...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const RoleIcon = ROLE_ICONS[u.role];
                  return (
                    <TableRow key={u.id} className={!u.is_active ? 'opacity-50' : ''}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{u.full_name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${ROLE_COLORS[u.role]} gap-1`}>
                          <RoleIcon className="h-3 w-3" />
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Monitor className="h-3.5 w-3.5" />
                          <Smartphone className="h-3.5 w-3.5" />
                          <span className="text-xs">Full</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.is_active ? 'default' : 'secondary'}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditUser({ ...u }); setEditOpen(true); }}>
                              <UserCog className="mr-2 h-4 w-4" /> Edit User
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleResetPassword(u)}>
                              <KeyRound className="mr-2 h-4 w-4" /> Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {u.id !== currentUser?.id && (
                              <DropdownMenuItem onClick={() => handleToggleActive(u)}>
                                {u.is_active ? (
                                  <><Ban className="mr-2 h-4 w-4" /> Deactivate</>
                                ) : (
                                  <><CheckCircle2 className="mr-2 h-4 w-4" /> Activate</>
                                )}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              A temporary password will be generated. Email is optional for floor associates.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input
                value={newUser.full_name}
                onChange={(e) => setNewUser(p => ({ ...p, full_name: e.target.value }))}
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-2">
              <Label>Email <span className="text-muted-foreground text-xs">(optional for staff)</span></Label>
              <Input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser(p => ({ ...p, email: e.target.value }))}
                placeholder="john@company.com or leave blank"
              />
              {!newUser.email && newUser.full_name && (
                <p className="text-xs text-muted-foreground">
                  No email? A username login will be auto-generated from the name.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser(p => ({ ...p, role: v as UserRole }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — Full system access</SelectItem>
                  <SelectItem value="manager">Manager — Operations + reports</SelectItem>
                  <SelectItem value="staff">Staff — Assigned floor tasks, no costs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Access Level</Label>
              <Select value={newUser.access_level} onValueChange={(v) => setNewUser(p => ({ ...p, access_level: v as AccessLevel }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" /> Full Access (Desktop + Scanner)
                    </div>
                  </SelectItem>
                  <SelectItem value="scanner_only">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4" /> Scanner Only (Handheld)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Scanner-only users access <code>/scan</code> — no desktop dashboard.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateUser} disabled={creating || !newUser.full_name}>
              {creating ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>{editUser?.full_name} ({editUser?.email})</DialogDescription>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editUser.role} onValueChange={(v) => setEditUser(p => p ? { ...p, role: v as UserRole } : null)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Active</Label>
                  <p className="text-xs text-muted-foreground">Inactive users cannot log in</p>
                </div>
                <Switch
                  checked={editUser.is_active}
                  onCheckedChange={(v) => setEditUser(p => p ? { ...p, is_active: v } : null)}
                  disabled={editUser.id === currentUser?.id}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateUser} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
