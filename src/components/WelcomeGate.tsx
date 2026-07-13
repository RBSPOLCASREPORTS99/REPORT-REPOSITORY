import { Outlet } from 'react-router-dom';
import Welcome from '../pages/Welcome';
import { useWelcome } from '../contexts/WelcomeContext';

// Shows the Welcome title screen (until Proceed) then reveals the dashboard.
// State lives in WelcomeContext so the sidebar logo can reopen it.
export default function WelcomeGate() {
  const { seen, enter } = useWelcome();
  if (!seen) return <Welcome onProceed={enter} />;
  return <Outlet />;
}
