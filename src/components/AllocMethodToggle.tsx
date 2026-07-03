import { ALLOC_METHOD_LABELS, type AllocMethod } from '../lib/queries';

const METHODS: AllocMethod[] = ['gross_sales', 'revenue', 'per_txn'];

// Toggle the support-center allocation method. The two alternatives are only
// available when the support workbook has been imported for the current range.
export default function AllocMethodToggle({
  method,
  available,
  onChange,
}: {
  method: AllocMethod;
  available: boolean;
  onChange: (m: AllocMethod) => void;
}) {
  if (!available) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-400">Support allocation</span>
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {METHODS.map((m) => (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              method === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            {ALLOC_METHOD_LABELS[m]}
          </button>
        ))}
      </div>
    </div>
  );
}
