/**
 * Resumen y gráficos: conteos, geometría de los gráficos de torta y reporte HTML autónomo.
 * Los gráficos se dibujan en SVG sin dependencias para que el reporte descargado no
 * necesite conexión ni bibliotecas externas.
 */
import { REASONS, REASON_ORDER, type ReasonKey } from './types';
import type { EvalResult } from './pipeline';

export interface Slice {
  key: string;
  label: string;
  value: number;
  /** Índice de color categórico (1..8), fijo por entidad. */
  slot: number;
}

export interface Summary {
  total: number;
  aceptados: number;
  rechazados: number;
  byReason: { key: ReasonKey; label: string; value: number }[];
  /** Total = Aceptados + Rechazados. */
  consistent: boolean;
}

export function buildSummary(result: EvalResult): Summary {
  const { total, aceptados, rechazados, byReason } = result.counts;
  return {
    total,
    aceptados,
    rechazados,
    byReason: REASON_ORDER.map((k) => ({ key: k, label: REASONS[k], value: byReason[k] })),
    consistent: total === aceptados + rechazados && rechazados === REASON_ORDER.reduce((s, k) => s + byReason[k], 0),
  };
}

export function movementSlices(s: Summary): Slice[] {
  return [
    { key: 'aceptados', label: 'Aceptados', value: s.aceptados, slot: 1 },
    { key: 'rechazados', label: 'Rechazados', value: s.rechazados, slot: 2 },
  ];
}

export function reasonSlices(s: Summary): Slice[] {
  return s.byReason.map((r, i) => ({ key: r.key, label: r.label, value: r.value, slot: i + 1 }));
}

