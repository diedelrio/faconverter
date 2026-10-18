/**
 * Normalización de textos: encabezados, descripciones y claves.
 * Solo se usa para comparar; los valores originales se conservan aparte.
 */
import type { DescriptionKind, SourceColumn } from './types';

/** Quita acentos y diacríticos (conserva Ñ como N para comparar). */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Colapsa espacios (incluidos no separables y tabuladores) y recorta. */
export function collapseSpaces(s: string): string {
  return s.replace(/[\s   ]+/g, ' ').trim();
}

/** Normaliza un encabezado: sin acentos, mayúsculas y solo letras/dígitos separados por un espacio. */
export function normalizeHeader(s: string): string {
  return collapseSpaces(stripAccents(String(s ?? '')).toUpperCase().replace(/[^A-Z0-9]+/g, ' '));
}

/** Normaliza una descripción de movimiento. */
export function normalizeDescription(s: string): string {
  return collapseSpaces(
    stripAccents(String(s ?? ''))
      .toUpperCase()
      .replace(/\s*\/\s*/g, '/')
      .replace(/[.;,:]+$/g, ''),
  );
}

/** Normaliza una clave o identificador: solo colapsa espacios y pasa a mayúsculas. */
export function normalizeKey(s: string): string {
  return collapseSpaces(String(s ?? '')).toUpperCase();
}

/** Encabezados aceptados por columna canónica (ya normalizados). */
export const HEADER_ALIASES: Record<SourceColumn, string[]> = {
  numId: ['NUM ID', 'NUMID', 'NUM IDENTIFICACION', 'NUMERO ID', 'NO ID', 'NUM DE ID'],
  clave: ['CLAVE DE IDENTIDAD', 'CLAVE IDENTIDAD', 'CVE DE IDENTIDAD', 'CVE IDENTIDAD'],
  asegurado: ['ASEGURADO S', 'ASEGURADOS', 'ASEGURADO', 'NOMBRE DEL ASEGURADO', 'NOMBRE ASEGURADO', 'NOMBRE COMPLETO'],
  nombre: ['NOMBRE', 'NOMBRES', 'NOMBRE S', 'NOMBRE DE PILA'],
  apellidoPaterno: ['APELLIDO PATERNO', 'AP PATERNO', 'APELLIDO PAT', 'PATERNO', 'PRIMER APELLIDO'],
  apellidoMaterno: ['APELLIDO MATERNO', 'AP MATERNO', 'APELLIDO MAT', 'MATERNO', 'SEGUNDO APELLIDO'],
  sexo: ['SEXO', 'GENERO'],
  fechaNacimiento: ['FECHA DE NACIMIENTO', 'FECHA NACIMIENTO', 'FEC NACIMIENTO', 'F NACIMIENTO', 'FECHA DE NAC', 'FECHA NAC'],
  fechaMovimiento: ['FECHA DE MOVIMIENTO', 'FECHA MOVIMIENTO', 'FEC MOVIMIENTO', 'FECHA MOV', 'FECHA DE MOV'],
  fechaInicioVig: [
    'FECHA DE INICIO VIG',
    'FECHA DE INICIO VIGENCIA',
    'FECHA DE INICIO DE VIGENCIA',
    'FECHA INICIO VIG',
    'FECHA INICIO VIGENCIA',
    'INICIO VIG',
    'INICIO VIGENCIA',
  ],
  antiguedad: ['ANTIGUEDAD DESDE', 'ANTIGUEDAD', 'FECHA DE ANTIGUEDAD', 'FECHA ANTIGUEDAD'],
  descripcion: ['DESCRIPCION', 'DESCRIPCION DEL MOVIMIENTO', 'DESCRIPCION MOVIMIENTO', 'TIPO DE MOVIMIENTO'],
  endoso: ['ENDOSO', 'NO ENDOSO', 'NUM ENDOSO', 'NUMERO DE ENDOSO'],
  status: ['STATUS', 'ESTATUS', 'ESTADO DEL ASEGURADO'],
  grupo: ['GRUPO', 'SUBGRUPO'],
};

export const COLUMN_LABELS: Record<SourceColumn, string> = {
  numId: 'NUM.ID.',
  clave: 'CLAVE DE IDENTIDAD',
  asegurado: 'ASEGURADO(S)',
  nombre: 'NOMBRE(S)',
  apellidoPaterno: 'APELLIDO PATERNO',
  apellidoMaterno: 'APELLIDO MATERNO',
  sexo: 'SEXO',
  fechaNacimiento: 'FECHA DE NACIMIENTO',
  fechaMovimiento: 'FECHA DE MOVIMIENTO',
  fechaInicioVig: 'FECHA DE INICIO VIG.',
  antiguedad: 'ANTIGÜEDAD DESDE',
  descripcion: 'DESCRIPCIÓN',
  endoso: 'ENDOSO',
  status: 'STATUS',
  grupo: 'GRUPO',
};

