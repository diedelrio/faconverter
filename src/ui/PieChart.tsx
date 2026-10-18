import { useState } from 'react';
import { fmtInt, pct, pieGeometry, type Slice } from '../core/summary';

interface Props {
  title: string;
  slices: Slice[];
  totalLabel: string;
  emptyText: string;
}

/** Gráfico de torta con leyenda-tabla (cantidad y %), etiqueta directa y tooltip al pasar el cursor. */
export function PieChart({ title, slices, totalLabel, emptyText }: Props) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const geo = pieGeometry(slices, 110, 110, 100);
  const hovered = hover ? slices.find((s) => s.key === hover.key) : undefined;

  return (
    <section className="card chart-card">
      <h3>{title}</h3>
      <div className="chart">
        {total === 0 ? (
          <div className="pie-empty" role="img" aria-label={`${title}: ${emptyText}`}>
            {emptyText}
          </div>
        ) : (
          <div className="pie-wrap" onMouseLeave={() => setHover(null)}>
            <svg viewBox="0 0 220 220" className="pie" role="img" aria-label={`${title}. ${slices.map((s) => `${s.label}: ${s.value}`).join(', ')}`}>
              {geo.map((g) => (
                <path
                  key={g.slice.key}
                  d={g.path}
                  fill={`var(--series-${g.slice.slot})`}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  className={hover && hover.key !== g.slice.key ? 'dim' : undefined}
                  onMouseMove={(e) => {
                    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    setHover({ key: g.slice.key, x: e.clientX - box.left, y: e.clientY - box.top });
                  }}
                />
              ))}
              {geo
                .filter((g) => g.slice.value / total >= 0.08)
                .map((g) => (
                  <text key={g.slice.key} x={g.mid.x} y={g.mid.y} className="pie-label">
                    {pct(g.slice.value, total)}
                  </text>
                ))}
            </svg>
            {hover && hovered && hover.x >= 0 && (
              <div className="tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
                <span className="sw" style={{ background: `var(--series-${hovered.slot})` }} />
                <strong>{hovered.label}</strong>
                <div>
                  {fmtInt(hovered.value)} · {pct(hovered.value, total)}
                </div>
              </div>
            )}
          </div>
        )}
        <table className="legend">
          <thead>
            <tr>
              <th>Categoría</th>
              <th className="num">Cantidad</th>
              <th className="num">%</th>
            </tr>
          </thead>
          <tbody>
            {slices.map((s) => (
              <tr key={s.key} onMouseEnter={() => total && setHover({ key: s.key, x: -999, y: -999 })} onMouseLeave={() => setHover(null)}>
                <td>
                  <span className="sw" style={{ background: `var(--series-${s.slot})` }} />
                  {s.label}
                </td>
                <td className="num">{fmtInt(s.value)}</td>
                <td className="num">{pct(s.value, total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>{totalLabel}</td>
              <td className="num">{fmtInt(total)}</td>
              <td className="num">{total ? pct(total, total) : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
