import Logo from '../components/Logo';

// Title / welcome screen shown once per session before the dashboard.
// Executive-serif treatment (Option 1), themed to the system: the app's own
// slate background with the corporate brand green as the accent.
export default function Welcome({ onProceed }: { onProceed: () => void }) {
  const rise = (delay: number) => ({ animationDelay: `${delay}ms` } as const);
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-slate-50 px-6 text-center dark:bg-slate-900">
      {/* Faint brand-green wash for depth — keeps the system background. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(92,145,33,0.10),transparent_70%)] dark:bg-[radial-gradient(60%_50%_at_50%_0%,rgba(142,203,63,0.10),transparent_70%)]" />

      <div className="relative flex flex-col items-center">
        <Logo className="animate-rise h-16 w-16 shadow-sm ring-1 ring-brand-200/70 dark:ring-brand-900/60" />

        <p style={rise(60)} className="animate-rise mt-7 font-serif text-lg italic text-brand-600 dark:text-brand-400">
          Welcome to
        </p>

        <h1 style={rise(120)} className="animate-rise mt-1 text-balance font-serif text-4xl font-bold leading-[1.04] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-slate-100">
          POLCAS
          <span className="block bg-gradient-to-r from-brand-700 to-brand-500 bg-clip-text text-transparent dark:from-brand-300 dark:to-brand-500">
            Business Review
          </span>
        </h1>

        <span style={rise(180)} className="animate-rise mt-6 h-0.5 w-16 rounded-full bg-brand-500" />

        <p style={rise(240)} className="animate-rise mt-6 max-w-md font-serif text-base text-slate-500 sm:text-lg dark:text-slate-400">
          Your financial performance, reviewed period by period.
        </p>

        <button
          autoFocus
          onClick={onProceed}
          style={rise(320)}
          className="animate-rise mt-9 rounded-lg bg-brand-600 px-8 py-3 text-sm font-semibold tracking-wide text-white shadow-md shadow-brand-600/20 transition hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 active:translate-y-0 dark:focus-visible:ring-offset-slate-900"
        >
          Enter dashboard
        </button>
      </div>

      <p className="absolute bottom-6 left-0 right-0 font-serif text-[11px] uppercase tracking-[0.32em] text-slate-400 dark:text-slate-600">
        POLCAS Agri Trade Corp.
      </p>
    </div>
  );
}
