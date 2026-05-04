'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { User, Shield, KeyRound, Clock } from 'lucide-react';

export default function ProfilePage() {
  const { user, role, tenantName } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const initials = user?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'WM';

  const handleSaveName = async () => {
    if (!user || !fullName.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('users')
      .update({ full_name: fullName.trim() })
      .eq('id', user.id);

    setSaving(false);
    if (error) toast.error('Failed to update name');
    else toast.success('Name updated. Refresh to see changes.');
  };

  const handleChangePassword = async () => {
    if (!newPw || newPw.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setChangingPw(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setChangingPw(false);
    if (error) toast.error(error.message);
    else {
      toast.success('Password changed');
      setNewPw('');
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Profile" />

      {/* User info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-xl">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-bold">{user?.full_name}</h2>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="capitalize">
                  <Shield className="h-3 w-3 mr-1" />
                  {role}
                </Badge>
                {tenantName && (
                  <Badge variant="secondary">{tenantName}</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit name */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" /> Display Name
          </CardTitle>
          <CardDescription>This is how your name appears across the system and in audit trails.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <Button onClick={handleSaveName} disabled={saving || fullName === user?.full_name}>
            {saving ? 'Saving...' : 'Save Name'}
          </Button>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> Change Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>New Password</Label>
            <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Min 8 characters" />
          </div>
          <Button onClick={handleChangePassword} disabled={changingPw || !newPw}>
            {changingPw ? 'Changing...' : 'Change Password'}
          </Button>
        </CardContent>
      </Card>

      {/* Account info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" /> Account Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">User ID</p>
              <p className="font-mono text-xs">{user?.id?.slice(0, 12)}...</p>
            </div>
            <div>
              <p className="text-muted-foreground">Member Since</p>
              <p>{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Role</p>
              <p className="capitalize">{role}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <p>{user?.is_active ? 'Active' : 'Inactive'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
