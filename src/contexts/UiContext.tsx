import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface UiState {
  dark: boolean;
  toggleDark: () => void;
  zoom: number; // percent (e.g. 100)
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

const UiContext = createContext<UiState | null>(null);

const ZOOM_MIN = 60;
const ZOOM_MAX = 160;
const ZOOM_STEP = 5;

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('ui.dark');
    if (saved != null) return saved === '1';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });
  const [zoom, setZoom] = useState(() => clampZoom(Number(localStorage.getItem('ui.zoom')) || 100));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('ui.sidebar') === 'collapsed');

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    localStorage.setItem('ui.dark', dark ? '1' : '0');
  }, [dark]);

  useEffect(() => { localStorage.setItem('ui.zoom', String(zoom)); }, [zoom]);
  useEffect(() => { localStorage.setItem('ui.sidebar', sidebarCollapsed ? 'collapsed' : 'open'); }, [sidebarCollapsed]);

  const value: UiState = {
    dark,
    toggleDark: () => setDark((d) => !d),
    zoom,
    zoomIn: () => setZoom((z) => clampZoom(z + ZOOM_STEP)),
    zoomOut: () => setZoom((z) => clampZoom(z - ZOOM_STEP)),
    resetZoom: () => setZoom(100),
    sidebarCollapsed,
    toggleSidebar: () => setSidebarCollapsed((c) => !c),
  };

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used within UiProvider');
  return ctx;
}
