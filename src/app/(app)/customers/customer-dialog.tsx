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
import type { Customer } from '@/types/database';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact_name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  ship_to_address: z.string().optional(),
  license_type: z.string().optional(),
  license_number: z.string().optional(),
  license_expiration: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  onSaved: () => void;
}

export function CustomerDialog({ open, onOpenChange, customer, onSaved }: Props) {
  const { tenantId } = useAuth();
  const [saving, setSaving] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', contact_name: '', email: '', phone: '', ship_to_address: '', license_type: '', license_number: '', license_expiration: '', notes: '' },
  });

  useEffect(() => {
    if (customer) {
      form.reset({
        name: customer.name,
        contact_name: customer.contact_name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        ship_to_address: customer.ship_to_address || '',
        license_type: customer.license_type || '',
        license_number: customer.license_number || '',
        license_expiration: customer.license_expiration || '',
        notes: customer.notes || '',
      });
    } else {
      form.reset();
    }
  }, [customer, open]);

  async function onSubmit(data: FormData) {
    if (!tenantId) return;
    setSaving(true);
    const supabase = createClient();
    const fields = {
      name: data.name,
      contact_name: data.contact_name || null,
      email: data.email || null,
      phone: data.phone || null,
      ship_to_address: data.ship_to_address || null,
      license_type: data.license_type || null,
      license_number: data.license_number || null,
      license_expiration: data.license_expiration || null,
      notes: data.notes || null,
    };

    if (customer) {
      const { error } = await supabase.from('customers').update(fields).eq('id', customer.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Customer updated');
    } else {
      const { error } = await supabase.from('customers').insert({ ...fields, tenant_id: tenantId! });
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Customer created');
    }
    setSaving(false);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer ? 'Edit Customer' : 'New Customer'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2"><Label>Name *</Label><Input {...form.register('name')} />{form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Contact Name</Label><Input {...form.register('contact_name')} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" {...form.register('email')} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Phone</Label><Input {...form.register('phone')} /></div>
            <div className="space-y-2"><Label>License Type</Label><Input {...form.register('license_type')} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>License Number</Label><Input {...form.register('license_number')} /></div>
            <div className="space-y-2"><Label>License Expiration</Label><Input type="date" {...form.register('license_expiration')} /></div>
          </div>
          <div className="space-y-2"><Label>Ship-To Address</Label><Textarea {...form.register('ship_to_address')} rows={2} /></div>
          <div className="space-y-2"><Label>Notes</Label><Textarea {...form.register('notes')} rows={2} /></div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : customer ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
