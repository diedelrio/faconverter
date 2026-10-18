/**
 * Construcción de las filas de salida (sin dependencias de la biblioteca de Excel):
 *  - Importación: 32 columnas, una fila por movimiento aceptado, en el orden final.
 *  - Log: una fila por movimiento rechazado.
 * La escritura de los archivos está en exportXls.ts y se ejecuta en el worker.
 */
import type { EvalRow, PersonData } from './types';
import { REASONS } from './types';
import type { EvalResult } from './pipeline';
import { execDateIso, type ExecData } from './config';
import { isoToDisplay, parseDateCell } from './dates';
import { sexoLabel } from './validation';
import { fullNameOf } from './names';

export const IMPORT_HEADERS = [
  'No. Póliza Master',
  'Tipo Movimiento',
  'Nombre Cliente',
  'Sucursal',
  'No. Empleado',
  'Forma de Pago',
  'RFC',
  'Nombre',
  'Apellido Paterno',
  'Apellido Materno',
  'Sexo',
  'Fecha Nacimiento',
  'RFC',
  'Nombre',
  'Apellido Paterno',
  'Apellido Materno',
  'Sexo',
  'Fecha Nacimiento',
  'Parentesco',
  'Nombre Plan',
  'Subgrupo',
  'Fecha Alta GDS',
  'Fecha Baja GDS',
  'Fecha Otra Compañía',
  'E-mail',
  'Teléfono',
  'Calle',
  'CP',
  'Estado',
  'Municipio',
  'Colonia',
  'Fecha Inicio Vigencia Certificado',
] as const;

export const LOG_HEADERS = [
  'Fila original',
  'CLAVE DE IDENTIDAD',
  'NUM.ID.',
  'ASEGURADO(S)',
  'DESCRIPCIÓN',
  'FECHA DE MOVIMIENTO',
  'Razón del rechazo',
  'Pareja de compensación',
  'Detalle',
] as const;

export const IMPORT_SHEET = 'Tabla 1';
export const LOG_SHEET = 'Rechazados';
export const DATE_FORMAT = 'dd/mm/yyyy';

/** Celda de salida: texto, fecha (ISO) o vacía. */
export type OutCell = { t: 's'; v: string } | { t: 'd'; iso: string } | null;

const txt = (v: string | undefined | null): OutCell => (v ? { t: 's', v } : null);
const date = (iso: string | null | undefined): OutCell => (iso ? { t: 'd', iso } : null);

export const PARENTESCO_LABEL = { T: 'Titular', C: 'Conyuge', H: 'Hijo' } as const;

function personCells(p: PersonData): OutCell[] {
  return [txt(p.rfc), txt(p.nombre), txt(p.apellidoPaterno), txt(p.apellidoMaterno), txt(sexoLabel(p.sexo)), date(p.fechaNacimiento)];
}

/** Filas de datos (sin encabezado) en el orden final, solo con movimientos aceptados. */
export function buildImportRows(result: EvalResult, exec: ExecData): OutCell[][] {
  const general = [txt(exec.poliza), txt(exec.tipoMovimiento), txt(exec.nombreCliente), txt(exec.sucursal), txt(exec.noEmpleado), txt(exec.formaPago)];
  // Fecha Alta GDS sale de ANTIGÜEDAD DESDE de cada movimiento; las otras dos, de los datos de ejecución.
  const otrasFechas = [date(execDateIso(exec.fechaBajaGds)), date(execDateIso(exec.fechaOtraCompania))];
  const tail = [
    txt(exec.email),
    txt(exec.telefono),
    txt(exec.calle),
    txt(exec.cp),
    txt(exec.estado),
    txt(exec.municipio),
    txt(exec.colonia),
    date(execDateIso(exec.fechaInicioVigenciaCert)),
  ];

  const out: OutCell[][] = [];
  for (const r of result.rows) {
    if (r.status !== 'aceptado') continue;
    const titular = r.titularId ? result.byId.get(r.titularId) : undefined;
    if (!titular || !r.parentesco) throw new Error(`Movimiento aceptado sin titular: fila ${r.m.row}.`);
    const isTitular = r.parentesco === 'T';
    out.push([
      ...general,
      ...personCells(titular.person),
      ...(isTitular ? [null, null, null, null, null, null] : personCells(r.person)),
      txt(PARENTESCO_LABEL[r.parentesco]),
      txt(exec.nombrePlan),
      txt(r.m.original.grupo.text),
      date(r.fechaAltaGds),
      ...otrasFechas,
      ...tail,
    ]);
  }
  return out;
}

function logDetail(r: EvalRow): string {
  switch (r.reason) {
    case 'manual':
    case 'incidencia':
      return r.reasonDetail ?? '';
    case 'noAplicable':
      return 'Descripción clasificada como no aplicable a altas.';
    case 'compensado':
      return 'Alta y baja consecutivas del mismo asegurado.';
    case 'sinTitular':
      return `Sin titular vigente en la clave ${r.clave}.`;
    default:
      return '';
  }
}

/** Filas del log (una por movimiento rechazado), en el orden final. */
export function buildLogRows(result: EvalResult, date1904 = false): OutCell[][] {
  const out: OutCell[][] = [];
  for (const r of result.rows) {
    if (r.status !== 'rechazado') continue;
    const o = r.m.original;
    const fm = parseDateCell(o.fechaMovimiento, date1904);
    out.push([
      txt(String(r.m.row)),
      txt(o.clave.text || r.clave),
      txt(o.numId.text || r.numId),
      txt(fullNameOf(r.m)),
      txt(o.descripcion.text),
      'iso' in fm ? date(fm.iso) : txt(o.fechaMovimiento.text),
      txt(REASONS[r.reason!]),
      txt(r.pairId),
      txt(logDetail(r)),
    ]);
  }
  return out;
}

/** Texto de una celda para mostrar en la vista previa. */
export function displayCell(c: OutCell): string {
  if (!c) return '';
  return c.t === 's' ? c.v : isoToDisplay(c.iso);
}
