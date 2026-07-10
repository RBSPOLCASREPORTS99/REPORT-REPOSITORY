import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

// Session-only combined BU boxes: dragging one BU box onto another merges them.
// Held in memory only (cleared on reload) — a personal, temporary view. Combined
// codes are encoded in the URL as "BU01+BU05" for the combined detail page.
export const COMBINE_SEP = '+';

interface CombineContextValue {
  groups: string[][]; // each group = 2+ member BU codes
  groupOf: (code: string) => string[] | undefined;
  combine: (a: string, b: string) => void;
  uncombine: (code: string) => void; // dissolves the whole group containing `code`
}

const CombineContext = createContext<CombineContextValue | null>(null);

export function CombineProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<string[][]>([]);

  const groupOf = useCallback(
    (code: string) => groups.find((g) => g.includes(code)),
    [groups],
  );

  // Merge the groups (or singletons) that contain a and b into one.
  const combine = useCallback((a: string, b: string) => {
    if (a === b) return;
    setGroups((prev) => {
      const rest = prev.filter((g) => !g.includes(a) && !g.includes(b));
      const ga = prev.find((g) => g.includes(a)) ?? [a];
      const gb = prev.find((g) => g.includes(b)) ?? [b];
      const merged = Array.from(new Set([...ga, ...gb]));
      return [...rest, merged];
    });
  }, []);

  const uncombine = useCallback((code: string) => {
    setGroups((prev) => prev.filter((g) => !g.includes(code)));
  }, []);

  const value = useMemo(() => ({ groups, groupOf, combine, uncombine }), [groups, groupOf, combine, uncombine]);
  return <CombineContext.Provider value={value}>{children}</CombineContext.Provider>;
}

export function useCombine() {
  const ctx = useContext(CombineContext);
  if (!ctx) throw new Error('useCombine must be used within CombineProvider');
  return ctx;
}
