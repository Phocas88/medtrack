'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export type SampleTask = 'scan' | 'receive' | 'ship';

const examples = {
  scan: { title: 'Try the scanner', description: 'Look up the example bin by entering C-03-01.', action: 'Look up bin' },
  receive: { title: 'Receive sample stock', description: 'Receive 12 steel bottles and see the new balance in bin C-03-01.', action: 'Record sample receipt' },
  ship: { title: 'Review a sample shipment', description: 'Check the selected order’s quantities and shipping readiness.', action: 'Check shipping readiness' },
};

export function SampleTaskDialog({ task, order, stock, onReceive, onClose }: {
  task: SampleTask;
  order: { id: string; units: number; stage: string } | null;
  stock: number;
  onReceive: () => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState('');
  const example = examples[task];

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[85dvh] overflow-auto">
      <DialogTitle>{example.title}</DialogTitle>
      <DialogDescription>{example.description} Changes stay in this demo session.</DialogDescription>
      <form className="space-y-4" onSubmit={event => {
        event.preventDefault();
        if (task === 'scan') {
          setResult(code.trim().toUpperCase() === 'C-03-01' ? `C-03-01 · Steel bottle / 750ml · ${stock} units on hand` : 'Try the sample bin code C-03-01.');
        } else if (task === 'receive') {
          onReceive();
          setResult(`Receipt recorded in the demo. Bin C-03-01 now has ${stock + 12} units.`);
        } else if (!order) {
          setResult('Select an order from the order desk first.');
        } else if (order.stage === 'Shipped') {
          setResult(`SO-${order.id} has already shipped.`);
        } else if (order.id === '1046' && stock < order.units) {
          setResult(`SO-${order.id} needs ${order.units} units. ${stock} are available, so ${order.units - stock} more are needed.`);
        } else {
          setResult(`SO-${order.id} has enough sample stock. Verify and pack ${order.units} units before shipping.`);
        }
      }}>
        {task === 'scan' && <label className="block text-sm">Bin code
          <input value={code} onChange={event => setCode(event.target.value)} required maxLength={30} className="mt-1 block w-full rounded border bg-background p-2" />
        </label>}
        <button className="brand-cta px-4 py-2" disabled={task === 'receive' && !!result}>{example.action}</button>
        {result && <p role="status" className="rounded-lg bg-brand-lavender p-3 text-sm text-brand-deep-plum">{result}</p>}
      </form>
    </DialogContent>
  </Dialog>;
}
