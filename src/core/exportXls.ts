/**
 * Exportación:
 *  - Archivo de importación .xls binario (BIFF8, Excel 97-2003) con una hoja "Tabla 1" y 32 columnas.
 *  - Log .xlsx con la hoja "Rechazados".
 *  - Verificación: el .xls generado se vuelve a leer y se compara celda a celda con la vista previa.
 */
import * as XLSX from 'xlsx';
import { isoToSerial, parseDateCell } from './dates';
import type { VerifyResult } from './workerProtocol';
import { DATE_FORMAT, IMPORT_HEADERS, IMPORT_SHEET, LOG_HEADERS, LOG_SHEET, type OutCell } from './exportRows';

export * from './exportRows';

function toSheetCell(c: OutCell): XLSX.CellObject | undefined {
  if (!c) return undefined;
  if (c.t === 's') return { t: 's', v: c.v };
  return { t: 'n', v: isoToSerial(c.iso), z: DATE_FORMAT };
}

function buildSheet(headers: readonly string[], rows: OutCell[][], widths?: number[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  headers.forEach((h, c) => (ws[XLSX.utils.encode_cell({ r: 0, c })] = { t: 's', v: h }));
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const sc = toSheetCell(cell);
      if (sc) ws[XLSX.utils.encode_cell({ r: r + 1, c })] = sc;
    });
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } });
  if (widths) ws['!cols'] = widths.map((wch) => ({ wch }));
  return ws;
}

const IMPORT_WIDTHS = IMPORT_HEADERS.map((h) => Math.max(12, h.length + 2));

/** Genera el .xls binario (BIFF8 en contenedor OLE2/CFB). */
export function writeImportXls(rows: OutCell[][]): Uint8Array<ArrayBuffer> {
  if (rows.length > 65535) throw new Error('El formato .xls admite como máximo 65.535 filas de datos.');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(IMPORT_HEADERS, rows, IMPORT_WIDTHS), IMPORT_SHEET);
  const out = XLSX.write(wb, { bookType: 'biff8', type: 'array', compression: false }) as ArrayBuffer;
  return new Uint8Array(out);
}

/** Firma OLE2/CFB: los .xls binarios reales empiezan por D0 CF 11 E0 A1 B1 1A E1. */
export function isCfbXls(buf: Uint8Array): boolean {
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return sig.every((b, i) => buf[i] === b);
}


function cellToComparable(c: OutCell): string {
  if (!c) return '';
  return c.t === 's' ? `s:${c.v}` : `d:${c.iso}`;
}

/** Vuelve a leer el .xls generado y lo compara con las filas de la vista previa. */
export function verifyImportXls(buf: Uint8Array, expected: OutCell[][]): VerifyResult {
  const differences: string[] = [];
  if (!isCfbXls(buf)) differences.push('El archivo no tiene firma OLE2 de Excel 97-2003.');
  const wb = XLSX.read(buf, { type: 'array', dense: true, cellDates: false, cellNF: true });
  if (wb.SheetNames.length !== 1 || wb.SheetNames[0] !== IMPORT_SHEET) differences.push(`Hojas: ${wb.SheetNames.join(', ')} (se esperaba solo "${IMPORT_SHEET}").`);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = ((ws as unknown as { '!data'?: (XLSX.CellObject | undefined)[][] })['!data'] ?? []) as (XLSX.CellObject | undefined)[][];

  const header = (data[0] ?? []).map((c) => (c ? String(c.v) : ''));
  if (header.length !== IMPORT_HEADERS.length || IMPORT_HEADERS.some((h, i) => header[i] !== h)) {
    differences.push('Los encabezados no coinciden con las 32 columnas requeridas.');
  }
  const dataRows = data.slice(1).filter((r) => r && r.some((c) => c && c.v !== undefined && c.v !== ''));
  if (dataRows.length !== expected.length) differences.push(`Filas: ${dataRows.length} en el archivo, ${expected.length} en la vista previa.`);

  const n = Math.min(dataRows.length, expected.length);
  for (let r = 0; r < n && differences.length < 20; r++) {
    for (let c = 0; c < IMPORT_HEADERS.length; c++) {
      const cell = dataRows[r]?.[c];
      let got = '';
      if (cell && cell.v !== undefined && cell.v !== '') {
        if (cell.t === 'n') {
          const p = parseDateCell({ text: '', num: cell.v as number });
          got = 'iso' in p && cell.z && XLSX.SSF.is_date(cell.z) ? `d:${p.iso}` : `n:${cell.v}`;
        } else got = `s:${String(cell.v)}`;
      }
      const want = cellToComparable(expected[r][c]);
      if (got !== want) differences.push(`Fila ${r + 2}, columna ${c + 1} (${IMPORT_HEADERS[c]}): archivo "${got}", vista previa "${want}".`);
    }
  }
  return { ok: differences.length === 0, rows: dataRows.length, differences };
}

export function writeLogXlsx(rows: OutCell[][]): Uint8Array<ArrayBuffer> {
  const wb = XLSX.utils.book_new();
  // La fila original se guarda como número para poder ordenar en Excel.
  const ws = buildSheet(LOG_HEADERS, rows, [12, 22, 20, 36, 34, 18, 26, 22, 40]);
  rows.forEach((row, i) => {
    const ref = XLSX.utils.encode_cell({ r: i + 1, c: 0 });
    const c = row[0];
    if (c && c.t === 's') ws[ref] = { t: 'n', v: Number(c.v) };
  });
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length, 1), c: LOG_HEADERS.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, ws, LOG_SHEET);
  return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true }) as ArrayBuffer);
}
