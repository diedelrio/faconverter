/**
 * Tabla complementaria: NUM.ID., nombre, apellidos, fecha de nacimiento y RFC.
 * Se relaciona por NUM.ID.; opcionalmente por nombre completo, exigiendo confirmación
 * cuando la coincidencia es ambigua.
 */
import type * as XLSX from 'xlsx';
import type { ComplementRecord } from './types';
import { normalizeHeader, normalizeKey } from './normalize';
import { cellText, toCellValue } from './reader';
import { parseDateCell } from './dates';
import { nameKey } from './names';

type ComplementColumn = 'numId' | 'nombre' | 'apellidoPaterno' | 'apellidoMaterno' | 'fechaNacimiento' | 'rfc';

const ALIASES: Record<ComplementColumn, string[]> = {
  numId: ['NUM ID', 'NUMID', 'NUM IDENTIFICACION', 'NUMERO ID'],
  nombre: ['NOMBRE', 'NOMBRES', 'NOMBRE S'],
  apellidoPaterno: ['APELLIDO PATERNO', 'AP PATERNO', 'PATERNO', 'PRIMER APELLIDO'],
  apellidoMaterno: ['APELLIDO MATERNO', 'AP MATERNO', 'MATERNO', 'SEGUNDO APELLIDO'],
  fechaNacimiento: ['FECHA DE NACIMIENTO', 'FECHA NACIMIENTO', 'FEC NACIMIENTO', 'FECHA NAC', 'F NACIMIENTO'],
  rfc: ['RFC', 'R F C'],
};

export interface ComplementParse {
  records: ComplementRecord[];
  sheet: string;
  missingColumns: string[];
  /** Filas con fecha ilegible (se informan; la fecha no se aplica). */
  invalidDates: number;
  duplicatedNumIds: string[];
}

type DenseRow = (XLSX.CellObject | undefined)[] | undefined;

export function parseComplement(wb: XLSX.WorkBook, date1904 = false): ComplementParse {
  for (const sheet of wb.SheetNames) {
    const ws = wb.Sheets[sheet];
    const data = ((ws as unknown as { '!data'?: DenseRow[] })['!data'] ?? []) as DenseRow[];
    for (let h = 0; h < Math.min(10, data.length); h++) {
      const map: Partial<Record<ComplementColumn, number>> = {};
      (data[h] ?? []).forEach((c, i) => {
        const n = normalizeHeader(cellText(c));
        for (const [col, al] of Object.entries(ALIASES) as [ComplementColumn, string[]][]) {
          if (map[col] === undefined && al.includes(n)) map[col] = i;
        }
      });
      if (map.numId === undefined) continue;

      const records: ComplementRecord[] = [];
      let invalidDates = 0;
      const seen = new Map<string, number>();
      for (let r = h + 1; r < data.length; r++) {
        const row = data[r] ?? [];
        const get = (col: ComplementColumn) => (map[col] === undefined ? '' : cellText(row[map[col]!]).trim());
        const numId = normalizeKey(get('numId'));
        if (!numId) continue;
        let fecha = '';
        let fechaInvalida: string | undefined;
        if (map.fechaNacimiento !== undefined) {
          const p = parseDateCell(toCellValue(row[map.fechaNacimiento]), date1904);
          if ('iso' in p) fecha = p.iso;
          else if ('invalid' in p) {
            fechaInvalida = p.invalid;
            invalidDates++;
          }
        }
        seen.set(numId, (seen.get(numId) ?? 0) + 1);
        records.push({
          index: records.length,
          row: r + 1,
          numId,
          nombre: get('nombre'),
          apellidoPaterno: get('apellidoPaterno'),
          apellidoMaterno: get('apellidoMaterno'),
          fechaNacimiento: fecha,
          fechaInvalida,
          rfc: get('rfc').toUpperCase().replace(/\s+/g, ''),
        });
      }
      const missingColumns = (Object.keys(ALIASES) as ComplementColumn[]).filter((c) => map[c] === undefined);
      return {
        records,
        sheet,
        missingColumns,
        invalidDates,
        duplicatedNumIds: [...seen].filter(([, n]) => n > 1).map(([k]) => k),
      };
    }
  }
  throw new Error('No se encontró una hoja con la columna NUM.ID. en la tabla complementaria.');
}

/** Índice por NUM.ID. Si un NUM.ID. está repetido, no se aplica automáticamente (ambiguo). */
export function indexByNumId(records: readonly ComplementRecord[]): Map<string, ComplementRecord[]> {
  const m = new Map<string, ComplementRecord[]>();
  for (const r of records) {
    const list = m.get(r.numId);
    if (list) list.push(r);
    else m.set(r.numId, [r]);
  }
  return m;
}

export function fullName(r: Pick<ComplementRecord, 'nombre' | 'apellidoPaterno' | 'apellidoMaterno'>): string {
  return [r.nombre, r.apellidoPaterno, r.apellidoMaterno].filter(Boolean).join(' ');
}

/** Índice por nombre completo normalizado (para la búsqueda por nombre). */
export function indexByName(records: readonly ComplementRecord[]): Map<string, ComplementRecord[]> {
  const m = new Map<string, ComplementRecord[]>();
  for (const r of records) {
    const k = nameKey(fullName(r));
    if (!k) continue;
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}
