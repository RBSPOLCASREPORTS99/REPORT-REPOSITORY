import { Component, type ReactNode } from 'react';

// Errors that mean a lazily-loaded JS chunk couldn't be fetched — almost always
// because a new version was deployed and this tab still references the old build.
const CHUNK_RE = /Loading chunk|dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError/i;

// App-wide safety net: without this, any render error (or a stale chunk failing
// to import after a deploy) unmounts the whole tree and leaves a blank page —
// which reads as an all-black screen in dark mode. Instead we auto-reload once
// for stale chunks, and show a readable fallback with a Reload button otherwise.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Stale chunk → reload to fetch the fresh build, but no more than once per
    // 10s so a genuinely persistent error can't loop.
    if (CHUNK_RE.test(error.message)) {
      const last = Number(sessionStorage.getItem('chunk-reload-at') || 0);
      if (Date.now() - last > 10000) {
        sessionStorage.setItem('chunk-reload-at', String(Date.now()));
        window.location.reload();
      }
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = CHUNK_RE.test(error.message);
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center dark:bg-slate-900">
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {chunk ? 'A new version is available' : 'Something went wrong'}
        </p>
        <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
          {chunk ? 'Reload to load the latest update.' : 'The page hit an unexpected error — reloading usually fixes it.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
        >
          ↻ Reload
        </button>
      </div>
    );
  }
}
