/**
 * Fechas: interpretación de celdas de Excel y textos, y conversión a número de serie.
 * Internamente se usa ISO yyyy-mm-dd para evitar problemas de zona horaria.
 */
import type { CellValue } from './types';
import { stripAccents } from './normalize';

const MONTHS: Record<string, number> = {
  ENE: 1, ENERO: 1, JAN: 1,
  FEB: 2, FEBRERO: 2,
  MAR: 3, MARZO: 3,
  ABR: 4, ABRIL: 4, APR: 4,
  MAY: 5, MAYO: 5,
  JUN: 6, JUNIO: 6,
  JUL: 7, JULIO: 7,
  AGO: 8, AGOSTO: 8, AUG: 8,
  SEP: 9, SEPT: 9, SEPTIEMBRE: 9, SETIEMBRE: 9, SET: 9,
  OCT: 10, OCTUBRE: 10,
  NOV: 11, NOVIEMBRE: 11,
  DIC: 12, DICIEMBRE: 12, DEC: 12,
};

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function isValidYmd(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim;
}

export function toIso(y: number, m: number, d: number): string {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86400000;

/** Número de serie de Excel (sistema 1900) → ISO. */
export function serialToIso(serial: number, date1904 = false): string | null {
  if (!Number.isFinite(serial)) return null;
  const s = Math.floor(serial) + (date1904 ? 1462 : 0);
  if (s < 1 || s > 2958465) return null;
  // Excel considera 1900 bisiesto: los seriales < 61 se desplazan un día.
  const adj = s < 61 ? s + 1 : s;
  const dt = new Date(EXCEL_EPOCH_MS + adj * DAY_MS);
  const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
  return isValidYmd(y, m, d) ? toIso(y, m, d) : null;
}

/** ISO → número de serie de Excel (sistema 1900). */
export function isoToSerial(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const s = Math.round((Date.UTC(y, m - 1, d) - EXCEL_EPOCH_MS) / DAY_MS);
  return s < 61 ? s - 1 : s;
}

/** ISO → dd/mm/aaaa. */
export function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function expandYear(y: number): number {
  if (y >= 100) return y;
  // Dos dígitos: se asume el siglo más reciente que no quede en el futuro.
  const now = new Date().getFullYear() % 100;
  return y <= now ? 2000 + y : 1900 + y;
}

/**
 * Interpreta un texto de fecha. Formatos admitidos (día primero, uso en México):
 * dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa, aaaa-mm-dd, aaaa/mm/dd, dd/MMM/aaaa, dd de mes de aaaa,
 * con hora opcional al final.
 */
export function parseDateText(raw: string): string | null {
  let s = stripAccents(String(raw ?? '')).toUpperCase().trim();
  if (!s) return null;
  s = s.replace(/[T ]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*(AM|PM|A\.?M\.?|P\.?M\.?)?Z?$/, '').trim();

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return isValidYmd(y, mo, d) ? toIso(y, mo, d) : null;
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const [d, mo, y] = [+m[1], +m[2], expandYear(+m[3])];
    return isValidYmd(y, mo, d) ? toIso(y, mo, d) : null;
  }
  m = /^(\d{1,2})(?:\s*[-/.\s]\s*|\s+DE\s+)([A-Z]+)\.?(?:\s*[-/.\s]\s*|\s+DE\s+|\s+DEL\s+)(\d{2}|\d{4})$/.exec(s);
  if (m && MONTHS[m[2]]) {
    const [d, mo, y] = [+m[1], MONTHS[m[2]], expandYear(+m[3])];
    return isValidYmd(y, mo, d) ? toIso(y, mo, d) : null;
  }
  m = /^(\d{8})$/.exec(s);
  if (m) {
    // aaaammdd
    const y = +s.slice(0, 4), mo = +s.slice(4, 6), d = +s.slice(6, 8);
    return isValidYmd(y, mo, d) ? toIso(y, mo, d) : null;
  }
  return null;
}

export type DateParse = { iso: string } | { empty: true } | { invalid: string };

/** Interpreta una celda como fecha: serial de Excel o texto. */
export function parseDateCell(cell: CellValue | undefined, date1904 = false): DateParse {
  if (!cell || (cell.text.trim() === '' && cell.num === undefined)) return { empty: true };
  if (cell.num !== undefined) {
    // Números con forma aaaammdd se interpretan como texto.
    if (cell.num >= 19000101 && cell.num <= 21001231) {
      const iso = parseDateText(String(cell.num));
      return iso ? { iso } : { invalid: cell.text };
    }
    const iso = serialToIso(cell.num, date1904);
    return iso ? { iso } : { invalid: cell.text };
  }
  const iso = parseDateText(cell.text);
  return iso ? { iso } : { invalid: cell.text };
}
