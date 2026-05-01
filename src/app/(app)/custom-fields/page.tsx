'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Eye } from 'lucide-react';
import type { CustomFieldDefinition } from '@/types/database';

type FieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea';

const ENTITY_TYPES = [
  { value: 'products', label: 'Products' },
  { value: 'customers', label: 'Customers' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'lots', label: 'Lots' },
  { value: 'orders', label: 'Orders' },
] as const;

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select (Dropdown)' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'textarea', label: 'Textarea' },
];

interface FieldForm {
  field_label: string;
  field_name: string;
  field_type: FieldType;
  options: string;
  is_required: boolean;
  sort_order: number;
}

const emptyForm: FieldForm = {
  field_label: '',
  field_name: '',
  field_type: 'text',
  options: '',
  is_required: false,
  sort_order: 0,
};

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export default function CustomFieldsPage() {
  const { tenantId } = useAuth();
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [activeTab, setActiveTab] = useState('products');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FieldForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    loadFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function loadFields() {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('custom_field_definitions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true });
    if (error) toast.error('Failed to load custom fields');
    else setFields(data || []);
    setLoading(false);
  }

  const filteredFields = useMemo(
    () => fields.filter((f) => f.entity_type === activeTab),
    [fields, activeTab]
  );

  function openAdd() {
    const maxSort = filteredFields.reduce((m, f) => Math.max(m, f.sort_order), 0);
    setEditingId(null);
    setForm({ ...emptyForm, sort_order: maxSort + 1 });
    setDialogOpen(true);
  }

  function openEdit(field: CustomFieldDefinition) {
    setEditingId(field.id);
    setForm({
      field_label: field.field_label,
      field_name: field.field_name,
      field_type: field.field_type as FieldType,
      options: field.options ? field.options.join(', ') : '',
      is_required: field.is_required,
      sort_order: field.sort_order,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!tenantId) return;
    if (!form.field_label.trim()) {
      toast.error('Field label is required');
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const payload = {
      tenant_id: tenantId,
      entity_type: activeTab,
      field_label: form.field_label.trim(),
      field_name: form.field_name || slugify(form.field_label),
      field_type: form.field_type,
      options: form.field_type === 'select' && form.options
        ? form.options.split(',').map((o) => o.trim()).filter(Boolean)
        : null,
      is_required: form.is_required,
      sort_order: form.sort_order,
    };

    if (editingId) {
      const { error } = await supabase
        .from('custom_field_definitions')
        .update(payload)
        .eq('id', editingId);
      if (error) toast.error(error.message);
      else {
        toast.success('Field updated');
        setDialogOpen(false);
        loadFields();
      }
    } else {
      const { error } = await supabase
        .from('custom_field_definitions')
        .insert(payload);
      if (error) toast.error(error.message);
      else {
        toast.success('Field created');
        setDialogOpen(false);
        loadFields();
      }
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this custom field? Any stored values will be orphaned.')) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('custom_field_definitions')
      .delete()
      .eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Field deleted');
      loadFields();
    }
  }

  function renderPreview() {
    if (filteredFields.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          No custom fields defined for this entity. Add one to see a preview.
        </p>
      );
    }
    return (
      <div className="space-y-4">
        {filteredFields.map((field) => (
          <div key={field.id} className="space-y-2">
            <Label>
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {field.field_type === 'text' && <Input placeholder={field.field_label} disabled />}
            {field.field_type === 'number' && <Input type="number" placeholder="0" disabled />}
            {field.field_type === 'date' && <Input type="date" disabled />}
            {field.field_type === 'textarea' && <Textarea placeholder={field.field_label} disabled />}
            {field.field_type === 'checkbox' && (
              <div className="flex items-center gap-2">
                <Checkbox disabled />
                <span className="text-sm text-muted-foreground">{field.field_label}</span>
              </div>
            )}
            {field.field_type === 'select' && (
              <Select disabled>
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${field.field_label}...`} />
                </SelectTrigger>
                <SelectContent>
                  {(field.options || []).map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Custom Fields"
        description="Define custom fields for any entity type"
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" /> Add Field
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {ENTITY_TYPES.map((et) => (
            <TabsTrigger key={et.value} value={et.value}>
              {et.label}
              {fields.filter((f) => f.entity_type === et.value).length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {fields.filter((f) => f.entity_type === et.value).length}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {ENTITY_TYPES.map((et) => (
          <TabsContent key={et.value} value={et.value} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{et.label} Custom Fields</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPreview(!showPreview)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    {showPreview ? 'Hide Preview' : 'Show Preview'}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : filteredFields.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No custom fields defined for {et.label}.</p>
                    <Button variant="outline" className="mt-4" onClick={openAdd}>
                      <Plus className="h-4 w-4 mr-2" /> Add your first field
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>Field Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Required</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFields.map((field) => (
                        <TableRow key={field.id}>
                          <TableCell className="font-medium">{field.field_label}</TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                              {field.field_name}
                            </code>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{field.field_type}</Badge>
                          </TableCell>
                          <TableCell>
                            {field.is_required ? (
                              <Badge>Required</Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">Optional</span>
                            )}
                          </TableCell>
                          <TableCell>{field.sort_order}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEdit(field)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(field.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {showPreview && (
              <Card>
                <CardHeader>
                  <CardTitle>Form Preview</CardTitle>
                </CardHeader>
                <CardContent>{renderPreview()}</CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Custom Field' : 'Add Custom Field'}</DialogTitle>
            <DialogDescription>
              Define a custom field for {ENTITY_TYPES.find((e) => e.value === activeTab)?.label}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Field Label</Label>
              <Input
                value={form.field_label}
                onChange={(e) => {
                  const label = e.target.value;
                  setForm((f) => ({
                    ...f,
                    field_label: label,
                    field_name: editingId ? f.field_name : slugify(label),
                  }));
                }}
                placeholder="e.g. Storage Temperature"
              />
            </div>

            <div className="space-y-2">
              <Label>Field Name (slug)</Label>
              <Input
                value={form.field_name}
                onChange={(e) => setForm((f) => ({ ...f, field_name: e.target.value }))}
                placeholder="auto-generated from label"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Used as the database key. Auto-generated from the label.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Field Type</Label>
              <Select
                value={form.field_type}
                onValueChange={(v) => setForm((f) => ({ ...f, field_type: v as FieldType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((ft) => (
                    <SelectItem key={ft.value} value={ft.value}>
                      {ft.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.field_type === 'select' && (
              <div className="space-y-2">
                <Label>Options (comma-separated)</Label>
                <Input
                  value={form.options}
                  onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))}
                  placeholder="Option 1, Option 2, Option 3"
                />
              </div>
            )}

            <div className="flex items-center gap-3">
              <Checkbox
                id="is_required"
                checked={form.is_required}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, is_required: v === true }))
                }
              />
              <Label htmlFor="is_required">Required field</Label>
            </div>

            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update Field' : 'Create Field'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
