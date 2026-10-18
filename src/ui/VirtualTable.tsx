import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  width: number;
  render: (row: T) => ReactNode;
  title?: (row: T) => string;
  align?: 'right';
}

interface Props<T> {
  rows: readonly T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowHeight?: number;
  height?: number | string;
  onRowClick?: (row: T) => void;
  rowClass?: (row: T) => string | undefined;
  selectedKey?: string | null;
  empty?: ReactNode;
}

/** Tabla con virtualización de filas: solo se dibujan las filas visibles (decenas de miles sin bloquear). */
export function VirtualTable<T>({
  rows,
  columns,
  rowKey,
  rowHeight = 34,
  height = '60vh',
  onRowClick,
  rowClass,
  selectedKey,
  empty,
}: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Al cambiar el filtro, volver arriba si el desplazamiento queda fuera de rango.
  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollTop > rows.length * rowHeight) {
      el.scrollTop = 0;
      setScrollTop(0);
    }
  }, [rows.length, rowHeight]);

  const onScroll = useCallback(() => setScrollTop(ref.current?.scrollTop ?? 0), []);

  const template = columns.map((c) => `${c.width}px`).join(' ');
  const totalW = columns.reduce((s, c) => s + c.width, 0);
  const overscan = 8;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewH) / rowHeight) + overscan);
  const visible = rows.slice(start, end);

  return (
    <div className="vt" ref={ref} onScroll={onScroll} style={{ height }} role="table" aria-rowcount={rows.length + 1}>
      <div className="vt-head" style={{ gridTemplateColumns: template, minWidth: totalW }} role="row">
        {columns.map((c) => (
          <div key={c.key} className={c.align === 'right' ? 'vt-cell num' : 'vt-cell'} role="columnheader">
            {c.header}
          </div>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="vt-empty">{empty ?? 'Sin registros'}</div>
      ) : (
        <div style={{ height: rows.length * rowHeight, position: 'relative', minWidth: totalW }}>
          {visible.map((row, i) => {
            const k = rowKey(row);
            const idx = start + i;
            return (
              <div
                key={k}
                role="row"
                aria-rowindex={idx + 2}
                className={['vt-row', idx % 2 ? 'odd' : '', onRowClick ? 'clickable' : '', selectedKey === k ? 'selected' : '', rowClass?.(row) ?? '']
                  .filter(Boolean)
                  .join(' ')}
                style={{ top: idx * rowHeight, height: rowHeight, gridTemplateColumns: template }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRowClick(row)) : undefined}
              >
                {columns.map((c) => (
                  <div key={c.key} className={c.align === 'right' ? 'vt-cell num' : 'vt-cell'} title={c.title?.(row)} role="cell">
                    {c.render(row)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
