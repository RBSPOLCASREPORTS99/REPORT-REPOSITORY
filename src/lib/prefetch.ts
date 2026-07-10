// Route chunk prefetchers, mirroring the lazy routes in App.tsx. Called on nav
// hover/focus so the target page's JS is already downloaded by the time it's
// clicked — without eagerly prefetching pages a user never opens. The dynamic
// import() specifiers resolve to the same modules App lazy-loads, so Vite shares
// one chunk (the hover just warms it).
const loaders: Record<string, () => Promise<unknown>> = {
  '/import': () => import('../pages/ImportWizard'),
  '/trucking': () => import('../pages/TruckingEntry'),
  '/truck-pnl': () => import('../pages/TruckPnl'),
  '/gffc': () => import('../pages/GffcDetail'),
  '/farm': () => import('../pages/FarmEntry'),
  '/publish': () => import('../pages/PublishManager'),
  '/users': () => import('../pages/Users'),
  '/bu-names': () => import('../pages/BuNames'),
  '/item-units': () => import('../pages/ItemUnits'),
  '/account': () => import('../pages/Account'),
  '/present': () => import('../pages/PresentMode'),
};

const started = new Set<string>();

export function prefetchRoute(path: string): void {
  const load = loaders[path];
  if (!load || started.has(path)) return;
  started.add(path);
  load().catch(() => started.delete(path)); // allow a retry if it failed
}
