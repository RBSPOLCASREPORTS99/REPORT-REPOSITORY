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
  units: 'thousands' | 'full';
  toggleUnits: () => void;
  // Shared month + comparison selection (kept in sync across Home / BU detail /
  // Present, and persisted). Stored as plain strings to avoid a type cycle.
  compSetMonthId: string;
  setCompSetMonthId: (id: string) => void;
  compType: string; // 'ytd' | 'qtr' | 'month'
  setCompType: (c: string) => void;
  compQtrBasis: string; // 'yoy' | 'qoq'
  setCompQtrBasis: (b: string) => void;
  compMonthBasis: string; // 'yoy' | 'mom'
  setCompMonthBasis: (b: string) => void;
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
  const [units, setUnits] = useState<'thousands' | 'full'>(() => (localStorage.getItem('ui.units') === 'full' ? 'full' : 'thousands'));
  const [compSetMonthId, setCompSetMonthId] = useState<string>(() => localStorage.getItem('ui.setMonth') || '');
  const [compType, setCompType] = useState<string>(() => localStorage.getItem('ui.comp') || 'ytd');
  const [compQtrBasis, setCompQtrBasis] = useState<string>(() => localStorage.getItem('ui.qtrBasis') || 'yoy');
  const [compMonthBasis, setCompMonthBasis] = useState<string>(() => localStorage.getItem('ui.monthBasis') || 'yoy');

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    localStorage.setItem('ui.dark', dark ? '1' : '0');
  }, [dark]);

  useEffect(() => { localStorage.setItem('ui.zoom', String(zoom)); }, [zoom]);
  useEffect(() => { localStorage.setItem('ui.sidebar', sidebarCollapsed ? 'collapsed' : 'open'); }, [sidebarCollapsed]);
  useEffect(() => { localStorage.setItem('ui.units', units); }, [units]);
  useEffect(() => { localStorage.setItem('ui.setMonth', compSetMonthId); }, [compSetMonthId]);
  useEffect(() => { localStorage.setItem('ui.comp', compType); }, [compType]);
  useEffect(() => { localStorage.setItem('ui.qtrBasis', compQtrBasis); }, [compQtrBasis]);
  useEffect(() => { localStorage.setItem('ui.monthBasis', compMonthBasis); }, [compMonthBasis]);

  const value: UiState = {
    dark,
    toggleDark: () => setDark((d) => !d),
    zoom,
    zoomIn: () => setZoom((z) => clampZoom(z + ZOOM_STEP)),
    zoomOut: () => setZoom((z) => clampZoom(z - ZOOM_STEP)),
    resetZoom: () => setZoom(100),
    sidebarCollapsed,
    toggleSidebar: () => setSidebarCollapsed((c) => !c),
    units,
    toggleUnits: () => setUnits((u) => (u === 'thousands' ? 'full' : 'thousands')),
    compSetMonthId,
    setCompSetMonthId,
    compType,
    setCompType,
    compQtrBasis,
    setCompQtrBasis,
    compMonthBasis,
    setCompMonthBasis,
  };

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used within UiProvider');
  return ctx;
}
