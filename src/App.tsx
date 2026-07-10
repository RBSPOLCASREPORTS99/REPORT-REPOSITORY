import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { UiProvider } from './contexts/UiContext';
import { BuLabelsProvider } from './contexts/BuLabelsContext';
import { CombineProvider } from './contexts/CombineContext';
import { RequireAuth, RequireFinance } from './components/RouteGuards';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import BuDetail from './pages/BuDetail';

// Non-core routes are code-split so the initial load (Login / Home / BU detail)
// stays small. In particular the import flow pulls in the heavy xlsx library,
// which BU Heads / GM never need — it now loads only when Finance opens Import.
const ImportWizard = lazy(() => import('./pages/ImportWizard'));
const FarmEntry = lazy(() => import('./pages/FarmEntry'));
const PublishManager = lazy(() => import('./pages/PublishManager'));
const PresentMode = lazy(() => import('./pages/PresentMode'));
const TruckingEntry = lazy(() => import('./pages/TruckingEntry'));
const TruckPnl = lazy(() => import('./pages/TruckPnl'));
const GffcDetail = lazy(() => import('./pages/GffcDetail'));
const CompanyPnl = lazy(() => import('./pages/CompanyPnl'));
const Users = lazy(() => import('./pages/Users'));
const Account = lazy(() => import('./pages/Account'));
const BuNames = lazy(() => import('./pages/BuNames'));
const ItemUnits = lazy(() => import('./pages/ItemUnits'));

function Loading() {
  return <div className="flex min-h-svh items-center justify-center text-slate-400">Loading…</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <UiProvider>
      <AuthProvider>
      <BuLabelsProvider>
      <CombineProvider>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              {/* Full-screen present view lives outside the Layout chrome. */}
              <Route path="/present" element={<PresentMode />} />
              <Route element={<Layout />}>
                <Route path="/" element={<Home />} />
                <Route path="/account" element={<Account />} />
                <Route path="/bu/:code" element={<BuDetail />} />
                <Route path="/gffc" element={<GffcDetail />} />
                <Route path="/company" element={<CompanyPnl />} />
                <Route element={<RequireFinance />}>
                  <Route path="/import" element={<ImportWizard />} />
                  <Route path="/trucking" element={<TruckingEntry />} />
                  <Route path="/truck-pnl" element={<TruckPnl />} />
                  <Route path="/farm" element={<FarmEntry />} />
                  <Route path="/publish" element={<PublishManager />} />
                  <Route path="/users" element={<Users />} />
                  <Route path="/bu-names" element={<BuNames />} />
                  <Route path="/item-units" element={<ItemUnits />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </CombineProvider>
      </BuLabelsProvider>
      </AuthProvider>
      </UiProvider>
    </BrowserRouter>
  );
}
