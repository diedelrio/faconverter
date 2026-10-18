/** Cliente con promesas para el worker de lectura, con avisos de progreso y calibración de tiempos. */
import type { ColumnMapping, ExtractResult, HeaderCell, SheetInfo } from './reader';
import type { ComplementParse } from './complement';
import type { ProgressMsg, TimedOp, Timing, VerifyResult, WorkerRequest, WorkerResponse } from './workerProtocol';
import type { OutCell } from './exportRows';
import type { ColumnDefaults, LearnedMappings } from './normalize';

/** Fase en curso tal como la usa la interfaz: `estMs` es la duración estimada si la fase es opaca. */
export interface ProgressPhase {
  label: string;
  from: number;
  to: number;
  estMs?: number;
}

export type OnProgress = (p: ProgressPhase) => void;

type Pending = { resolve: (v: WorkerResponse) => void; reject: (e: Error) => void; onProgress?: OnProgress };
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

// Ritmos por defecto medidos en un equipo de oficina (Edge); se ajustan con cada ejecución.
const DEFAULT_RATES: Record<TimedOp, number> = { read: 4000 /* bytes/ms */, write: 450 /* celdas/ms */, verify: 700 /* celdas/ms */ };
const LS_RATES = 'faConverter.ritmos.v1';

function loadRates(): Record<TimedOp, number> {
  try {
    const r = JSON.parse(localStorage.getItem(LS_RATES) ?? '{}') as Partial<Record<TimedOp, number>>;
    const out = { ...DEFAULT_RATES };
    for (const k of Object.keys(DEFAULT_RATES) as TimedOp[]) if (typeof r[k] === 'number' && r[k]! > 0) out[k] = r[k]!;
    return out;
  } catch {
    return { ...DEFAULT_RATES };
  }
}

let rates = loadRates();

/** Ajusta los ritmos con las duraciones reales (media móvil), ignorando muestras muy pequeñas. */
function calibrate(timings: Timing[]) {
  for (const t of timings) {
    if (t.ms < 80 || t.units <= 0) continue;
    rates[t.op] = rates[t.op] * 0.5 + (t.units / t.ms) * 0.5;
  }
  try {
    localStorage.setItem(LS_RATES, JSON.stringify(rates));
  } catch {
    /* sin almacenamiento: se usan los ritmos en memoria */
  }
}

function toPhase(m: ProgressMsg): ProgressPhase {
  return { label: m.label, from: m.from, to: m.to, estMs: m.op && m.units ? m.units / rates[m.op] : undefined };
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./reader.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      if (ev.data.type === 'progress') {
        p.onProgress?.(toPhase(ev.data));
        return;
      }
      pending.delete(ev.data.id);
      if (ev.data.type === 'error') p.reject(new Error(ev.data.message));
      else {
        if ('timings' in ev.data) calibrate(ev.data.timings);
        p.resolve(ev.data);
      }
    };
    worker.onerror = (ev) => {
      for (const p of pending.values()) p.reject(new Error(ev.message || 'Error en el procesamiento del archivo.'));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

function call(req: DistributiveOmit<WorkerRequest, 'id'>, transfer: Transferable[] = [], onProgress?: OnProgress): Promise<WorkerResponse> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ ...req, id }, transfer);
  });
}

export async function openWorkbook(buffer: ArrayBuffer, learned: LearnedMappings, onProgress?: OnProgress): Promise<SheetInfo[]> {
  const r = await call({ type: 'open', buffer, learned }, [buffer], onProgress);
  return (r as Extract<WorkerResponse, { type: 'open' }>).sheets;
}

export async function getHeaders(sheet: string, headerRow: number): Promise<HeaderCell[]> {
  const r = await call({ type: 'headers', sheet, headerRow });
  return (r as Extract<WorkerResponse, { type: 'headers' }>).headers;
}

export async function extract(
  sheet: string,
  headerRow: number,
  mapping: ColumnMapping,
  defaults: ColumnDefaults,
  onProgress?: OnProgress,
): Promise<ExtractResult> {
  const r = await call({ type: 'extract', sheet, headerRow, mapping, defaults }, [], onProgress);
  return (r as Extract<WorkerResponse, { type: 'extract' }>).result;
}

export async function readComplement(buffer: ArrayBuffer, onProgress?: OnProgress): Promise<ComplementParse> {
  const r = await call({ type: 'complement', buffer }, [buffer], onProgress);
  return (r as Extract<WorkerResponse, { type: 'complement' }>).result;
}

/** Genera el .xls de importación y el log .xlsx en el worker, y verifica el .xls releyéndolo. */
export async function exportFiles(
  importRows: OutCell[][],
  logRows: OutCell[][],
  onProgress?: OnProgress,
): Promise<{ xls: Uint8Array<ArrayBuffer>; log: Uint8Array<ArrayBuffer>; verify: VerifyResult }> {
  const r = (await call({ type: 'export', importRows, logRows }, [], onProgress)) as Extract<WorkerResponse, { type: 'export' }>;
  return { xls: new Uint8Array(r.xls), log: new Uint8Array(r.log), verify: r.verify };
}

/** Libera el libro cargado en el worker (nueva conversión). */
export async function resetWorker(): Promise<void> {
  if (worker) await call({ type: 'reset' });
}
