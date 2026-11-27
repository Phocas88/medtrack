'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, MessageSquare, Sparkles } from 'lucide-react';

const examples = [
  { topic: 'Order blockers', question: 'Why is SO-1046 on hold?', answer: 'The order needs 24 steel bottles. Bin C-03-01 has 12 available, leaving a shortage of 12.', evidence: 'Order SO-1046 · Bin C-03-01 · 12 of 24 units available', action: 'Check inbound receipts before releasing the order.' },
  { topic: 'Stock lookup', question: 'Where are the 750 ml steel bottles?', answer: 'The sample warehouse has 12 units in bin C-03-01.', evidence: 'Steel bottle / 750ml · North warehouse · Bin C-03-01', action: 'Confirm the bin and available quantity before assigning a pick.' },
  { topic: 'Shift priorities', question: 'What should the team handle first?', answer: 'Review SO-1046 first. It’s on hold because there aren’t enough 750 ml bottles to ship the full order.', evidence: 'Order SO-1046 · On hold · 12 units short', action: 'Check incoming stock and follow up if the shortage will delay shipment.' },
] as const;

export function WarehouseAiPreview() {
  const [index, setIndex] = useState(0);
  const example = examples[index];
  return <article className="min-w-0 overflow-hidden rounded-2xl border border-brand-border-gray bg-brand-white text-brand-deep-plum shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-border-gray px-4 py-3">
      <p className="flex items-center gap-2 font-semibold"><Sparkles aria-hidden size={17} /> Invexiqs Warehouse AI</p>
      <span className="text-xs text-brand-muted-gray">Sample answers</span>
    </div>
    <div className="space-y-4 p-4 sm:p-5">
      <div role="group" aria-label="AI examples" className="flex flex-wrap gap-2">
        {examples.map((entry, i) => <button key={entry.topic} type="button" aria-pressed={i === index} onClick={() => setIndex(i)}
          className="min-h-10 rounded-lg border border-brand-border-gray px-3 py-1 text-sm font-medium aria-pressed:border-brand-royal-plum aria-pressed:bg-brand-royal-plum aria-pressed:text-white">{entry.topic}</button>)}
      </div>
      <div aria-live="polite" className="space-y-3">
        <p className="flex items-start gap-2 rounded-lg bg-brand-lavender p-3 text-sm font-semibold"><MessageSquare size={16} className="mt-0.5 shrink-0" aria-hidden />{example.question}</p>
        <p className="text-sm leading-relaxed">{example.answer}</p>
        <p className="break-words border-l-2 border-brand-lilac pl-3 text-xs text-brand-muted-gray"><strong>Sample records</strong><br />{example.evidence}</p>
        <p className="text-sm"><strong>Suggested next step</strong><br />{example.action}</p>
      </div>
      <Link href="/demo/workspace" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-royal-plum underline">Try the sample warehouse <ArrowRight aria-hidden size={16} /></Link>
    </div>
  </article>;
}
