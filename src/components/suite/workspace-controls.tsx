'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export type Option = { id: string; name: string };

export const selectClass = 'min-h-10 w-full rounded-md border bg-background px-3 text-sm';
export const formGrid = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3';

export function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-5">
    <div className="space-y-1">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
    {children}
  </section>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid content-start gap-1.5 text-sm font-medium">{label}{children}</label>;
}

export function SelectOption({ options, placeholder, ...props }: ComponentProps<'select'> & { options: Option[]; placeholder: string }) {
  return <select className={selectClass} {...props}>
    <option value="">{placeholder}</option>
    {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
  </select>;
}

export function ActionForm({ children, onSubmit, className }: {
  children: ReactNode;
  onSubmit: (data: FormData, form: HTMLFormElement) => void;
  className?: string;
}) {
  return <form className={className} onSubmit={(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget), event.currentTarget);
  }}>{children}</form>;
}

export function Submit({ busy, children, ...props }: ComponentProps<typeof Button> & { busy: boolean }) {
  return <Button {...props} type="submit" disabled={busy || props.disabled}>{busy ? 'Working…' : children}</Button>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function textField(data: FormData, field: string) {
  return String(data.get(field) ?? '').trim();
}

export function optionalNumber(data: FormData, field: string) {
  const value = textField(data, field);
  return value ? Number(value) : null;
}

export async function postJson<T>(url: string, payload: object): Promise<T> {
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'The request could not be completed.');
  return body as T;
}

export function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export function useWorkspaceAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function run(operation: () => Promise<unknown>, success?: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await operation();
      if (success) toast.success(success);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The request could not be completed.');
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }
  return { busy, run };
}
