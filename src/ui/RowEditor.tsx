import { useEffect, useState } from 'react';
import type { Converter } from './useConverter';
import type { CorrectableField, EvalRow, PersonField } from '../core/types';
import { REASONS } from '../core/types';
import { ALL_COLUMNS, COLUMN_LABELS } from '../core/normalize';
import { isoToDisplay, parseDateText } from '../core/dates';
import { fullName } from '../core/complement';
import { fullNameOf, hasSeparateName } from '../core/names';
import { ISSUE_LABELS, PARENTESCO_FULL, PROVENANCE_LABELS, STATUS_LABELS, WARNING_LABELS } from './labels';
import { cx } from './util';

type Draft = Record<CorrectableField, string>;

function draftOf(r: EvalRow): Draft {
  return {
    clave: r.clave,
    numId: r.numId,
    nombre: r.person.nombre,
    apellidoPaterno: r.person.apellidoPaterno,
    apellidoMaterno: r.person.apellidoMaterno,
    rfc: r.person.rfc,
    fechaNacimiento: r.person.fechaNacimientoInvalida ?? isoToDisplay(r.person.fechaNacimiento),
    sexo: r.person.sexo,
    antiguedad: r.fechaAltaGdsInvalida ?? isoToDisplay(r.fechaAltaGds),
  };
}

