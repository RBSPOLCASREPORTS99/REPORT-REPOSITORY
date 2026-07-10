import { useCallback, useState } from 'react';

// Grouped column highlight: hovering any cell tints that whole column (a period's
// data, Gross Sales → Net Income %). Uses a large inset box-shadow so the tint
// layers OVER a cell's existing background (bold subtotal rows, sticky column)
// without fighting it. Spread `tableProps` on the <table>; add `cellCls(i)` to
// each cell's className where i is its column index.
export function useColHighlight() {
  const [col, setCol] = useState<number | null>(null);
  const onMouseOver = useCallback((e: React.MouseEvent) => {
    const cell = (e.target as HTMLElement).closest('td,th') as HTMLTableCellElement | null;
    setCol(cell ? cell.cellIndex : null);
  }, []);
  const onMouseLeave = useCallback(() => setCol(null), []);
  const cellCls = useCallback(
    (i: number) => (col === i ? 'shadow-[inset_0_0_0_100vmax_rgba(129,140,248,0.18)]' : ''),
    [col],
  );
  return { tableProps: { onMouseOver, onMouseLeave }, cellCls };
}
