'use client';

import { useState, type FormEvent } from 'react';

const fields = [
  { name: 'name', label: 'Contact name', autoComplete: 'name', required: true },
  { name: 'company', label: 'Business name', autoComplete: 'organization', required: true },
  { name: 'email', label: 'Work email', autoComplete: 'email', required: true },
  { name: 'industry', label: 'Industry', required: false },
  { name: 'warehouseSize', label: 'Approximate warehouse size', required: false },
] as const;

const input = 'w-full rounded-md border border-brand-control-border bg-brand-white px-3 py-2 text-brand-charcoal focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';

export function InquiryForm() {
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
      });
      const data = await response.json();
      if (!response.ok || data.status !== 'accepted') {
        setError(data.error || 'Your inquiry could not be delivered. Please try again or use the support email.');
      } else {
        setAccepted(true);
      }
    } catch {
      setError('Your inquiry could not be delivered. Please try again or use the support email.');
    } finally {
      setBusy(false);
    }
  }

  if (accepted) return <p role="status" className="rounded-lg bg-emerald-50 p-5 text-emerald-950">Your inquiry was received. Thank you for contacting Invexiqs.</p>;

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 sm:p-7">
      {fields.map((field) => (
        <label key={field.name} className="grid gap-1 text-sm font-medium">{field.label}{!field.required && ' (optional)'}
          <input name={field.name} type={field.name === 'email' ? 'email' : 'text'} required={field.required}
            autoComplete={'autoComplete' in field ? field.autoComplete : undefined}
            minLength={field.required ? 2 : undefined} maxLength={field.name === 'email' ? 254 : field.name === 'company' ? 160 : field.required ? 120 : 100}
            className={input} />
        </label>
      ))}
      <label className="grid gap-1 text-sm font-medium">I’m interested in
        <select name="interest" className={input}>
          <option value="pilot">Founding-customer pilot</option>
          <option value="demo">Product walkthrough</option>
          <option value="support">General inquiry</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium sm:col-span-2">What workflow would you like to improve?
        <textarea name="message" required rows={4} minLength={10} maxLength={3000} className={input} />
      </label>
      <input type="text" name="website" hidden tabIndex={-1} autoComplete="off" />
      {error && <p role="alert" className="text-sm text-red-800 sm:col-span-2">{error}</p>}
      <button disabled={busy} className="brand-cta px-5 py-3 disabled:opacity-60 sm:col-span-2">
        {busy ? 'Submitting…' : 'Send inquiry'}
      </button>
    </form>
  );
}
