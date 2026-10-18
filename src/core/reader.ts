/**
 * Lectura y normalización del Excel de entrada (se ejecuta en un Web Worker).
 * Detecta la hoja y la fila de encabezados, asigna columnas y excluye filas vacías,
 * de totales, de contadores y encabezados repetidos.
 */
import * as XLSX from 'xlsx';
import type { CellValue, Movement, SourceColumn } from './types';
import {
  ALL_COLUMNS,
  DEFAULTABLE_COLUMNS,
  REQUIRED_COLUMNS,
  classifyRow,
  matchHeader,
  normalizeHeader,
  type ColumnDefaults,
  type LearnedMappings,
  type RowKind,
} from './normalize';

export type ColumnMapping = Record<SourceColumn, number | null>;

export interface HeaderCell {
  index: number;
  text: string;
}

export interface SheetInfo {
  name: string;
  rowCount: number;
  /** Índice 0-based de la fila de encabezados detectada. */
  headerRow: number;
  headers: HeaderCell[];
  mapping: ColumnMapping;
  /** Columnas obligatorias sin asignar. */
  missing: SourceColumn[];
  /** Cantidad de columnas reconocidas. */
  score: number;
  candidate: boolean;
}

export interface SkippedRow {
  row: number;
  kind: Exclude<RowKind, 'movimiento' | 'vacia'>;
  preview: string;
}

export interface ExtractResult {
  movements: Movement[];
  skipped: SkippedRow[];
  /** Filas vacías omitidas (no cuentan como movimientos). */
  emptyRows: number;
  /** Celdas completadas con el valor por defecto, por columna. */
  defaultsApplied: Partial<Record<SourceColumn, number>>;
  /** Encabezados no asignados (primas, recargos, impuestos...): se leen pero no se exportan. */
  extraHeaders: string[];
  date1904: boolean;
}

const HEADER_SCAN_ROWS = 20;
const CANDIDATE_MIN_SCORE = 4;

export function readWorkbook(data: ArrayBuffer | Uint8Array): XLSX.WorkBook {
  return XLSX.read(data, { type: 'array', dense: true, cellDates: false, cellNF: false, cellText: true, cellStyles: false });
}

export function isDate1904(wb: XLSX.WorkBook): boolean {
  return Boolean(wb.Workbook?.WBProps?.date1904);
}

type DenseRow = (XLSX.CellObject | undefined)[] | undefined;

function denseData(ws: XLSX.WorkSheet): DenseRow[] {
  return ((ws as unknown as { '!data'?: DenseRow[] })['!data'] ?? []) as DenseRow[];
}

export function cellText(c: XLSX.CellObject | undefined): string {
  if (!c || c.v === undefined || c.v === null) return '';
  if (c.t === 'e') return '';
  if (c.w !== undefined && c.w !== null) return String(c.w);
  return String(c.v);
}

export function toCellValue(c: XLSX.CellObject | undefined): CellValue {
  const text = cellText(c).trim();
  if (c && c.t === 'n' && typeof c.v === 'number') return { text, num: c.v };
  if (c && c.t === 'd' && c.v instanceof Date) {
    // Fecha nativa: se convierte a serial (componentes UTC para no depender de la zona horaria).
    const d = c.v;
    const serial = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000;
    return { text, num: serial };
  }
  return { text };
}

function emptyMapping(): ColumnMapping {
  return Object.fromEntries(ALL_COLUMNS.map((c) => [c, null])) as ColumnMapping;
}

/**
 * Asigna columnas por encabezado. Primero se aplican las asignaciones aprendidas de corridas
 * anteriores (las hizo el usuario a mano) y después los alias previstos.
 */
export function autoMap(headers: HeaderCell[], learned: LearnedMappings = {}): ColumnMapping {
  const mapping = emptyMapping();
  const used = new Set<number>();
  for (const h of headers) {
    const col = learned[normalizeHeader(h.text)];
    if (col && col in mapping && mapping[col] === null) {
      mapping[col] = h.index;
      used.add(h.index);
    }
  }
  for (const h of headers) {
    if (used.has(h.index)) continue;
    const col = matchHeader(h.text);
    if (col && mapping[col] === null) mapping[col] = h.index;
  }
  return mapping;
}

/** Columnas obligatorias sin asignar. El nombre basta con ASEGURADO(S) o con NOMBRE(S) + APELLIDO PATERNO. */
export function missingColumns(mapping: ColumnMapping, defaults: ColumnDefaults = {}): SourceColumn[] {
  const miss = REQUIRED_COLUMNS.filter((c) => mapping[c] === null && !hasDefault(defaults, c));
  if (!hasNameColumns(mapping)) miss.splice(2, 0, 'asegurado');
  return miss;
}

export function hasDefault(defaults: ColumnDefaults, col: SourceColumn): boolean {
  return DEFAULTABLE_COLUMNS.includes(col) && Boolean(defaults[col]?.trim());
}

