"use client";

import { useState } from "react";

const roles = [
  { name: "Cashier Register", task: "Add packing tape to a sample sale.", action: "Add sample item", result: "Packing tape added. Sample subtotal: $4.50." },
  { name: "Customer Portal", task: "Check the status of sample order SO-1042.", action: "View sample order", result: "SO-1042 is packed and awaiting carrier pickup." },
  { name: "Floor / Warehouse Associate", task: "Pick six cartons of shipping labels from bin B-04.", action: "Confirm sample pick", result: "Six cartons picked from bin B-04." },
  { name: "Management Desktop", task: "Review a sample count of packing tape in bin A-01.", action: "Record sample count", result: "Count recorded. Bin A-01 has 24 rolls of packing tape." },
] as const;

export default function RoleWalkthroughs() {
  const [selected, setSelected] = useState<(typeof roles)[number] | null>(null);
  const [done, setDone] = useState(false);

  return (
    <section className="space-y-3 border-t pt-6" aria-label="Role walkthroughs">
      <h2 className="font-semibold">Try a warehouse role</h2>
      <div aria-label="Demo roles" className="grid gap-2 sm:grid-cols-2">
        {roles.map(role => (
          <button key={role.name} type="button" aria-pressed={selected === role}
            className="rounded border bg-card px-3 py-2 text-left text-sm hover:border-primary"
            onClick={() => { setSelected(role); setDone(false); }}>
            {role.name}
          </button>
        ))}
      </div>
      {selected && (
        <article className="space-y-2 rounded border bg-card p-3 text-sm">
          <h3 className="font-semibold">{selected.name} sample walkthrough</h3>
          <p>{selected.task}</p>
          <button type="button" className="rounded border px-3 py-2" onClick={() => setDone(!done)}>
            {done ? "Reset sample task" : selected.action}
          </button>
          <p role="status">{done && selected.result}</p>
        </article>
      )}
    </section>
  );
}
