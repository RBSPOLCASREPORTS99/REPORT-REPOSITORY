import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchBuLabels, type BuLabel } from '../lib/queries';
import { BUSINESS_UNITS } from '../lib/constants';
import { useAuth } from './AuthContext';

interface BuLabelsState {
  labels: Map<string, BuLabel>;
  labelFor: (code: string) => string; // "BU01/02 - BODEGA 1 & 2"
  nameFor: (code: string) => string;
  refresh: () => void;
}

const BuLabelsContext = createContext<BuLabelsState | null>(null);

// Fallback from the static constants so labels render before the fetch lands.
const FALLBACK = new Map(
  BUSINESS_UNITS.map((b) => [b.code, `${b.code} - ${b.name}`.toUpperCase()]),
);

export function BuLabelsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [labels, setLabels] = useState<Map<string, BuLabel>>(new Map());

  const refresh = useCallback(() => {
    fetchBuLabels().then(setLabels).catch(() => {/* keep fallback */});
  }, []);

  useEffect(() => {
    if (session) refresh();
  }, [session, refresh]);

  const labelFor = (code: string) => labels.get(code)?.label ?? FALLBACK.get(code) ?? code.toUpperCase();
  const nameFor = (code: string) => labels.get(code)?.name ?? code;

  return (
    <BuLabelsContext.Provider value={{ labels, labelFor, nameFor, refresh }}>
      {children}
    </BuLabelsContext.Provider>
  );
}

export function useBuLabels() {
  const ctx = useContext(BuLabelsContext);
  if (!ctx) throw new Error('useBuLabels must be used within BuLabelsProvider');
  return ctx;
}
