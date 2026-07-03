import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { RequireAuth, RequireFinance } from './components/RouteGuards';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import BuDetail from './pages/BuDetail';
import ImportWizard from './pages/ImportWizard';
import FarmEntry from './pages/FarmEntry';
import PublishManager from './pages/PublishManager';
import PresentMode from './pages/PresentMode';
import TruckingEntry from './pages/TruckingEntry';
import Users from './pages/Users';
import Account from './pages/Account';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            {/* Full-screen present view lives outside the Layout chrome. */}
            <Route path="/present" element={<PresentMode />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/account" element={<Account />} />
              <Route path="/bu/:code" element={<BuDetail />} />
              <Route element={<RequireFinance />}>
                <Route path="/import" element={<ImportWizard />} />
                <Route path="/trucking" element={<TruckingEntry />} />
                <Route path="/farm" element={<FarmEntry />} />
                <Route path="/publish" element={<PublishManager />} />
                <Route path="/users" element={<Users />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
