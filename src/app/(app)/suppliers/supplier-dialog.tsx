'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import type { Supplier } from '@/types/database';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact_name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  account_number: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
  onSaved: () => void;
}

export function SupplierDialog({ open, onOpenChange, supplier, onSaved }: Props) {
  const { tenantId } = useAuth();
  const [saving, setSaving] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', contact_name: '', email: '', phone: '', address: '', account_number: '', notes: '' },
  });

  useEffect(() => {
    if (supplier) {
      form.reset({
        name: supplier.name,
        contact_name: supplier.contact_name || '',
        email: supplier.email || '',
        phone: supplier.phone || '',
        address: supplier.address || '',
        account_number: supplier.account_number || '',
        notes: supplier.notes || '',
      });
    } else {
      form.reset();
    }
  }, [supplier, open]);

  async function onSubmit(data: FormData) {
    if (!tenantId) return;
    setSaving(true);
    const supabase = createClient();
    const fields = {
      name: data.name,
      contact_name: data.contact_name || null,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      account_number: data.account_number || null,
      notes: data.notes || null,
    };

    if (supplier) {
      const { error } = await supabase.from('suppliers').update(fields).eq('id', supplier.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Supplier updated');
    } else {
      const { error } = await supabase.from('suppliers').insert({ ...fields, tenant_id: tenantId! });
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Supplier created');
    }
    setSaving(false);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{supplier ? 'Edit Supplier' : 'New Supplier'}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2"><Label>Name *</Label><Input {...form.register('name')} />{form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Contact Name</Label><Input {...form.register('contact_name')} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" {...form.register('email')} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Phone</Label><Input {...form.register('phone')} /></div>
            <div className="space-y-2"><Label>Account #</Label><Input {...form.register('account_number')} /></div>
          </div>
          <div className="space-y-2"><Label>Address</Label><Textarea {...form.register('address')} rows={2} /></div>
          <div className="space-y-2"><Label>Notes</Label><Textarea {...form.register('notes')} rows={2} /></div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : supplier ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
