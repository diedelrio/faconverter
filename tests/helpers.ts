import * as XLSX from 'xlsx';
import type { CellValue, Movement, SourceColumn } from '../src/core/types';
import { ALL_COLUMNS } from '../src/core/normalize';
import { defaultInput, evaluate, type EvalInput } from '../src/core/pipeline';
import { emptyExecData, type ExecData } from '../src/core/config';

export const ALTA = 'ALTA DE INCISOS/ASEGURADOS';
export const EMISION = 'EMISIÓN DE LA POLIZA';
export const BAJA = 'BAJA DE INCISOS/ASEGURADOS';
export const CANCEL = 'CANCELACIÓN AUTOMÁTICA ENDOSOS';

export type RowSpec = Partial<Record<SourceColumn, string | number>>;

let seq = 0;
/** Crea movimientos a partir de especificaciones simples (fila = índice + 2). */
export function movements(specs: RowSpec[]): Movement[] {
  seq = 0;
  return specs.map((s, i) => {
    const original = {} as Record<SourceColumn, CellValue>;
    for (const c of ALL_COLUMNS) {
      const v = s[c];
      original[c] = typeof v === 'number' ? { text: String(v), num: v } : { text: v ?? '' };
    }
    if (!s.sexo) original.sexo = { text: 'M' };
    if (!s.descripcion) original.descripcion = { text: ALTA };
    if (!s.asegurado) original.asegurado = { text: 'JUAN PEREZ LOPEZ' };
    if (s.grupo === undefined) original.grupo = { text: '1' };
    return { id: `r${i + 2}`, row: i + 2, seq: seq++, original };
  });
}

export function run(specs: RowSpec[], patch: Partial<EvalInput> = {}) {
  const ms = movements(specs);
  return evaluate({ ...defaultInput(ms), ...patch });
}

export function exec(over: Partial<ExecData> = {}): ExecData {
  return {
    ...emptyExecData(),
    poliza: '000123',
    tipoMovimiento: 'ALTA',
    nombreCliente: 'CLIENTE SA',
    sucursal: '01',
    noEmpleado: '00042',
    formaPago: 'MENSUAL',
    nombrePlan: 'PLAN A',
    telefono: '0155123456',
    cp: '01234',
    fechaInicioVigenciaCert: '2026-01-01',
    ...over,
  };
}

/** Construye un .xlsx en memoria a partir de un arreglo de filas. */
export function xlsxBuffer(rows: unknown[][], sheet = 'Hoja1', extraSheets: Record<string, unknown[][]> = {}): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet);
  for (const [n, r] of Object.entries(extraSheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r), n);
  return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
}

export const statusOf = (res: ReturnType<typeof evaluate>, id: string) => res.byId.get(id)!;
