'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { helpTopics } from '@/lib/public-help';

export function PublicHelp() {
  const [topic, setTopic] = useState<keyof typeof helpTopics>();
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'unknown' | 'error'>('idle');
  const answer = topic ? helpTopics[topic] : undefined;
  return (
    <Dialog>
      <DialogTrigger className="brand-cta px-4 py-2">Ask Invexiqs</DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-auto">
        <DialogTitle>Ask Invexiqs</DialogTitle>
        <p className="text-sm text-muted-foreground">Ask about plans, setup, or warehouse features. Avoid passwords and customer or inventory data.</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(helpTopics).map(([key, item]) => <button type="button" key={key}
            disabled={status === 'busy'} onClick={() => { setTopic(key as keyof typeof helpTopics); setStatus('idle'); }}
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted">{item.label}</button>)}
        </div>
        <div aria-live="polite" className="space-y-2 text-sm">
          {answer && <><p>{answer.answer}</p><Link className="font-semibold underline" href={answer.href}>{answer.link}</Link></>}
          {status === 'unknown' && <p>Try a help topic above or <Link className="underline" href="/support">contact support</Link>.</p>}
          {status === 'error' && <p>AI help is unavailable right now. You can still choose a topic above.</p>}
        </div>
        <form className="flex flex-wrap gap-2" onSubmit={async event => {
          event.preventDefault();
          if (!question.trim() || status === 'busy') return;
          setStatus('busy'); setTopic(undefined);
          try {
            const response = await fetch('/api/public-help', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
            if (!response.ok) throw Error();
            const { topic: match } = await response.json();
            if (Object.hasOwn(helpTopics, match)) { setTopic(match); setStatus('idle'); }
            else setStatus('unknown');
          } catch { setStatus('error'); }
        }}>
          <input aria-label="Your question" maxLength={300} value={question} onChange={event => setQuestion(event.target.value)}
            className="min-w-0 flex-1 rounded-md border bg-background p-2" placeholder="How do I import my inventory?" />
          <button className="brand-cta px-3 py-2" disabled={status === 'busy' || !question.trim()}>{status === 'busy' ? 'Checking…' : 'Ask'}</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
