import { useDeferredValue, useMemo, useState } from 'react';
import type { Converter } from './useConverter';
import type { EvalRow, IssueCode, ReasonKey, RowStatus, WarningCode } from '../core/types';
import { REASONS, REASON_ORDER } from '../core/types';
import { VirtualTable, type Column } from './VirtualTable';
import { RowEditor } from './RowEditor';
import { ISSUE_LABELS, PARENTESCO_FULL, STATUS_LABELS, WARNING_LABELS } from './labels';
import { cx, fmt } from './util';
import { stripAccents } from '../core/normalize';
import { fullNameOf } from '../core/names';

export type Filter = {
  status: RowStatus | 'todos';
  reason: ReasonKey | '';
  issue: IssueCode | '';
  warning: WarningCode | '';
  q: string;
};

export const EMPTY_FILTER: Filter = { status: 'todos', reason: '', issue: '', warning: '', q: '' };

const norm = (s: string) => stripAccents(s).toUpperCase();

export function applyFilter(rows: EvalRow[], f: Filter): EvalRow[] {
  const q = norm(f.q.trim());
  return rows.filter(
    (r) =>
      (f.status === 'todos' || r.status === f.status) &&
      (!f.reason || r.reason === f.reason) &&
      (!f.issue || r.issues.some((i) => i.code === f.issue)) &&
      (!f.warning || r.warnings.some((w) => w.code === f.warning)) &&
      (!q ||
        norm(fullNameOf(r.m)).includes(q) ||
        r.clave.includes(q) ||
        r.numId.includes(q) ||
        String(r.m.row) === q ||
        norm(r.m.original.descripcion.text).includes(q)),
  );
}

export function useReviewColumns(c: Converter): Column<EvalRow>[] {
  return useMemo(
    () => [
      { key: 'row', header: 'Fila', width: 64, align: 'right', render: (r) => r.m.row },
      { key: 'clave', header: 'Clave de identidad', width: 140, render: (r) => r.clave || <span className="bad">(vacía)</span>, title: (r) => r.clave },
      { key: 'numId', header: 'NUM.ID.', width: 150, render: (r) => r.numId || <span className="bad">(vacío)</span>, title: (r) => r.numId },
      {
        key: 'aseg',
        header: 'Asegurado',
        width: 230,
        render: (r) => fullNameOf(r.m),
        title: (r) => `${fullNameOf(r.m)}\n→ ${r.person.nombre} | ${r.person.apellidoPaterno} | ${r.person.apellidoMaterno}`,
      },
      { key: 'desc', header: 'Movimiento original', width: 230, render: (r) => r.m.original.descripcion.text, title: (r) => r.m.original.descripcion.text },
      { key: 'fmov', header: 'Fecha mov.', width: 96, render: (r) => r.m.original.fechaMovimiento.text },
      { key: 'par', header: 'Parentesco', width: 92, render: (r) => (r.parentesco ? PARENTESCO_FULL[r.parentesco] : <span className="bad">{r.parentescoRaw || '?'}</span>) },
      {
        key: 'tit',
        header: 'Titular asociado',
        width: 150,
        render: (r) => {
          if (!r.titularId) return <span className="muted">—</span>;
          if (r.titularId === r.m.id) return <span className="muted">(es titular)</span>;
          return c.result?.byId.get(r.titularId)?.numId;
        },
        title: (r) => (r.titularId ? fullNameOf(c.result!.byId.get(r.titularId)!.m) : ''),
      },
      { key: 'st', header: 'Estado', width: 118, render: (r) => <span className={cx('status', `st-${r.status}`)}>{STATUS_LABELS[r.status]}</span> },
      {
        key: 'det',
        header: 'Razón / incidencias',
        width: 320,
        render: (r) =>
          r.reason ? (
            <>
              {REASONS[r.reason]}
              {r.pairId && <span className="muted"> · {r.pairId}</span>}
            </>
          ) : r.issues.length ? (
            <span className="bad">{r.issues.map((i) => ISSUE_LABELS[i.code]).join(' · ')}</span>
          ) : r.warnings.length ? (
            <span className="warn-text">{r.warnings.map((w) => WARNING_LABELS[w.code]).join(' · ')}</span>
          ) : (
            ''
          ),
        title: (r) => [...r.issues.map((i) => `${ISSUE_LABELS[i.code]}: ${i.message}`), ...r.warnings.map((w) => w.message), r.reasonDetail ?? ''].filter(Boolean).join('\n'),
      },
    ],
    [c.result],
  );
}