export const ALL_COLUMNS = Object.keys(COLUMN_LABELS) as SourceColumn[];

/**
 * Columnas sin las cuales no se puede convertir (deben asignarse antes de continuar).
 * El nombre puede venir completo en ASEGURADO(S) o separado en NOMBRE(S) + APELLIDO PATERNO
 * (+ APELLIDO MATERNO, opcional): ver requiredColumns() en reader.ts.
 */
export const REQUIRED_COLUMNS: SourceColumn[] = [
  'numId',
  'clave',
  'sexo',
  'fechaNacimiento',
  'fechaMovimiento',
  'antiguedad',
  'descripcion',
  'grupo',
];

/**
 * Columnas que admiten un valor por defecto: se usa cuando la columna no existe en el archivo
 * o cuando la celda viene vacía. Los identificadores y nombres no admiten valor por defecto.
 */
export const DEFAULTABLE_COLUMNS: SourceColumn[] = [
  'sexo',
  'fechaNacimiento',
  'fechaMovimiento',
  'fechaInicioVig',
  'antiguedad',
  'descripcion',
  'endoso',
  'status',
  'grupo',
];

export const DATE_COLUMNS: SourceColumn[] = ['fechaNacimiento', 'fechaMovimiento', 'fechaInicioVig', 'antiguedad'];

/** Valores por defecto por columna. */
export type ColumnDefaults = Partial<Record<SourceColumn, string>>;

/** Asignaciones aprendidas: encabezado normalizado → columna canónica. */
export type LearnedMappings = Record<string, SourceColumn>;

/** Busca la columna canónica que corresponde a un encabezado (primero las aprendidas). */
export function matchHeader(header: string, learned: LearnedMappings = {}): SourceColumn | null {
  const n = normalizeHeader(header);
  if (!n) return null;
  if (learned[n] && learned[n] in COLUMN_LABELS) return learned[n];
  for (const col of ALL_COLUMNS) {
    if (HEADER_ALIASES[col].includes(n)) return col;
  }
  return null;
}

/** Descripciones reconocidas por defecto (normalizadas). */
export const DEFAULT_DESCRIPTION_KINDS: Record<string, DescriptionKind> = {
  [normalizeDescription('EMISIÓN DE LA POLIZA')]: 'alta',
  [normalizeDescription('ALTA DE INCISOS/ASEGURADOS')]: 'alta',
  [normalizeDescription('BAJA DE INCISOS/ASEGURADOS')]: 'baja',
  [normalizeDescription('CANCELACIÓN AUTOMÁTICA ENDOSOS')]: 'baja',
};

/** Clasifica una descripción normalizada con las reglas por defecto y las del usuario. */
export function describeKind(
  descNorm: string,
  userKinds: Record<string, DescriptionKind>,
): DescriptionKind | null {
  return userKinds[descNorm] ?? DEFAULT_DESCRIPTION_KINDS[descNorm] ?? null;
}

const TOTAL_RE = /^(GRAN )?(SUB ?)?TOTAL(ES)?\b/;
const COUNTER_RE =
  /^(NO|NUM|NUMERO|CANTIDAD|CONTADOR|CONTEO|REGISTROS|TOTAL DE|ASEGURADOS|MOVIMIENTOS|PERSONAS)\b[^0-9]*[0-9]+\s*$/;

export type RowKind = 'movimiento' | 'vacia' | 'total' | 'encabezado';

/**
 * Determina si una fila es un movimiento, una fila vacía, de totales/contadores
 * o un encabezado repetido. Solo las filas 'movimiento' cuentan en el total.
 */
export function classifyRow(values: Partial<Record<SourceColumn, string>>, anyCellText: string[]): RowKind {
  const nonEmpty = anyCellText.filter((t) => t.trim() !== '');
  if (nonEmpty.length === 0) return 'vacia';

  const numId = normalizeHeader(values.numId ?? '');
  const clave = normalizeHeader(values.clave ?? '');
  const aseg = normalizeHeader(values.asegurado || values.nombre || values.apellidoPaterno || '');
  if (numId === 'NUM ID' || clave === 'CLAVE DE IDENTIDAD') return 'encabezado';

  // Una fila con clave e identificador es siempre un movimiento (aunque otra celda contenga números).
  if (numId && clave && !TOTAL_RE.test(numId) && !TOTAL_RE.test(clave)) return 'movimiento';

  // Si hay nombre, solo las celdas de identificación pueden delatar una fila de totales.
  const candidates = aseg ? [values.numId ?? '', values.clave ?? '', values.asegurado || values.nombre || values.apellidoPaterno || ''] : nonEmpty;
  for (const t of candidates) {
    const n = normalizeHeader(t);
    if (TOTAL_RE.test(n) || COUNTER_RE.test(n)) return 'total';
  }
  // Sin identificadores ni nombre: filas de importes acumulados o etiquetas sueltas.
  if (!numId && !clave && !aseg) return 'total';
  return 'movimiento';
}
