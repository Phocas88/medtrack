'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

export default function LaunchWaitlist() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'joined' | 'error'>('idle');

  async function joinWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get('email')).trim();
    setStatus('sending');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Launch waitlist',
          email,
          interest: 'June 2027 launch',
          message: 'Please send me Stokora launch and pricing updates.',
        }),
      });
      if (!response.ok) throw new Error('Signup failed');
      form.reset();
      setStatus('joined');
    } catch {
      setStatus('error');
    }
  }

  return (
    <form onSubmit={joinWaitlist}>
      <label htmlFor="email">Work email</label>
      <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@company.com" />
      <button className="button" type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Joining…' : 'Join the waitlist'}
      </button>
      <p className="note">By signing up, you agree to receive Stokora launch and pricing updates at this email address.</p>
      <p className="note" role="status">
        {status === 'joined' && 'You’re on the waitlist. Thanks for signing up.'}
        {status === 'error' && 'We couldn’t save your signup. Please try again shortly.'}
      </p>
    </form>
  );
}
