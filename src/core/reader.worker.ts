/// <reference lib="webworker" />
/**
 * Worker de lectura: los archivos se procesan dentro del navegador, en un hilo aparte,
 * para que la interfaz siga respondiendo con archivos grandes. Nada se envía a un servidor.
 * Informa el progreso por fases para mostrar avance y tiempo restante estimado.
 */
import type * as XLSX from 'xlsx';
import { extractMovements, headersAt, inspectWorkbook, isDate1904, readWorkbook } from './reader';
import { parseComplement } from './complement';
import { verifyImportXls, writeImportXls, writeLogXlsx } from './exportXls';
import type { OutCell } from './exportRows';
import type { TimedOp, Timing, WorkerRequest, WorkerResponse } from './workerProtocol';

let source: XLSX.WorkBook | null = null;

function reply(msg: WorkerResponse, transfer: Transferable[] = []) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer);
}

/** Ejecuta una operación opaca avisando antes su fase y midiendo su duración. */
function timed<T>(id: number, timings: Timing[], label: string, from: number, to: number, op: TimedOp, units: number, fn: () => T): T {
  reply({ id, type: 'progress', label, from, to, op, units });
  const t0 = performance.now();
  const out = fn();
  timings.push({ op, units, ms: performance.now() - t0 });
  return out;
}

const countCells = (rows: OutCell[][]) => rows.reduce((s, r) => s + r.reduce((n, c) => n + (c ? 1 : 0), 0), 0) + 32;

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    switch (req.type) {
      case 'open': {
        const timings: Timing[] = [];
        const bytes = req.buffer.byteLength;
        source = timed(req.id, timings, 'Leyendo el archivo', 0, 0.92, 'read', bytes, () => readWorkbook(new Uint8Array(req.buffer)));
        reply({ id: req.id, type: 'progress', label: 'Analizando hojas y encabezados', from: 0.92, to: 1 });
        reply({ id: req.id, type: 'open', sheets: inspectWorkbook(source, req.learned), timings });
        break;
      }
      case 'headers': {
        if (!source) throw new Error('No hay archivo cargado.');
        reply({ id: req.id, type: 'headers', headers: headersAt(source, req.sheet, req.headerRow) });
        break;
      }
      case 'extract': {
        if (!source) throw new Error('No hay archivo cargado.');
        const result = extractMovements(source, req.sheet, req.headerRow, req.mapping, req.defaults, (done, total) =>
          reply({ id: req.id, type: 'progress', label: `Procesando movimientos (${done.toLocaleString('es-MX')} de ${total.toLocaleString('es-MX')} filas)`, from: done / total, to: done / total }),
        );
        reply({ id: req.id, type: 'extract', result });
        break;
      }
      case 'export': {
        const timings: Timing[] = [];
        const cells = countCells(req.importRows);
        const xls = timed(req.id, timings, 'Generando el archivo de importación .xls', 0, 0.55, 'write', cells, () => writeImportXls(req.importRows));
        const verify = timed(req.id, timings, 'Verificando el archivo generado', 0.55, 0.95, 'verify', cells, () => verifyImportXls(xls, req.importRows));
        reply({ id: req.id, type: 'progress', label: 'Generando el log de rechazados', from: 0.95, to: 1 });
        const log = writeLogXlsx(req.logRows);
        reply({ id: req.id, type: 'export', xls: xls.buffer, log: log.buffer, verify, timings }, [xls.buffer, log.buffer]);
        break;
      }
      case 'complement': {
        const timings: Timing[] = [];
        const wb = timed(req.id, timings, 'Leyendo la tabla complementaria', 0, 0.9, 'read', req.buffer.byteLength, () => readWorkbook(new Uint8Array(req.buffer)));
        reply({ id: req.id, type: 'complement', result: parseComplement(wb, isDate1904(wb)), timings });
        break;
      }
      case 'reset': {
        source = null;
        reply({ id: req.id, type: 'reset' });
        break;
      }
    }
  } catch (e) {
    reply({ id: req.id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