export function hasNameColumns(mapping: ColumnMapping): boolean {
  return mapping.asegurado !== null || (mapping.nombre !== null && mapping.apellidoPaterno !== null);
}

/**
 * Asignaciones que conviene recordar: las que los alias previstos no habrían hecho
 * (encabezado normalizado → columna).
 */
export function mappingsToLearn(mapping: ColumnMapping, headers: HeaderCell[]): LearnedMappings {
  const out: LearnedMappings = {};
  for (const col of ALL_COLUMNS) {
    const idx = mapping[col];
    if (idx === null) continue;
    const h = headers.find((x) => x.index === idx);
    if (h && matchHeader(h.text) !== col) out[normalizeHeader(h.text)] = col;
  }
  return out;
}

function headersOf(row: DenseRow): HeaderCell[] {
  const out: HeaderCell[] = [];
  (row ?? []).forEach((c, index) => {
    const text = cellText(c).trim();
    if (text) out.push({ index, text });
  });
  return out;
}

export function inspectSheet(name: string, ws: XLSX.WorkSheet, learned: LearnedMappings = {}): SheetInfo {
  const data = denseData(ws);
  let best = { row: 0, score: -1, headers: [] as HeaderCell[], mapping: emptyMapping() };
  for (let r = 0; r < Math.min(HEADER_SCAN_ROWS, data.length); r++) {
    const headers = headersOf(data[r]);
    const mapping = autoMap(headers, learned);
    const score = ALL_COLUMNS.filter((c) => mapping[c] !== null).length;
    if (score > best.score) best = { row: r, score, headers, mapping };
  }
  if (best.score < 0) best.score = 0;
  return {
    name,
    rowCount: data.length,
    headerRow: best.row,
    headers: best.headers,
    mapping: best.mapping,
    missing: missingColumns(best.mapping),
    score: best.score,
    candidate: best.score >= CANDIDATE_MIN_SCORE,
  };
}

export function inspectWorkbook(wb: XLSX.WorkBook, learned: LearnedMappings = {}): SheetInfo[] {
  return wb.SheetNames.map((n) => inspectSheet(n, wb.Sheets[n], learned));
}

/** Encabezados de una fila concreta (cuando el usuario elige otra fila de encabezados). */
export function headersAt(wb: XLSX.WorkBook, sheet: string, headerRow: number): HeaderCell[] {
  return headersOf(denseData(wb.Sheets[sheet])[headerRow]);
}

export function extractMovements(
  wb: XLSX.WorkBook,
  sheet: string,
  headerRow: number,
  mapping: ColumnMapping,
  defaults: ColumnDefaults = {},
  onProgress?: (done: number, total: number) => void,
): ExtractResult {
  const defaultCols = DEFAULTABLE_COLUMNS.filter((c) => hasDefault(defaults, c));
  const defaultsApplied: Partial<Record<SourceColumn, number>> = {};
  const ws = wb.Sheets[sheet];
  const data = denseData(ws);
  const headers = headersOf(data[headerRow]);
  const mappedIdx = new Set(Object.values(mapping).filter((v): v is number => v !== null));
  const extraHeaders = headers.filter((h) => !mappedIdx.has(h.index)).map((h) => h.text);

  const movements: Movement[] = [];
  const skipped: SkippedRow[] = [];
  let emptyRows = 0;

  const totalRows = Math.max(0, data.length - headerRow - 1);
  for (let r = headerRow + 1; r < data.length; r++) {
    if (onProgress && (r - headerRow) % 2000 === 0) onProgress(r - headerRow, totalRows);
    const row = data[r] ?? [];
    const original = {} as Record<SourceColumn, CellValue>;
    const texts: Partial<Record<SourceColumn, string>> = {};
    for (const col of ALL_COLUMNS) {
      const idx = mapping[col];
      const cv = idx === null ? { text: '' } : toCellValue(row[idx]);
      original[col] = cv;
      texts[col] = cv.text;
    }
    const allTexts = row.map((c) => cellText(c));
    const kind = classifyRow(texts, allTexts);
    const excelRow = r + 1;
    if (kind === 'vacia') {
      emptyRows++;
      continue;
    }
    if (kind !== 'movimiento') {
      skipped.push({ row: excelRow, kind, preview: allTexts.filter((t) => t.trim()).slice(0, 6).join(' | ') });
      continue;
    }
    // Valores por defecto: después de clasificar la fila, para no convertir filas vacías en movimientos.
    for (const col of defaultCols) {
      const cv = original[col];
      if (cv.text === '' && cv.num === undefined) {
        original[col] = { text: defaults[col]!.trim(), defaulted: true };
        defaultsApplied[col] = (defaultsApplied[col] ?? 0) + 1;
      }
    }
    movements.push({ id: `r${excelRow}`, row: excelRow, seq: movements.length, original });
  }
  return { movements, skipped, emptyRows, defaultsApplied, extraHeaders, date1904: isDate1904(wb) };
}