/** Porcentaje con un decimal, formato es-MX. */
export function pct(value: number, total: number): string {
  if (!total) return '0 %';
  return `${(Math.round((value / total) * 1000) / 10).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

export const fmtInt = (n: number) => n.toLocaleString('es-MX');

export interface ArcGeom {
  slice: Slice;
  /** Trazo SVG del sector (o círculo completo si es el único sector con valor). */
  path: string;
  full: boolean;
  /** Punto medio del arco, para posicionar etiquetas. */
  mid: { x: number; y: number };
}

/** Calcula los sectores de una torta centrada en (cx, cy) con radio r. Omite sectores en cero. */
export function pieGeometry(slices: Slice[], cx: number, cy: number, r: number): ArcGeom[] {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!total) return [];
  const nonZero = slices.filter((s) => s.value > 0);
  let angle = -Math.PI / 2;
  return nonZero.map((slice) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    const a0 = angle, a1 = angle + sweep;
    angle = a1;
    const midA = (a0 + a1) / 2;
    const mid = { x: cx + Math.cos(midA) * r * 0.62, y: cy + Math.sin(midA) * r * 0.62 };
    if (nonZero.length === 1) {
      return { slice, full: true, mid: { x: cx, y: cy }, path: `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z` };
    }
    const p0 = { x: cx + Math.cos(a0) * r, y: cy + Math.sin(a0) * r };
    const p1 = { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r };
    const large = sweep > Math.PI ? 1 : 0;
    const f = (n: number) => n.toFixed(3);
    return {
      slice,
      full: false,
      mid,
      path: `M ${f(cx)} ${f(cy)} L ${f(p0.x)} ${f(p0.y)} A ${r} ${r} 0 ${large} 1 ${f(p1.x)} ${f(p1.y)} Z`,
    };
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** SVG autónomo de una torta, con <title> por sector como información al pasar el cursor. */
export function pieSvg(slices: Slice[], title: string): string {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const geo = pieGeometry(slices, 110, 110, 100);
  const body = geo
    .map(
      (g) =>
        `<path d="${g.path}" fill="var(--series-${g.slice.slot})" stroke="var(--surface-1)" stroke-width="2" stroke-linejoin="round"><title>${esc(
          `${g.slice.label}: ${fmtInt(g.slice.value)} (${pct(g.slice.value, total)})`,
        )}</title></path>` +
        (g.slice.value / total >= 0.08 ? `<text x="${g.mid.x.toFixed(1)}" y="${g.mid.y.toFixed(1)}" class="pie-label">${esc(pct(g.slice.value, total))}</text>` : ''),
    )
    .join('');
  return `<svg viewBox="0 0 220 220" role="img" aria-label="${esc(title)}" class="pie">${body}</svg>`;
}

export interface ReportMeta {
  archivo: string;
  hoja: string;
  poliza: string;
  plan: string;
  cliente: string;
  generado: Date;
  version?: string;
}

function legendTable(slices: Slice[], total: number, totalLabel: string): string {
  const rows = slices
    .map(
      (s) =>
        `<tr><td><span class="sw" style="background:var(--series-${s.slot})"></span>${esc(s.label)}</td><td class="num">${fmtInt(s.value)}</td><td class="num">${pct(s.value, total)}</td></tr>`,
    )
    .join('');
  return `<table class="legend"><thead><tr><th>Categoría</th><th class="num">Cantidad</th><th class="num">%</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>${esc(
    totalLabel,
  )}</td><td class="num">${fmtInt(total)}</td><td class="num">${total ? pct(total, total) : '—'}</td></tr></tfoot></table>`;
}

function chartBlock(title: string, slices: Slice[], total: number, totalLabel: string, emptyText: string): string {
  const chart = total ? pieSvg(slices, title) : `<div class="empty">${esc(emptyText)}</div>`;
  return `<section class="card"><h2>${esc(title)}</h2><div class="chart">${chart}${legendTable(slices, total, totalLabel)}</div></section>`;
}

/** Reporte HTML autónomo (sin recursos externos) con indicadores y ambos gráficos. */
export function buildReportHtml(s: Summary, meta: ReportMeta): string {
  const fecha = meta.generado.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
  const kpi = (label: string, v: number, sub?: string) =>
    `<div class="kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${fmtInt(v)}</div>${sub ? `<div class="kpi-sub">${esc(sub)}</div>` : ''}</div>`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Resumen de conversión</title>
<style>
:root{color-scheme:light;--surface-0:#f4f3ef;--surface-1:#fcfcfb;--text-primary:#0b0b0b;--text-secondary:#52514e;--border:#dddcd6;
--series-1:#2a78d6;--series-2:#eb6834;--series-3:#1baf7a;--series-4:#eda100;--series-5:#e87ba4;--series-6:#008300}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--surface-0:#121211;--surface-1:#1a1a19;--text-primary:#f0efec;--text-secondary:#c3c2b7;--border:#34332f;
--series-1:#3987e5;--series-2:#d95926;--series-3:#199e70;--series-4:#c98500;--series-5:#d55181;--series-6:#008300}}
:root[data-theme="dark"]{color-scheme:dark;--surface-0:#121211;--surface-1:#1a1a19;--text-primary:#f0efec;--text-secondary:#c3c2b7;--border:#34332f;
--series-1:#3987e5;--series-2:#d95926;--series-3:#199e70;--series-4:#c98500;--series-5:#d55181;--series-6:#008300}
*{box-sizing:border-box}body{margin:0;background:var(--surface-0);color:var(--text-primary);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 48px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:0 0 12px}
.meta{color:var(--text-secondary);margin:0 0 20px}.meta span{margin-right:16px;display:inline-block}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px}
.kpi,.card{background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:16px}
.kpi-label{color:var(--text-secondary);font-size:13px}.kpi-value{font-size:30px;font-weight:650;font-variant-numeric:tabular-nums}.kpi-sub{color:var(--text-secondary);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:16px}
.chart{display:flex;flex-wrap:wrap;gap:16px;align-items:center}.pie{width:200px;height:200px;flex:none}
.pie-label{fill:#fff;font-size:13px;font-weight:600;text-anchor:middle;dominant-baseline:middle;paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:2px}
.legend{border-collapse:collapse;flex:1;min-width:220px;font-variant-numeric:tabular-nums}.legend th,.legend td{padding:5px 6px;border-bottom:1px solid var(--border);text-align:left}
.legend th{color:var(--text-secondary);font-weight:500;font-size:13px}.legend tfoot td{font-weight:600;border-bottom:0}.num{text-align:right!important}
.sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px;vertical-align:baseline}
.empty{width:200px;height:200px;border:2px dashed var(--border);border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--text-secondary);padding:24px;font-size:13px}
.check{margin-top:16px;color:var(--text-secondary);font-size:13px}
</style>
</head>
<body>
<main>
<h1>Resumen de conversión de altas</h1>
<p class="meta"><span>Archivo: <strong>${esc(meta.archivo)}</strong></span><span>Hoja: ${esc(meta.hoja)}</span><span>Póliza: ${esc(meta.poliza)}</span><span>Plan: ${esc(
    meta.plan,
  )}</span><span>Cliente: ${esc(meta.cliente)}</span><span>Generado: ${esc(fecha)}</span>${meta.version ? `<span>Versión ${esc(meta.version)}</span>` : ''}</p>
<div class="kpis">${kpi('Total de movimientos', s.total)}${kpi('Aceptados', s.aceptados, pct(s.aceptados, s.total) + ' del total')}${kpi(
    'Rechazados',
    s.rechazados,
    pct(s.rechazados, s.total) + ' del total',
  )}</div>
<div class="grid">
${chartBlock('Resumen de movimientos', movementSlices(s), s.total, 'Total de movimientos', 'Sin movimientos')}
${chartBlock('Rechazados por razón', reasonSlices(s), s.rechazados, 'Total de rechazados', 'Sin rechazos')}
</div>
<p class="check">Comprobación: Total (${fmtInt(s.total)}) = Aceptados (${fmtInt(s.aceptados)}) + Rechazados (${fmtInt(s.rechazados)}) — ${
    s.consistent ? 'correcta' : 'NO coincide'
  }. Cada pareja de alta y baja compensada cuenta como dos movimientos rechazados.</p>
</main>
</body>
</html>
`;
}
