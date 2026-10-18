/**
 * Validación y correcciones de datos de persona.
 * Precedencia de cada dato: corrección manual > tabla complementaria > origen (o propuesta).
 * Los valores originales del movimiento nunca se modifican.
 */
import type {
  ComplementRecord,
  Correction,
  Movement,
  PersonData,
  PersonField,
  Provenance,
  RowIssue,
  RowWarning,
} from './types';
import { parseDateCell, parseDateText } from './dates';
import { collapseSpaces, normalizeHeader } from './normalize';
import { hasSeparateName, proposeSplit, type NameOrder } from './names';
import { calcularRfcBase } from './rfc';

export interface StrictOptions {
  /** RFC obligatorio en cada registro aceptado. */
  rfc: boolean;
  /** Fecha de nacimiento obligatoria. */
  fechaNacimiento: boolean;
  /** Separación de nombre revisada obligatoria. */
  nombres: boolean;
}

export const DEFAULT_STRICT: StrictOptions = { rfc: false, fechaNacimiento: false, nombres: false };

export const RFC_RE = /^[A-ZÑ&]{4}\d{6}([A-Z0-9]{3})?$/;

/** Normaliza el sexo del origen o de una corrección. */
export function parseSexo(raw: string): '' | 'M' | 'F' {
  const n = normalizeHeader(raw);
  if (n === 'M' || n === 'MASCULINO' || n === 'HOMBRE') return 'M';
  if (n === 'F' || n === 'FEMENINO' || n === 'MUJER') return 'F';
  return '';
}

export function sexoLabel(s: '' | 'M' | 'F'): string {
  return s === 'M' ? 'Masculino' : s === 'F' ? 'Femenino' : '';
}

export function normalizeRfc(s: string): string {
  return String(s ?? '').toUpperCase().replace(/[\s-]+/g, '');
}

/** Construye los datos efectivos de la persona de un movimiento. */
export function buildPerson(
  m: Movement,
  opts: { nameOrder: NameOrder; date1904: boolean; complement?: ComplementRecord; correction?: Correction },
): PersonData {
  // Si el archivo trae el nombre separado se usa tal cual; si no, se propone la separación de ASEGURADO(S).
  const separate = hasSeparateName(m);
  const o = m.original;
  const split = separate
    ? { nombre: collapseSpaces(o.nombre.text), apellidoPaterno: collapseSpaces(o.apellidoPaterno.text), apellidoMaterno: collapseSpaces(o.apellidoMaterno.text) }
    : proposeSplit(o.asegurado.text, opts.nameOrder);
  const nameProv: Provenance = separate ? 'origen' : 'propuesta';
  const prov: Record<PersonField, Provenance> = {
    nombre: nameProv,
    apellidoPaterno: nameProv,
    apellidoMaterno: nameProv,
    rfc: 'origen',
    fechaNacimiento: 'origen',
    sexo: 'origen',
  };
  const p: PersonData = {
    nombre: split.nombre,
    apellidoPaterno: split.apellidoPaterno,
    apellidoMaterno: split.apellidoMaterno,
    rfc: '',
    fechaNacimiento: '',
    sexo: parseSexo(m.original.sexo.text),
    sexoOriginal: m.original.sexo.text,
    provenance: prov,
  };
  const fn = parseDateCell(m.original.fechaNacimiento, opts.date1904);
  if ('iso' in fn) p.fechaNacimiento = fn.iso;
  else if ('invalid' in fn) p.fechaNacimientoInvalida = fn.invalid;

  const c = opts.complement;
  if (c) {
    if (c.nombre || c.apellidoPaterno || c.apellidoMaterno) {
      p.nombre = collapseSpaces(c.nombre);
      p.apellidoPaterno = collapseSpaces(c.apellidoPaterno);
      p.apellidoMaterno = collapseSpaces(c.apellidoMaterno);
      prov.nombre = prov.apellidoPaterno = prov.apellidoMaterno = 'complemento';
    }
    if (c.fechaNacimiento) {
      p.fechaNacimiento = c.fechaNacimiento;
      p.fechaNacimientoInvalida = undefined;
      prov.fechaNacimiento = 'complemento';
    }
    if (c.rfc) {
      p.rfc = normalizeRfc(c.rfc);
      prov.rfc = 'complemento';
    }
  }

  const k = opts.correction;
  if (k) {
    for (const f of ['nombre', 'apellidoPaterno', 'apellidoMaterno'] as const) {
      if (k[f] !== undefined) {
        p[f] = collapseSpaces(k[f]!);
        prov[f] = 'manual';
      }
    }
    if (k.rfc !== undefined) {
      p.rfc = normalizeRfc(k.rfc);
      prov.rfc = 'manual';
    }
    if (k.fechaNacimiento !== undefined) {
      const v = k.fechaNacimiento.trim();
      const iso = v ? parseDateText(v) : '';
      prov.fechaNacimiento = 'manual';
      if (iso === null) {
        p.fechaNacimiento = '';
        p.fechaNacimientoInvalida = v;
      } else {
        p.fechaNacimiento = iso;
        p.fechaNacimientoInvalida = undefined;
      }
    }
    if (k.sexo !== undefined) {
      p.sexo = parseSexo(k.sexo);
      p.sexoOriginal = k.sexo;
      prov.sexo = 'manual';
    }
  }

  // RFC sin homoclave: se calcula cuando no viene del complemento ni de una corrección manual.
  p.rfcCalculado = calcularRfcBase(p) ?? undefined;
  if (!p.rfc && k?.rfc === undefined && p.rfcCalculado) {
    p.rfc = p.rfcCalculado;
    prov.rfc = 'calculado';
  }
  return p;
}

