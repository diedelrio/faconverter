import { useMemo, useState } from 'react';
import type { Converter } from './useConverter';
import type { DescriptionKind, IssueCode, WarningCode } from '../core/types';
import { VirtualTable } from './VirtualTable';
import { RowEditor } from './RowEditor';
import { useReviewColumns } from './StepReview';
import { previewRejection } from '../core/incidents';
import { ISSUE_HELP, ISSUE_LABELS, WARNING_LABELS } from './labels';
import { cx, fmt } from './util';

const KIND_LABEL: Record<DescriptionKind, string> = {
  alta: 'Alta (se importa)',
  baja: 'Baja (compensa un alta)',
  excluir: 'No aplicable (se excluye)',
};

export function StepIssues({ c, onGoto }: { c: Converter; onGoto: (step: 2 | 3) => void }) {
  const res = c.result!;
  const [issue, setIssue] = useState<IssueCode | ''>('');
  const [selected, setSelected] = useState<string | null>(null);
  const [bulkJust, setBulkJust] = useState('');
  const columns = useReviewColumns(c);

  const blocked = useMemo(
    () => res.rows.filter((r) => r.status === 'bloqueado' && (!issue || r.issues.some((i) => i.code === issue))),
    [res, issue],
  );
  const issueCodes = (Object.keys(res.issueCounts) as IssueCode[]).filter((k) => res.issueCounts[k]);
  const warningCodes = (Object.keys(res.warningCounts) as WarningCode[]).filter((k) => res.warningCounts[k]);
  const selectedRow = selected ? res.byId.get(selected) : undefined;
  const blockedIds = useMemo(() => blocked.map((r) => r.m.id), [blocked]);
  const previewMov = useMemo(() => previewRejection(res, blockedIds, 'movimiento'), [res, blockedIds]);
  const previewFam = useMemo(() => previewRejection(res, blockedIds, 'familia'), [res, blockedIds]);
  const pendingNames = useMemo(() => res.rows.filter((r) => r.status === 'aceptado' && !r.nameReviewed).map((r) => r.m.id), [res]);
  const unclassified = res.descriptions.filter((d) => d.kind === null);
  const sumOk = res.counts.total === res.counts.aceptados + res.counts.rechazados;

  return (
    <div className="stack">
      <section className="card">
        <h2>4. Incidencias y confirmación</h2>

        {res.globalIssues.length > 0 && (
          <div className="notice bad">
            {res.globalIssues.map((g) => (
              <div key={g.code}>
                <strong>{g.message}</strong>
                {g.code === 'datosEjecucion' && (
                  <>
                    {' '}
                    <span className="small">{res.execIssues.map((e) => e.message).join(' ')}</span>{' '}
                    <button className="btn link" onClick={() => onGoto(2)}>
                      Completar datos de ejecución
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <h3>Descripciones de movimiento</h3>
        <p className="muted small">
          Las cuatro descripciones de alta y baja previstas se reconocen automáticamente (sin distinguir mayúsculas, acentos ni espacios). Clasifique las
          demás para que ningún movimiento quede sin clasificar.
        </p>
        <table className="grid-table">
          <thead>
            <tr>
              <th>Descripción</th>
              <th className="num">Movimientos</th>
              <th>Clasificación</th>
            </tr>
          </thead>
          <tbody>
            {res.descriptions.map((d) => (
              <tr key={d.descNorm} className={d.kind === null ? 'row-bad' : undefined}>
                <td>{d.sample || <span className="muted">(vacía)</span>}</td>
                <td className="num">{fmt(d.count)}</td>
                <td>
                  {d.builtIn ? (
                    <span>
                      {KIND_LABEL[d.kind!]} <span className="badge">regla prevista</span>
                    </span>
                  ) : (
                    <select value={d.kind ?? ''} onChange={(e) => c.classifyDescription(d.descNorm, (e.target.value || null) as DescriptionKind | null)}>
                      <option value="">— sin clasificar —</option>
                      {(Object.keys(KIND_LABEL) as DescriptionKind[]).map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {unclassified.length > 0 && <p className="bad small">{unclassified.length} descripciones sin clasificar.</p>}
      </section>

      <section className="card">
        <div className="row between wrap">
          <h3>Incidencias bloqueantes {res.counts.bloqueados > 0 ? <span className="pill bad-bg">{fmt(res.counts.bloqueados)} movimientos</span> : <span className="pill ok-bg">ninguna</span>}</h3>
        </div>
        {issueCodes.length === 0 ? (
          <p className="good">No hay incidencias bloqueantes en los movimientos.</p>
        ) : (
          <>
            <div className="chips">
              <button className={cx('chip', issue === '' && 'active')} onClick={() => setIssue('')}>
                Todas ({fmt(res.counts.bloqueados)})
              </button>
              {issueCodes.map((k) => (
                <button key={k} className={cx('chip', issue === k && 'active')} onClick={() => setIssue(k)}>
                  {ISSUE_LABELS[k]} ({fmt(res.issueCounts[k]!)})
                </button>
              ))}
            </div>
            {issue && <p className="small muted">{ISSUE_HELP[issue]}</p>}
            <VirtualTable
              rows={blocked}
              columns={columns}
              rowKey={(r) => r.m.id}
              onRowClick={(r) => setSelected(r.m.id)}
              selectedKey={selected}
              height="40vh"
              empty="Sin movimientos con esta incidencia."
            />
            <div className="bulk-actions">
              <div>
                <strong>Avanzar rechazando</strong>
                <p className="small muted">
                  Los movimientos quedan en el log como «Rechazado por incidencia» y el motivo se completa con la incidencia de cada uno.
                  {issue ? ` Se aplica a la incidencia «${ISSUE_LABELS[issue]}».` : ' Se aplica a todas las incidencias mostradas.'}
                </p>
              </div>
              <div className="row gap wrap">
                <button
                  className="btn danger"
                  disabled={blocked.length === 0}
                  onClick={() => {
                    if (confirm(`¿Rechazar ${previewMov.movimientos} movimientos con incidencia?`)) c.rejectIncidents(blockedIds, 'movimiento');
                  }}
                >
                  Rechazar {fmt(previewMov.movimientos)} movimientos con incidencia
                </button>
                <button
                  className="btn danger"
                  disabled={blocked.length === 0}
                  title="Rechaza todos los movimientos vigentes de las familias (misma CLAVE DE IDENTIDAD) que tienen alguna incidencia"
                  onClick={() => {
                    if (confirm(`¿Rechazar ${previewFam.familias} familias/certificados completos (${previewFam.movimientos} movimientos)?`))
                      c.rejectIncidents(blockedIds, 'familia');
                  }}
                >
                  Rechazar {fmt(previewFam.familias)} familias/certificados ({fmt(previewFam.movimientos)} movimientos)
                </button>
              </div>
              <details className="bulk">
                <summary>Excluir con un motivo propio</summary>
                <div className="row gap wrap">
                  <input placeholder="Motivo de la exclusión (obligatorio)" value={bulkJust} onChange={(e) => setBulkJust(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
                  <button
                    className="btn danger"
                    disabled={!bulkJust.trim() || blocked.length === 0}
                    onClick={() => {
                      if (confirm(`¿Excluir ${blocked.length} movimientos con el motivo «${bulkJust.trim()}»?`)) {
                        c.exclude(
                          blocked.map((r) => r.m.id),
                          bulkJust.trim(),
                        );
                        setBulkJust('');
                      }
                    }}
                  >
                    Excluir {fmt(blocked.length)}
                  </button>
                </div>
              </details>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h3>Advertencias (no bloquean)</h3>
        {warningCodes.length === 0 ? (
          <p className="muted">Sin advertencias.</p>
        ) : (
          <ul className="small-list">
            {warningCodes.map((k) => (
              <li key={k}>
                {WARNING_LABELS[k]}: <strong>{fmt(res.warningCounts[k]!)}</strong>
              </li>
            ))}
          </ul>
        )}
        {pendingNames.length > 0 && (
          <div className="row gap wrap">
            <button className="btn" onClick={() => c.markNamesReviewed(pendingNames)}>
              Confirmar las {fmt(pendingNames.length)} separaciones de nombre propuestas
            </button>
            <button className="btn link" onClick={() => onGoto(3)}>
              Revisarlas una a una
            </button>
          </div>
        )}
        {(res.counts.byReason.manual > 0 || res.counts.byReason.incidencia > 0) && (
          <p className="small">
            Exclusiones manuales: {fmt(res.counts.byReason.manual)} · Rechazados por incidencia: {fmt(res.counts.byReason.incidencia)}{' '}
            {res.counts.byReason.incidencia > 0 && (
              <button className="btn link small" onClick={c.undoIncidentRejections}>
                Deshacer rechazos por incidencia
              </button>
            )}
          </p>
        )}
      </section>

      <section className="card confirm">
        <h3>Confirmar resultado</h3>
        <p>
          Total <strong>{fmt(res.counts.total)}</strong> = Aceptados <strong>{fmt(res.counts.aceptados)}</strong> + Rechazados{' '}
          <strong>{fmt(res.counts.rechazados)}</strong>
          {res.counts.bloqueados > 0 && (
            <>
              {' '}
              + Con incidencia <strong className="bad">{fmt(res.counts.bloqueados)}</strong>
            </>
          )}{' '}
          {sumOk && res.counts.bloqueados === 0 ? <span className="good">✓ cuadra</span> : <span className="bad">pendiente</span>}
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={c.confirmed}
            disabled={!res.canFinish || c.recalculating}
            onChange={(e) => c.setConfirmed(e.target.checked)}
          />{' '}
          He revisado los movimientos y confirmo el resultado de la conversión.
        </label>
        {!res.canFinish && <p className="small bad">No se puede finalizar mientras existan incidencias bloqueantes o movimientos sin clasificar. Corríjalas o use «Avanzar rechazando» para
            continuar rechazando los movimientos o las familias afectadas.</p>}
      </section>
      {selectedRow && <RowEditor c={c} row={selectedRow} onClose={() => setSelected(null)} />}
    </div>
  );
}
