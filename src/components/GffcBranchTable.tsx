import { useState } from 'react';
import GffcPnlTable from './GffcPnlTable';
import type { GffcBranchResult } from '../lib/gffc/gffcQueries';

// GFFC per-branch P&L: pick a branch and see its current-vs-prior comparison,
// identical in layout to the GFFC Total P&L. Branch tabs lead with Main Branch,
// then Branch 2, then the rest, with a Total-of-all-branches tab last.
export default function GffcBranchTable({ data, priorLabel, currentLabel }: { data: GffcBranchResult; priorLabel: string; currentLabel: string }) {
  const [sel, setSel] = useState<string>(data.branches[0] ?? '');
  if (!data.hasData) return <p className="text-slate-400 dark:text-slate-500">No per-branch data for this period. Import the GFFC workbook with the "P&L PER BRANCH" sheet.</p>;

  const active = data.byBranch[sel] ? sel : data.branches[0];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-700/60">
        {data.branches.map((b) => (
          <button key={b} onClick={() => setSel(b)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${active === b ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
            {b === 'TOTAL' ? 'Total' : b}
          </button>
        ))}
      </div>
      <GffcPnlTable lines={data.byBranch[active]} priorLabel={priorLabel} currentLabel={currentLabel} />
    </div>
  );
}
