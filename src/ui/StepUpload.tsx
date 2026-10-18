import { useRef, useState } from 'react';
import type { Converter } from './useConverter';
import { ALL_COLUMNS, COLUMN_LABELS, DATE_COLUMNS, DEFAULTABLE_COLUMNS, REQUIRED_COLUMNS, normalizeHeader } from '../core/normalize';
import { parseConfig } from '../core/config';
import { parseDateText } from '../core/dates';
import { parseSexo } from '../core/validation';
import { cx, fmt, formatBytes } from './util';
import type { SourceColumn } from '../core/types';
import { SampleDownloads } from './Manual';

/** Valor por defecto de una columna: fijo si la columna no está en el archivo, o para celdas vacías. */
function DefaultInput({ col, value, mapped, onChange }: { col: SourceColumn; value: string; mapped: boolean; onChange: (v: string) => void }) {
  const isDate = DATE_COLUMNS.includes(col);
  const invalid = value.trim() !== '' && ((isDate && !parseDateText(value)) || (col === 'sexo' && !parseSexo(value)));
  return (
    <span className="default-input">
      {col === 'sexo' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={`Valor por defecto de ${COLUMN_LABELS[col]}`}>
          <option value="">— ninguno —</option>
          <option value="M">M (Masculino)</option>
          <option value="F">F (Femenino)</option>
        </select>
      ) : (
        <input
          value={value}
          placeholder={isDate ? 'dd/mm/aaaa' : mapped ? 'para celdas vacías' : 'valor fijo'}
          onChange={(e) => onChange(e.target.value)}
          className={invalid ? 'invalid' : undefined}
          aria-label={`Valor por defecto de ${COLUMN_LABELS[col]}`}
        />
      )}
      {value.trim() !== '' && <span className="muted small">{mapped ? 'si la celda está vacía' : 'en todas las filas'}</span>}
      {invalid && <span className="field-err">{isDate ? 'Fecha inválida' : 'Use M o F'}</span>}
    </span>
  );
}

function ColumnRequirement({ col, req }: { col: SourceColumn; req: boolean }) {
  if (req) return <span className="badge">obligatoria</span>;
  if (col === 'asegurado') return <span className="muted small">obligatoria si no hay NOMBRE(S) y APELLIDO PATERNO</span>;
  if (col === 'nombre' || col === 'apellidoPaterno') return <span className="muted small">alternativa a ASEGURADO(S)</span>;
  return <span className="muted">opcional</span>;
}

