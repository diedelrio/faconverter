import { useMemo, useState } from 'react';
import type { Converter } from './useConverter';
import { CONFIGURABLE_FIELDS, EXEC_FIELDS, serializeConfig, validateExecData, type ConfigDefaults, type ExecFieldDef } from '../core/config';
import { downloadBlob } from './util';

export function StepExec({ c }: { c: Converter }) {
  const issues = useMemo(() => validateExecData(c.exec), [c.exec]);
  const issueBy = new Map(issues.map((i) => [i.field, i.message]));
  const [saved, setSaved] = useState<string | null>(null);

  const groups: { title: string; fields: ExecFieldDef[] }[] = [
    { title: 'Datos de la póliza (obligatorios en cada ejecución)', fields: EXEC_FIELDS.filter((f) => f.perRun) },
    {
      title: 'Datos generales del lote',
      fields: EXEC_FIELDS.filter((f) => f.configurable && ['tipoMovimiento', 'nombreCliente', 'sucursal', 'noEmpleado', 'formaPago'].includes(f.key)),
    },
    {
      title: 'Contacto y domicilio',
      fields: EXEC_FIELDS.filter((f) => f.configurable && !['tipoMovimiento', 'nombreCliente', 'sucursal', 'noEmpleado', 'formaPago'].includes(f.key)),
    },
    { title: 'Fecha Baja GDS y Fecha Otra Compañía (opcionales; Fecha Alta GDS se toma de ANTIGÜEDAD DESDE)', fields: EXEC_FIELDS.filter((f) => !f.perRun && !f.configurable) },
  ];

  function downloadConfig() {
    const values: ConfigDefaults = {};
    for (const k of CONFIGURABLE_FIELDS) values[k] = c.exec[k];
    downloadBlob(serializeConfig(values), 'configuracion_altas.json', 'application/json');
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="row between wrap">
          <h2>2. Datos de ejecución</h2>
          <div className="row gap wrap">
            <button className="btn" onClick={downloadConfig}>
              Descargar configuración
            </button>
            <button
              className="btn"
              onClick={() => {
                c.saveDefaultsLocally();
                setSaved('Valores guardados como predeterminados en este navegador.');
              }}
              title="Guarda solo los campos configurables en este navegador"
            >
              Guardar como predeterminados
            </button>
            {c.hasSavedDefaults && (
              <button className="btn link" onClick={() => (c.forgetLocalDefaults(), setSaved('Se olvidaron los predeterminados guardados.'))}>
                Olvidar guardados
              </button>
            )}
          </div>
        </div>
        <p className="muted">
          Los valores escritos aquí prevalecen sobre la configuración. Póliza, plan y fecha de inicio de vigencia del certificado se piden en cada
          ejecución. Los cambios no se guardan salvo que pulse «Guardar como predeterminados» o descargue la configuración.
        </p>
        {saved && <p className="small good">{saved}</p>}

        {groups.map((g) => (
          <fieldset key={g.title} className="fieldset">
            <legend>{g.title}</legend>
            <div className="form-grid">
              {g.fields.map((f) => {
                const fromConfig = f.configurable && !c.touched.has(f.key) && Boolean(c.configDefaults[f.key]);
                const overridden = f.configurable && c.touched.has(f.key) && c.configDefaults[f.key] !== undefined;
                const value = c.exec[f.key];
                // El error se muestra cuando el campo ya se tocó o tiene un valor inválido, no antes.
                const err = value !== '' || c.touched.has(f.key) ? issueBy.get(f.key) : undefined;
                return (
                  <label key={f.key} className="field">
                    <span className="field-label">
                      {f.label} {f.required && <span className="req" aria-label="obligatorio">*</span>}
                      {fromConfig && <span className="badge">configuración</span>}
                      {overridden && (
                        <button type="button" className="badge btn-badge" onClick={() => c.resetField(f.key)} title="Volver al valor de la configuración">
                          modificado · restaurar
                        </button>
                      )}
                    </span>
                    <input
                      type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
                      value={value}
                      inputMode={f.key === 'cp' || f.key === 'telefono' ? 'numeric' : undefined}
                      onChange={(e) => c.setField(f.key, e.target.value)}
                      aria-invalid={Boolean(err)}
                      className={err ? 'invalid' : undefined}
                    />
                    {err ? <span className="field-err">{err}</span> : f.hint && <span className="field-hint">{f.hint}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </section>

      <section className="card">
        <h3>Opciones de procesamiento</h3>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Orden del nombre en ASEGURADO(S)</span>
            <select value={c.nameOrder} onChange={(e) => c.setNameOrder(e.target.value as typeof c.nameOrder)}>
              <option value="nombres-apellidos">Nombres y después apellidos (los dos últimos términos son apellidos)</option>
              <option value="apellidos-nombres">Apellidos y después nombres (los dos primeros términos son apellidos)</option>
            </select>
            <span className="field-hint">La separación es una propuesta y queda pendiente de revisión.</span>
          </label>
          <div className="field">
            <span className="field-label">Validaciones estrictas (bloquean la conversión)</span>
            <label className="check">
              <input type="checkbox" checked={c.strict.fechaNacimiento} onChange={(e) => c.setStrict({ ...c.strict, fechaNacimiento: e.target.checked })} />{' '}
              Exigir fecha de nacimiento
            </label>
            <label className="check">
              <input type="checkbox" checked={c.strict.rfc} onChange={(e) => c.setStrict({ ...c.strict, rfc: e.target.checked })} /> Exigir RFC
            </label>
            <label className="check">
              <input type="checkbox" checked={c.strict.nombres} onChange={(e) => c.setStrict({ ...c.strict, nombres: e.target.checked })} /> Exigir revisión
              de todas las separaciones de nombre
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