/** Fecha Alta GDS: ANTIGÜEDAD DESDE del movimiento (o su corrección manual). */
export function resolveAntiguedad(m: Movement, correction: Correction | undefined, date1904: boolean): { iso: string; invalid?: string } {
  if (correction?.antiguedad !== undefined) {
    const v = correction.antiguedad.trim();
    if (!v) return { iso: '' };
    const iso = parseDateText(v);
    return iso ? { iso } : { iso: '', invalid: v };
  }
  const d = parseDateCell(m.original.antiguedad, date1904);
  if ('iso' in d) return { iso: d.iso };
  if ('invalid' in d) return { iso: '', invalid: d.invalid };
  return { iso: '' };
}

export function nameNeedsReview(p: PersonData): boolean {
  return p.provenance.nombre === 'propuesta' && p.provenance.apellidoPaterno === 'propuesta' && p.provenance.apellidoMaterno === 'propuesta';
}

/** Valida los datos de una persona que se va a exportar. */
export function validatePerson(
  p: PersonData,
  m: Movement,
  reviewed: boolean,
  strict: StrictOptions,
  date1904: boolean,
): { issues: RowIssue[]; warnings: RowWarning[] } {
  const issues: RowIssue[] = [];
  const warnings: RowWarning[] = [];

  const missing: string[] = [];
  if (!p.nombre) missing.push('nombre');
  if (!p.apellidoPaterno) missing.push('apellido paterno');
  if (missing.length) issues.push({ code: 'datosIncompletos', message: `Falta ${missing.join(' y ')}.` });

  if (!p.sexo) {
    issues.push({
      code: 'sexoInvalido',
      message: p.sexoOriginal ? `valor "${p.sexoOriginal}" (se espera M o F).` : 'SEXO vacío.',
    });
  }

  if (p.fechaNacimientoInvalida !== undefined) {
    issues.push({ code: 'fechaInvalida', message: `fecha de nacimiento "${p.fechaNacimientoInvalida}".` });
  } else if (!p.fechaNacimiento) {
    if (strict.fechaNacimiento) issues.push({ code: 'datosIncompletos', message: 'Falta la fecha de nacimiento.' });
    else warnings.push({ code: 'sinFechaNacimiento', message: 'se exporta vacía.' });
  }

  if (p.rfc) {
    if (!RFC_RE.test(p.rfc)) issues.push({ code: 'rfcInvalido', message: `"${p.rfc}".` });
    else if (p.provenance.rfc !== 'calculado' && p.rfcCalculado && p.rfc.slice(0, 10) !== p.rfcCalculado) {
      warnings.push({ code: 'rfcNoCoincide', message: `${p.rfc} frente al calculado ${p.rfcCalculado}.` });
    }
  } else if (strict.rfc) issues.push({ code: 'datosIncompletos', message: 'Falta el RFC (no se pudo calcular: revise nombre, apellidos y fecha de nacimiento).' });
  else warnings.push({ code: 'sinRfc', message: 'no se pudo calcular (falta fecha de nacimiento o nombre); se exporta vacío.' });

  if (nameNeedsReview(p) && !reviewed) {
    if (strict.nombres) issues.push({ code: 'datosIncompletos', message: 'Separación de nombre pendiente de revisión.' });
    else warnings.push({ code: 'nombrePendiente', message: 'propuesta a partir del nombre completo.' });
  }

  if (!m.original.grupo.text) warnings.push({ code: 'subgrupoVacio', message: 'Subgrupo se exporta vacío.' });

  const fm = parseDateCell(m.original.fechaMovimiento, date1904);
  if ('invalid' in fm) warnings.push({ code: 'fechaOrigenInvalida', message: `"${fm.invalid}".` });

  return { issues, warnings };
}