export function StepReview({ c, initialFilter }: { c: Converter; initialFilter?: Filter }) {
  const [filter, setFilter] = useState<Filter>(initialFilter ?? EMPTY_FILTER);
  const [selected, setSelected] = useState<string | null>(null);
  const deferredFilter = useDeferredValue(filter);
  const res = c.result!;
  const rows = useMemo(() => applyFilter(res.rows, deferredFilter), [res, deferredFilter]);
  const columns = useReviewColumns(c);
  const selectedRow = selected ? res.byId.get(selected) : undefined;
  const pendingNames = useMemo(() => rows.filter((r) => r.status !== 'rechazado' && !r.nameReviewed).map((r) => r.m.id), [rows]);

  const kpi = (label: string, n: number, status: Filter['status'], cls?: string) => (
    <button className={cx('kpi', cls, filter.status === status && 'active')} onClick={() => setFilter({ ...EMPTY_FILTER, status })}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{fmt(n)}</span>
    </button>
  );

  return (
    <div className="stack">
      <section className="card">
        <div className="row between wrap">
          <h2>3. Revisión de movimientos</h2>
          {c.recalculating && <span className="muted small">Recalculando…</span>}
        </div>
        <div className="kpis">
          {kpi('Total', res.counts.total, 'todos')}
          {kpi('Aceptados', res.counts.aceptados, 'aceptado', 'k-ok')}
          {kpi('Rechazados', res.counts.rechazados, 'rechazado', 'k-rej')}
          {kpi('Con incidencia', res.counts.bloqueados, 'bloqueado', 'k-bad')}
        </div>

        <div className="filters">
          <input
            type="search"
            placeholder="Buscar nombre, clave, NUM.ID., fila o descripción"
            value={filter.q}
            onChange={(e) => setFilter({ ...filter, q: e.target.value })}
            aria-label="Buscar"
          />
          <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as Filter['status'] })} aria-label="Estado">
            <option value="todos">Todos los estados</option>
            {(['aceptado', 'rechazado', 'bloqueado'] as RowStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select value={filter.reason} onChange={(e) => setFilter({ ...filter, reason: e.target.value as ReasonKey | '' })} aria-label="Razón">
            <option value="">Todas las razones</option>
            {REASON_ORDER.map((k) => (
              <option key={k} value={k}>
                {REASONS[k]} ({fmt(res.counts.byReason[k])})
              </option>
            ))}
          </select>
          <select value={filter.issue} onChange={(e) => setFilter({ ...filter, issue: e.target.value as IssueCode | '' })} aria-label="Incidencia">
            <option value="">Todas las incidencias</option>
            {(Object.keys(ISSUE_LABELS) as IssueCode[]).map((k) => (
              <option key={k} value={k} disabled={!res.issueCounts[k]}>
                {ISSUE_LABELS[k]} ({fmt(res.issueCounts[k] ?? 0)})
              </option>
            ))}
          </select>
          <select value={filter.warning} onChange={(e) => setFilter({ ...filter, warning: e.target.value as WarningCode | '' })} aria-label="Advertencia">
            <option value="">Todas las advertencias</option>
            {(Object.keys(WARNING_LABELS) as WarningCode[]).map((k) => (
              <option key={k} value={k} disabled={!res.warningCounts[k]}>
                {WARNING_LABELS[k]} ({fmt(res.warningCounts[k] ?? 0)})
              </option>
            ))}
          </select>
          {filter !== EMPTY_FILTER && (
            <button className="btn link" onClick={() => setFilter(EMPTY_FILTER)}>
              Limpiar filtros
            </button>
          )}
        </div>
        <div className="row between wrap small">
          <span className="muted">
            {fmt(rows.length)} de {fmt(res.rows.length)} movimientos · orden: clave de identidad, NUM.ID. y fila original · clic en una fila para
            revisarla o corregirla
          </span>
          {pendingNames.length > 0 && (
            <button className="btn small" onClick={() => c.markNamesReviewed(pendingNames)}>
              Confirmar {fmt(pendingNames.length)} separaciones de nombre de esta vista
            </button>
          )}
        </div>

        <VirtualTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.m.id}
          onRowClick={(r) => setSelected(r.m.id)}
          selectedKey={selected}
          rowClass={(r) => `r-${r.status}`}
          empty="Ningún movimiento coincide con el filtro."
        />
      </section>
      {selectedRow && <RowEditor c={c} row={selectedRow} onClose={() => setSelected(null)} />}
    </div>
  );
}