export function RowEditor({ c, row, onClose }: { c: Converter; row: EvalRow; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(row));
  const [just, setJust] = useState('');
  const id = row.m.id;
  const corr = c.corrections.get(id) ?? {};
  const excluded = c.exclusions.get(id);
  const titular = row.titularId ? c.result?.byId.get(row.titularId) : undefined;

  // Si el registro se recalcula (p. ej. tras otra corrección), refrescar el borrador.
  useEffect(() => setDraft(draftOf(row)), [row]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const current = draftOf(row);
  const dirty = (Object.keys(draft) as CorrectableField[]).some((k) => draft[k] !== current[k]);
  const fechaErr = draft.fechaNacimiento.trim() && !parseDateText(draft.fechaNacimiento) ? 'Use dd/mm/aaaa' : null;
  const antErr = draft.antiguedad.trim() && !parseDateText(draft.antiguedad) ? 'Use dd/mm/aaaa' : null;
  const isPerson = (f: CorrectableField): f is PersonField => !['clave', 'numId', 'antiguedad'].includes(f);

  function save() {
    const changes: Partial<Record<CorrectableField, string>> = {};
    for (const k of Object.keys(draft) as CorrectableField[]) {
      if (draft[k] !== current[k]) changes[k] = k === 'fechaNacimiento' || k === 'antiguedad' ? draft[k].trim() : draft[k];
    }
    c.setCorrectionBatch(id, changes);
    // Editar el nombre equivale a revisarlo.
    if (changes.nombre !== undefined || changes.apellidoPaterno !== undefined || changes.apellidoMaterno !== undefined) c.markNamesReviewed([id]);
  }

  const prov = (f: PersonField) => (
    <span className={cx('prov', `prov-${row.person.provenance[f]}`)}>{PROVENANCE_LABELS[row.person.provenance[f]]}</span>
  );
  const resetBtn = (f: CorrectableField) =>
    corr[f] !== undefined && (
      <button type="button" className="btn link small" onClick={() => c.setCorrection(id, f, undefined)}>
        restablecer
      </button>
    );

  const field = (f: CorrectableField, label: string, extra?: React.ReactNode, input?: React.ReactNode) => (
    <label className="field">
      <span className="field-label">
        {label} {isPerson(f) ? prov(f) : corr[f] !== undefined && <span className="prov prov-manual">Corrección manual</span>}{' '}
        {resetBtn(f)}
      </span>
      {input ?? <input value={draft[f]} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} />}
      {extra}
    </label>
  );

  return (
    <aside className="drawer" role="dialog" aria-label={`Registro fila ${row.m.row}`}>
      <header className="drawer-head">
        <div>
          <div className="muted small">
            Fila {row.m.row} · id {id}
          </div>
          <h3>{fullNameOf(row.m) || '(sin nombre)'}</h3>
          <span className={cx('status', `st-${row.status}`)}>{STATUS_LABELS[row.status]}</span>{' '}
          {row.reason && <span className="muted">{REASONS[row.reason]}</span>}
          {row.pairId && <span className="muted"> · pareja {row.pairId}</span>}
        </div>
        <button className="btn icon" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
      </header>

      <div className="drawer-body">
        {row.issues.length > 0 && (
          <div className="notice bad">
            {row.issues.map((i, k) => (
              <div key={k}>
                <strong>{ISSUE_LABELS[i.code]}:</strong> {i.message}
              </div>
            ))}
          </div>
        )}
        {row.warnings.length > 0 && (
          <div className="notice warn">
            {row.warnings.map((w, k) => (
              <div key={k}>
                <strong>{WARNING_LABELS[w.code]}:</strong> {w.message}
              </div>
            ))}
          </div>
        )}

        <section>
          <h4>Asociación</h4>
          <p className="small">
            Parentesco: <strong>{row.parentesco ? PARENTESCO_FULL[row.parentesco] : `desconocido (${row.parentescoRaw || '—'})`}</strong>
            {titular && titular.m.id !== id && (
              <>
                {' '}
                · Titular: <strong>{titular.numId}</strong> — {fullNameOf(titular.m)} (fila {titular.m.row})
              </>
            )}
          </p>
        </section>

        {row.complementCandidates && row.complementCandidates.length > 0 && c.complementInfo && (
          <section className="notice warn">
            <h4>Confirmar dato complementario</h4>
            <p className="small">Hay varias coincidencias en la tabla complementaria. Elija la que corresponde o ninguna.</p>
            {row.complementCandidates.map((idx) => {
              const r = c.complementInfo!.records[idx];
              return (
                <button key={idx} className="btn block" onClick={() => c.chooseComplement(id, idx)}>
                  Fila {r.row}: {r.numId} — {fullName(r)} {r.fechaNacimiento && `· ${isoToDisplay(r.fechaNacimiento)}`} {r.rfc && `· ${r.rfc}`}
                </button>
              );
            })}
            <button className="btn link" onClick={() => c.chooseComplement(id, null)}>
              No aplicar ninguno
            </button>
          </section>
        )}
        {c.complementChoices.has(id) && (
          <p className="small">
            Complemento elegido manualmente.{' '}
            <button className="btn link small" onClick={() => c.chooseComplement(id, undefined)}>
              Deshacer elección
            </button>
          </p>
        )}

        <section>
          <h4>Datos de la persona</h4>
          <p className="small muted">
            {hasSeparateName(row.m) ? 'Nombre separado en el origen: ' : 'Nombre completo original: '}
            <strong className="fg">{fullNameOf(row.m)}</strong>
          </p>
          <div className="form-grid tight">
            {field('nombre', 'Nombre(s)')}
            {field('apellidoPaterno', 'Apellido paterno')}
            {field('apellidoMaterno', 'Apellido materno')}
            {field(
              'sexo',
              'Sexo',
              row.person.sexo === '' && <span className="field-err">Original: “{row.m.original.sexo.text}”</span>,
              <select value={draft.sexo} onChange={(e) => setDraft({ ...draft, sexo: e.target.value })}>
                <option value="">— seleccione —</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>,
            )}
            {field(
              'fechaNacimiento',
              'Fecha de nacimiento',
              fechaErr ? <span className="field-err">{fechaErr}</span> : <span className="field-hint">dd/mm/aaaa · vacía si no se conoce</span>,
            )}
            {field(
              'rfc',
              'RFC',
              <span className="field-hint">
                {row.person.rfcCalculado ? `Calculado sin homoclave: ${row.person.rfcCalculado}` : 'Se calcula con nombre, apellidos y fecha de nacimiento'}
              </span>,
            )}
          </div>
          <div className="row gap wrap">
            <button className="btn primary" disabled={!dirty || Boolean(fechaErr) || Boolean(antErr)} onClick={save}>
              Guardar correcciones
            </button>
            {dirty && (
              <button className="btn" onClick={() => setDraft(current)}>
                Descartar cambios
              </button>
            )}
            {!row.nameReviewed ? (
              <button className="btn" onClick={() => c.markNamesReviewed([id])}>
                Confirmar separación del nombre
              </button>
            ) : (
              c.nameReviewed.has(id) && (
                <button className="btn link" onClick={() => c.markNamesReviewed([id], false)}>
                  Marcar nombre como pendiente
                </button>
              )
            )}
          </div>
        </section>

        <section>
          <h4>Fechas del movimiento</h4>
          <div className="form-grid tight">
            {field(
              'antiguedad',
              'ANTIGÜEDAD DESDE → Fecha Alta GDS',
              antErr ? <span className="field-err">{antErr}</span> : <span className="field-hint">dd/mm/aaaa · vacía si no se conoce</span>,
            )}
          </div>
        </section>

        <section>
          <h4>Claves</h4>
          <p className="small muted">Corregir claves cambia la ordenación, la compensación y la asociación familiar.</p>
          <div className="form-grid tight">
            {field('clave', 'CLAVE DE IDENTIDAD')}
            {field('numId', 'NUM.ID.')}
          </div>
        </section>

        <section>
          <h4>Exclusión</h4>
          {excluded !== undefined ? (
            <div className="notice">
              {excluded.reason === 'incidencia' ? 'Rechazado por incidencia' : 'Excluido manualmente'}: <em>{excluded.detail}</em>{' '}
              <button className="btn link" onClick={() => c.reinclude(id)}>
                Volver a incluir
              </button>
            </div>
          ) : row.status === 'rechazado' ? (
            <p className="small muted">Rechazado automáticamente por la regla «{REASONS[row.reason!]}».</p>
          ) : (
            <>
            {row.status === 'bloqueado' && (
              <div className="notice warn">
                <p className="small">
                  Puede avanzar sin corregir: el motivo del log será la incidencia ({row.issues.map((i) => ISSUE_LABELS[i.code]).join(', ')}).
                </p>
                <div className="row gap wrap">
                  <button className="btn danger" onClick={() => c.rejectIncidents([id], 'movimiento')}>
                    Rechazar este movimiento
                  </button>
                  <button className="btn danger" disabled={!row.clave} onClick={() => c.rejectIncidents([id], 'familia')}>
                    Rechazar familia/certificado {row.clave}
                  </button>
                </div>
              </div>
            )}
            <div className="row gap wrap">
              <input placeholder="Motivo de la exclusión (obligatorio)" value={just} onChange={(e) => setJust(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
              <button className="btn danger" disabled={!just.trim()} onClick={() => (c.exclude([id], just.trim()), setJust(''))}>
                Excluir registro
              </button>
            </div>
            </>
          )}
        </section>

        <section>
          <h4>Valores originales</h4>
          <table className="kv">
            <tbody>
              {ALL_COLUMNS.map((col) => (
                <tr key={col}>
                  <th>{COLUMN_LABELS[col]}</th>
                  <td>
                    {row.m.original[col].text || <span className="muted">—</span>}
                    {row.m.original[col].defaulted && <span className="badge"> valor por defecto</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </aside>
  );
}
