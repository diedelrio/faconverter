/**
 * Tipos compartidos del dominio. Los valores originales del archivo se guardan
 * siempre separados de los valores corregidos o complementados.
 */

/** Columnas canónicas del archivo de entrada. */
export type SourceColumn =
  | 'numId'
  | 'clave'
  | 'asegurado'
  | 'nombre'
  | 'apellidoPaterno'
  | 'apellidoMaterno'
  | 'sexo'
  | 'fechaNacimiento'
  | 'fechaMovimiento'
  | 'fechaInicioVig'
  | 'antiguedad'
  | 'descripcion'
  | 'endoso'
  | 'status'
  | 'grupo';

/** Valor de una celda tal como se leyó del Excel. */
export interface CellValue {
  /** Texto mostrado en Excel (o el valor convertido a texto). */
  text: string;
  /** Número de serie si la celda era numérica (fechas de Excel incluidas). */
  num?: number;
  /** El valor no venía en el archivo: se aplicó el valor por defecto definido por el usuario. */
  defaulted?: boolean;
}

/** Movimiento leído del origen. Inmutable tras la lectura. */
export interface Movement {
  /** Identificador interno estable (no cambia al ordenar, filtrar o corregir). */
  id: string;
  /** Número de fila original en la hoja (1 = primera fila de Excel). */
  row: number;
  /** Posición de lectura (0..n-1), usada para conservar el orden en empates. */
  seq: number;
  /** Valores originales por columna canónica. */
  original: Record<SourceColumn, CellValue>;
}

export type Parentesco = 'T' | 'C' | 'H';
export type DescriptionKind = 'alta' | 'baja' | 'excluir';
export type Provenance = 'origen' | 'propuesta' | 'complemento' | 'manual' | 'calculado';

/** Campos de persona que pueden corregirse manualmente. */
export type PersonField =
  | 'nombre'
  | 'apellidoPaterno'
  | 'apellidoMaterno'
  | 'rfc'
  | 'fechaNacimiento'
  | 'sexo';

/** Campos clave que pueden corregirse para resolver incidencias. */
export type KeyField = 'clave' | 'numId';

/** Campos del movimiento que pueden corregirse (ANTIGÜEDAD DESDE alimenta Fecha Alta GDS). */
export type MovementField = 'antiguedad';

export type CorrectableField = PersonField | KeyField | MovementField;

/** Correcciones manuales de un movimiento, vinculadas a su id interno. */
export type Correction = Partial<Record<CorrectableField, string>>;

/** Registro de la tabla complementaria. */
export interface ComplementRecord {
  index: number;
  row: number;
  numId: string;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  /** Fecha ISO yyyy-mm-dd, o '' si no hay; `fechaInvalida` conserva el texto si no se pudo leer. */
  fechaNacimiento: string;
  fechaInvalida?: string;
  rfc: string;
}

export const REASONS = {
  compensado: 'Asegurado dado de baja',
  sinTitular: 'Sin titular asociado',
  bajaSinAlta: 'Baja sin alta asociada',
  noAplicable: 'Movimiento no aplicable a altas',
  manual: 'Exclusión manual',
  incidencia: 'Rechazado por incidencia',
} as const;

export type ReasonKey = keyof typeof REASONS;
export type ReasonText = (typeof REASONS)[ReasonKey];

/** Orden fijo de las razones (determina también el color en los gráficos). */
export const REASON_ORDER: ReasonKey[] = ['compensado', 'sinTitular', 'bajaSinAlta', 'noAplicable', 'manual', 'incidencia'];

/** Exclusión decidida por el usuario: manual con justificación, o rechazo por incidencia (motivo = la incidencia). */
export interface Exclusion {
  reason: 'manual' | 'incidencia';
  detail: string;
}

export type IssueCode =
  | 'claveAusente'
  | 'duplicado'
  | 'variosTitulares'
  | 'parentescoDesconocido'
  | 'fechaInvalida'
  | 'sexoInvalido'
  | 'datosIncompletos'
  | 'rfcInvalido'
  | 'descripcionSinClasificar';

export type WarningCode =
  | 'nombrePendiente'
  | 'sinFechaNacimiento'
  | 'sinRfc'
  | 'subgrupoVacio'
  | 'identificadorDistintoTitular'
  | 'fechaOrigenInvalida'
  | 'complementoPorNombre'
  | 'complementoAmbiguo'
  | 'rfcNoCoincide'
  | 'sinFechaAltaGds';

export interface RowIssue {
  code: IssueCode;
  message: string;
}

export interface RowWarning {
  code: WarningCode;
  message: string;
}

export type RowStatus = 'aceptado' | 'rechazado' | 'bloqueado';

/** Datos efectivos de una persona tras aplicar complemento y correcciones. */
export interface PersonData {
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  rfc: string;
  /** ISO yyyy-mm-dd o ''. */
  fechaNacimiento: string;
  /** Texto original no interpretable como fecha (incidencia). */
  fechaNacimientoInvalida?: string;
  /** 'M' | 'F' | '' (vacío si no reconocido). */
  sexo: '' | 'M' | 'F';
  sexoOriginal: string;
  /** RFC sin homoclave calculado a partir de nombre, apellidos y fecha (si hay datos). */
  rfcCalculado?: string;
  provenance: Record<PersonField, Provenance>;
}

/** Resultado de evaluar un movimiento. */
export interface EvalRow {
  m: Movement;
  /** Claves efectivas (originales o corregidas), normalizadas en espacios. */
  clave: string;
  numId: string;
  parentesco: Parentesco | null;
  parentescoRaw: string;
  descKind: DescriptionKind | null;
  descNorm: string;
  person: PersonData;
  /** Fecha Alta GDS (ISO) tomada de ANTIGÜEDAD DESDE, o ''. */
  fechaAltaGds: string;
  fechaAltaGdsInvalida?: string;
  nameReviewed: boolean;
  status: RowStatus;
  reason?: ReasonKey;
  reasonDetail?: string;
  pairId?: string;
  /** id del movimiento titular asociado (para familiares y para el propio titular). */
  titularId?: string;
  issues: RowIssue[];
  warnings: RowWarning[];
  /** Registro complementario aplicado (índice), si hay. */
  complementIndex?: number;
  /** Candidatos ambiguos de la tabla complementaria pendientes de confirmación. */
  complementCandidates?: number[];
  complementMatch?: 'numId' | 'nombre';
  /** Posición en el orden final (clave, numId, orden original). */
  order: number;
}

export interface GlobalIssue {
  code: 'datosEjecucion' | 'limiteXls' | 'sinMovimientos';
  message: string;
}
