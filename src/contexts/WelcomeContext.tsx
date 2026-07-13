import { createContext, useContext, useState, type ReactNode } from 'react';

const KEY = 'welcomeSeen';

interface WelcomeCtx {
  seen: boolean;      // has the title screen been dismissed this session
  enter: () => void;  // proceed into the dashboard
  showWelcome: () => void; // go back to the title screen
}

const Ctx = createContext<WelcomeCtx>({ seen: true, enter: () => {}, showWelcome: () => {} });

// Holds whether the Welcome / title screen has been dismissed this session, so
// both the gate (WelcomeGate) and the sidebar logo can drive it.
export function WelcomeProvider({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState(() => sessionStorage.getItem(KEY) === '1');
  const enter = () => { sessionStorage.setItem(KEY, '1'); setSeen(true); };
  const showWelcome = () => { sessionStorage.removeItem(KEY); setSeen(false); };
  return <Ctx.Provider value={{ seen, enter, showWelcome }}>{children}</Ctx.Provider>;
}

export function useWelcome() { return useContext(Ctx); }
