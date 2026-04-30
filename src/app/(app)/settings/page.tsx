'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { toast } from 'sonner';
import { Users, Building2 } from 'lucide-react';
import type { User, UserRole } from '@/types/database';

export default function SettingsPage() {
  const { user: currentUser, tenantId, role } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    const supabase = createClient();

    supabase.from('tenants').select('*').eq('id', tenantId).single()
      .then(({ data }) => { setCompanyName(data?.name || ''); });

    supabase.from('users').select('*').eq('tenant_id', tenantId).order('full_name')
      .then(({ data }) => setUsers(data || []));
  }, [tenantId]);

  async function saveCompanyName() {
    if (!tenantId) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('tenants').update({ name: companyName }).eq('id', tenantId);
    if (error) toast.error(error.message);
    else toast.success('Company name updated');
    setSaving(false);
  }

  async function updateUserRole(userId: string, newRole: UserRole) {
    const supabase = createClient();
    const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId);
    if (error) toast.error(error.message);
    else {
      toast.success('Role updated');
      setUsers(users.map((u) => u.id === userId ? { ...u, role: newRole } : u));
    }
  }

  const isAdmin = role === 'admin';

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your organization" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Company Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end max-w-md">
            <div className="flex-1 space-y-2">
              <Label>Company Name</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            {isAdmin && (
              <Button onClick={saveCompanyName} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Team Members
            </span>
          </CardTitle>
          <CardDescription>
            Manage users and their roles. Admins can manage all users; managers can view team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.full_name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    {isAdmin && u.id !== currentUser?.id ? (
                      <Select value={u.role} onValueChange={(v) => updateUserRole(u.id, v as UserRole)}>
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{u.role}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.is_active ? 'default' : 'secondary'}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
