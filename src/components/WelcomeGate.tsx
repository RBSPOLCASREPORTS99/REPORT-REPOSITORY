import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Welcome from '../pages/Welcome';

const KEY = 'welcomeSeen';

// Shows the Welcome title screen once per browser session (until Proceed is
// clicked), then reveals the dashboard. Sits between auth and the app Layout.
export default function WelcomeGate() {
  const [seen, setSeen] = useState(() => sessionStorage.getItem(KEY) === '1');
  if (!seen) {
    return <Welcome onProceed={() => { sessionStorage.setItem(KEY, '1'); setSeen(true); }} />;
  }
  return <Outlet />;
}
