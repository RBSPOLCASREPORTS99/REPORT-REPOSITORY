import { ALLOC_METHOD_LABELS, type AllocMethod } from '../lib/queries';

const METHODS: AllocMethod[] = ['gross_sales', 'simulated'];

// Support-center allocation method as a dropdown. "Simulated" allocates each
// BU's Finance/HR/Management bill from the Support units' configured method +
// manual counts; it's offered whenever the support units are configured.
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
    <label className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Support allocation</span>
      <select
        value={method}
        onChange={(e) => onChange(e.target.value as AllocMethod)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      >
        {METHODS.map((m) => (
          <option key={m} value={m}>{ALLOC_METHOD_LABELS[m]}</option>
        ))}
      </select>
    </label>
  );
}
