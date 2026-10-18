import { useEffect, useMemo, useState } from 'react';
import type { Converter } from './useConverter';
import { IMPORT_HEADERS, buildImportRows, buildLogRows, displayCell, type OutCell } from '../core/exportRows';
import type { VerifyResult } from '../core/workerProtocol';
import { exportFiles } from '../core/workerClient';
import { newBusy, ProgressPanel, withPhase, type BusyState } from './Progress';
import { APP_VERSION } from '../version';
import { buildReportHtml, buildSummary, movementSlices, pct, reasonSlices } from '../core/summary';
import { PieChart } from './PieChart';
import { VirtualTable, type Column } from './VirtualTable';
import { downloadBlob, fmt, safeName, stamp } from './util';

interface Generated {
  xls: Uint8Array<ArrayBuffer>;
  log: Uint8Array<ArrayBuffer>;
  verify: VerifyResult;
  stamp: string;
}

export function StepDownload({ c, onRestart }: { c: Converter; onRestart: () => void }) {
  const res = c.result!;
  const summary = useMemo(() => buildSummary(res), [res]);
  const importRows = useMemo(() => buildImportRows(res, c.exec), [res, c.exec]);
  const logRows = useMemo(() => buildLogRows(res, c.extractResult?.date1904), [res, c.extractResult]);
  const [gen, setGen] = useState<Generated | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [working, setWorking] = useState<BusyState | null>(null);

  useEffect(() => {
    setWorking(newBusy(`Generando archivos (${importRows.length.toLocaleString('es-MX')} registros)`));
    setGen(null);
    let cancelled = false;
    exportFiles(importRows, logRows, (p) => !cancelled && setWorking((b) => withPhase(b, p)))
      .then((r) => {
        if (cancelled) return;
        setGen({ ...r, stamp: stamp() });
        setErr(null);
      })
      .catch((e: Error) => !cancelled && setErr(e.message))
      .finally(() => !cancelled && setWorking(null));
    return () => {
      cancelled = true;
    };
  }, [importRows, logRows]);

  const base = `${safeName(c.exec.poliza)}_${gen?.stamp ?? stamp()}`;
  const previewRows = useMemo(() => importRows.map((cells, i) => ({ i, cells })), [importRows]);
  const previewCols: Column<{ i: number; cells: OutCell[] }>[] = useMemo(
    () =>
      IMPORT_HEADERS.map((h, i) => ({
        key: String(i),
        header: `${i + 1}. ${h}`,
        width: i === 7 || i === 13 || i === 2 ? 170 : i >= 6 && i <= 17 ? 130 : 140,
        render: (r) => displayCell(r.cells[i]),
        title: (r) => displayCell(r.cells[i]),
      })),
    [],
  );

  function downloadReport() {
    const html = buildReportHtml(summary, {
      archivo: c.file?.name ?? '',
      hoja: c.sheet ?? '',
      poliza: c.exec.poliza,
      plan: c.exec.nombrePlan,
      cliente: c.exec.nombreCliente,
      generado: new Date(),
      version: APP_VERSION,
    });
    downloadBlob(html, `resumen_${base}.html`, 'text/html;charset=utf-8');
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>5. Descargas</h2>
        {err && <div className="notice bad">Error al generar los archivos: {err}</div>}
        <ProgressPanel busy={working} className="inline-progress" />
        {gen && (
          <div className={gen.verify.ok ? 'notice ok' : 'notice bad'}>
            {gen.verify.ok ? (
              <>
                <strong>Verificación correcta.</strong> El .xls generado (Excel 97-2003, hoja «Tabla 1») se volvió a leer: {fmt(gen.verify.rows)} filas y
                32 columnas coinciden con la vista previa.
              </>
            ) : (
              <>
                <strong>La verificación encontró diferencias:</strong>
                <ul className="small-list">
                  {gen.verify.differences.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <div className="downloads">
          <button
            className="btn primary big"
            disabled={!gen || !gen.verify.ok}
            onClick={() => gen && downloadBlob(gen.xls, `importacion_altas_${base}.xls`, 'application/vnd.ms-excel')}
          >
            Importación de altas (.xls)
            <span className="btn-sub">{fmt(importRows.length)} registros</span>
          </button>
          <button
            className="btn big"
            disabled={!gen}
            onClick={() => gen && downloadBlob(gen.log, `log_rechazados_${base}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
          >
            Log de rechazados (.xlsx)
            <span className="btn-sub">{fmt(logRows.length)} movimientos</span>
          </button>
          <button className="btn big" onClick={downloadReport}>
            Reporte resumen (.html)
            <span className="btn-sub">indicadores y gráficos</span>
          </button>
        </div>
        <p className="small muted">
          La compatibilidad final debe comprobarse importando el archivo en el sistema receptor.
        </p>
        <div className="restart">
          <button className="btn" onClick={onRestart}>
            ↺ Nueva conversión (volver al inicio)
          </button>
          <span className="muted small">Se conservan la configuración, las asignaciones de columnas y los valores por defecto.</span>
        </div>
      </section>

      <section className="card">
        <h2>Resumen</h2>
        <div className="kpis static">
          <div className="kpi">
            <span className="kpi-label">Total de movimientos</span>
            <span className="kpi-value">{fmt(summary.total)}</span>
          </div>
          <div className="kpi k-ok">
            <span className="kpi-label">Aceptados</span>
            <span className="kpi-value">{fmt(summary.aceptados)}</span>
            <span className="kpi-sub">{pct(summary.aceptados, summary.total)}</span>
          </div>
          <div className="kpi k-rej">
            <span className="kpi-label">Rechazados</span>
            <span className="kpi-value">{fmt(summary.rechazados)}</span>
            <span className="kpi-sub">{pct(summary.rechazados, summary.total)}</span>
          </div>
        </div>
        <p className={summary.consistent ? 'small good' : 'small bad'}>
          {summary.consistent ? '✓' : '✗'} Total = Aceptados + Rechazados · log: {fmt(logRows.length)} filas · importación: {fmt(importRows.length)} filas
        </p>
        <div className="charts">
          <PieChart title="Resumen de movimientos" slices={movementSlices(summary)} totalLabel="Total de movimientos" emptyText="Sin movimientos" />
          <PieChart title="Rechazados por razón" slices={reasonSlices(summary)} totalLabel="Total de rechazados" emptyText="Sin rechazos" />
        </div>
      </section>

      <section className="card">
        <h3>Vista previa de la importación</h3>
        <VirtualTable rows={previewRows} columns={previewCols} rowKey={(r) => String(r.i)} height="45vh" empty="No hay movimientos aceptados." />
      </section>
    </div>
  );
}