export function FileDrop({
  accept,
  label,
  hint,
  onFile,
  compact,
}: {
  accept: string;
  label: string;
  hint?: string;
  onFile: (f: File) => void;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={cx('drop', over && 'over', compact && 'compact')}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      onClick={() => input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
    >
      <span className="drop-icon" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 15V4m0 0L8 8m4-4 4 4" />
          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
      </span>
      <span>
        <strong>{label}</strong>
        {hint && <span className="muted small" style={{ display: 'block' }}>{hint}</span>}
      </span>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function StepUpload({ c, onOpenManual }: { c: Converter; onOpenManual: () => void }) {
  const [configMsg, setConfigMsg] = useState<string | null>(null);
  const info = c.sheets?.find((s) => s.name === c.sheet);
  const candidates = c.sheets?.filter((s) => s.candidate) ?? [];
  const ex = c.extractResult;
  const defaultCount = Object.values(c.colDefaults).filter((v) => v?.trim()).length;
  const hasDefaults = defaultCount > 0;
  const invalidDefaults = DEFAULTABLE_COLUMNS.filter((col) => {
    const v = (c.colDefaults[col] ?? '').trim();
    return v !== '' && ((DATE_COLUMNS.includes(col) && !parseDateText(v)) || (col === 'sexo' && !parseSexo(v)));
  });

  async function onConfig(f: File) {
    try {
      const r = parseConfig(await f.text());
      c.applyConfig(r.defaults, f.name);
      setConfigMsg(
        `Configuración cargada: ${Object.keys(r.defaults).length} valores.` +
          (r.ignored.length ? ` Claves ignoradas (no permitidas o desconocidas): ${r.ignored.join(', ')}.` : ''),
      );
    } catch (e) {
      setConfigMsg((e as Error).message);
    }
  }

  return (
    <div className="stack">
      {!c.file && (
        <section className="card first-time">
          <div>
            <strong>¿Primera vez?</strong> Descargue los archivos de ejemplo y siga el{' '}
            <button className="btn link" onClick={onOpenManual}>
              guion del manual de usuario
            </button>
            .
          </div>
          <SampleDownloads compact />
        </section>
      )}
      <section className="card">
        <h2>1. Archivo de asegurados</h2>
        <p className="muted">
          El archivo se procesa en este navegador. Los datos personales no se envían a ningún servidor.
        </p>
        <FileDrop
          accept=".xlsx,.xlsm,.xls"
          label={c.file ? `Archivo: ${c.file.name} (${formatBytes(c.file.size)}) — haga clic para cambiarlo` : 'Arrastre aquí el Excel o haga clic para elegirlo'}
          hint="Formato .xlsx con encabezados y una fila por movimiento"
          onFile={c.loadFile}
        />

        {c.sheets && candidates.length !== 1 && (
          <div className={cx('notice', !c.sheet && 'warn')}>
            <strong>{candidates.length > 1 ? 'Hay varias hojas candidatas.' : 'No se reconoció ninguna hoja automáticamente.'}</strong> Elija la hoja
            que contiene los movimientos:
            <div className="chips">
              {c.sheets.map((s) => (
                <button key={s.name} className={cx('chip', c.sheet === s.name && 'active')} onClick={() => c.chooseSheet(s)}>
                  {s.name} <span className="muted">({s.score} columnas reconocidas, {fmt(s.rowCount)} filas)</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {info && c.mapping && (
          <details className="mapping" open={c.mappingMissing.length > 0 || !ex || c.mappingDirty}>
            <summary>
              Hoja <strong>{info.name}</strong> · encabezados en la fila {c.headerRow + 1} ·{' '}
              {c.mappingMissing.length ? (
                <span className="bad">{c.mappingMissing.length} columnas obligatorias sin asignar</span>
              ) : (
                <span className="good">columnas asignadas</span>
              )}
            </summary>
            <div className="row gap">
              <label>
                Fila de encabezados{' '}
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={c.headerRow + 1}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v >= 1) c.changeHeaderRow(v - 1);
                  }}
                  style={{ width: 70 }}
                />
              </label>
            </div>
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Columna esperada</th>
                  <th>Columna del archivo</th>
                  <th>Valor por defecto</th>
                </tr>
              </thead>
              <tbody>
                {ALL_COLUMNS.map((col) => {
                  const req = REQUIRED_COLUMNS.includes(col);
                  const missing = c.mappingMissing.includes(col);
                  const idx = c.mapping![col];
                  const header = idx === null ? undefined : c.headers.find((h) => h.index === idx);
                  const remembered = header !== undefined && c.learned[normalizeHeader(header.text)] === col;
                  return (
                    <tr key={col} className={missing ? 'row-bad' : undefined}>
                      <td>
                        {COLUMN_LABELS[col]} <ColumnRequirement col={col} req={req} />
                        {remembered && (
                          <span className="badge" title="Asignación hecha a mano en una corrida anterior">
                            recordada
                          </span>
                        )}
                      </td>
                      <td>
                        <select
                          value={c.mapping![col] ?? ''}
                          onChange={(e) => c.setMapping({ ...c.mapping!, [col]: e.target.value === '' ? null : Number(e.target.value) })}
                        >
                          <option value="">— sin asignar —</option>
                          {c.headers.map((h) => (
                            <option key={h.index} value={h.index}>
                              {h.text}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {DEFAULTABLE_COLUMNS.includes(col) ? (
                          <DefaultInput
                            col={col}
                            value={c.colDefaults[col] ?? ''}
                            mapped={idx !== null}
                            onChange={(v) => c.setColDefault(col, v)}
                          />
                        ) : (
                          <span className="muted small">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="small muted">
              El nombre puede venir completo en ASEGURADO(S) o separado en NOMBRE(S), APELLIDO PATERNO y APELLIDO MATERNO. A una columna que no
              viene en el archivo puede darle un valor fijo; si la columna existe, el valor por defecto se usa solo en las celdas vacías. Las
              asignaciones hechas a mano y los valores por defecto se recordarán en este navegador para próximos archivos.
            </p>
            {c.mappingDirty && <p className="small bad">Hay cambios en la asignación sin aplicar: pulse «Aplicar asignación» para volver a leer.</p>}
            <button className="btn primary" disabled={c.mappingMissing.length > 0 || invalidDefaults.length > 0 || !!c.busy} onClick={() => c.runExtract()}>
              Aplicar asignación y leer movimientos
            </button>
          </details>
        )}

        {(c.learnedMsg || Object.keys(c.learned).length > 0 || hasDefaults) && (
          <p className="small muted">
            {c.learnedMsg ?? `Asignaciones de columnas recordadas: ${Object.keys(c.learned).length} · valores por defecto: ${defaultCount}.`}{' '}
            {(Object.keys(c.learned).length > 0 || hasDefaults) && (
              <button className="btn link small" onClick={c.forgetLearned}>
                Olvidar asignaciones guardadas
              </button>
            )}
          </p>
        )}

        {ex && (
          <div className="notice ok">
            <strong>{fmt(ex.movements.length)} movimientos leídos.</strong> Se omitieron {fmt(ex.emptyRows)} filas vacías y {fmt(ex.skipped.length)} filas de
            totales, contadores o encabezados repetidos (no cuentan como movimientos).
            {Object.keys(ex.defaultsApplied).length > 0 && (
              <div>
                Valores por defecto aplicados:{' '}
                {Object.entries(ex.defaultsApplied)
                  .map(([col, n]) => `${COLUMN_LABELS[col as SourceColumn]} = «${c.colDefaults[col as SourceColumn] ?? ''}» (${fmt(n)} filas)`)
                  .join('; ')}
                .
              </div>
            )}
            {ex.extraHeaders.length > 0 && (
              <div className="muted">Columnas adicionales leídas pero no exportadas: {ex.extraHeaders.join(', ')}.</div>
            )}
            {ex.skipped.length > 0 && (
              <details>
                <summary>Ver filas omitidas</summary>
                <ul className="small-list">
                  {ex.skipped.slice(0, 200).map((s) => (
                    <li key={s.row}>
                      Fila {s.row} ({s.kind}): <span className="muted">{s.preview || '—'}</span>
                    </li>
                  ))}
                  {ex.skipped.length > 200 && <li className="muted">… y {fmt(ex.skipped.length - 200)} más</li>}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      <div className="two-col">
        <section className="card">
          <h3>Configuración (opcional)</h3>
          <p className="muted">
            Archivo JSON con valores predeterminados para Tipo Movimiento, Nombre Cliente, Sucursal, No. Empleado, Forma de Pago, E-mail, Teléfono,
            Calle, CP, Estado, Municipio y Colonia. Podrá modificarlos en el siguiente paso.
          </p>
          <FileDrop compact accept=".json,application/json" label="Importar configuración (.json)" onFile={onConfig} />
          {c.configSource && <p className="muted">Origen actual: {c.configSource}</p>}
          {configMsg && <p className="small">{configMsg}</p>}
        </section>

        <section className="card">
          <h3>Tabla complementaria (opcional)</h3>
          <p className="muted">Excel con NUM.ID., Nombre, Apellido paterno, Apellido materno, Fecha de nacimiento y RFC. Se relaciona por NUM.ID.</p>
          <FileDrop compact accept=".xlsx,.xls,.csv" label="Cargar tabla complementaria" onFile={c.loadComplement} />
          {c.complementInfo && (
            <div className="small">
              <p>
                <strong>{c.complementInfo.fileName}</strong>: {fmt(c.complementInfo.records.length)} registros (hoja {c.complementInfo.sheet}).
                {c.complementInfo.missingColumns.length > 0 && <> Columnas no encontradas: {c.complementInfo.missingColumns.join(', ')}.</>}
                {c.complementInfo.invalidDates > 0 && <> {fmt(c.complementInfo.invalidDates)} fechas ilegibles (no se aplican).</>}
                {c.complementInfo.duplicatedNumIds.length > 0 && (
                  <> {fmt(c.complementInfo.duplicatedNumIds.length)} NUM.ID. repetidos: requerirán confirmación.</>
                )}
              </p>
              <label className="check">
                <input type="checkbox" checked={c.complementByName} onChange={(e) => c.setComplementByName(e.target.checked)} /> Buscar también por nombre
                completo cuando no coincida el NUM.ID. (las coincidencias ambiguas exigen confirmación)
              </label>
              <button className="btn link" onClick={c.clearComplement}>
                Quitar tabla complementaria
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
