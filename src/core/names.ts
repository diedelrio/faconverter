/**
 * Propuesta de separación del nombre completo. Siempre queda pendiente de revisión.
 * Por defecto los dos últimos términos son los apellidos. Las partículas (DE, DEL, LA...)
 * se agrupan con el término siguiente para no partir apellidos compuestos como "DE LA CRUZ".
 */
import { collapseSpaces, stripAccents } from './normalize';
import type { Movement } from './types';

/**
 * Nombre completo del movimiento para mostrar, buscar y registrar en el log: ASEGURADO(S) si viene;
 * si el archivo trae el nombre separado, la unión de nombre y apellidos.
 */
export function fullNameOf(m: Movement): string {
  const o = m.original;
  return o.asegurado.text || collapseSpaces([o.nombre.text, o.apellidoPaterno.text, o.apellidoMaterno.text].join(' '));
}

/** El movimiento trae el nombre ya separado en columnas propias. */
export function hasSeparateName(m: Movement): boolean {
  const o = m.original;
  return Boolean(o.nombre.text || o.apellidoPaterno.text || o.apellidoMaterno.text);
}

export type NameOrder = 'nombres-apellidos' | 'apellidos-nombres';

export interface NameSplit {
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
}

const PARTICLES = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'SAN', 'SANTA', 'MC', 'MAC', 'VAN', 'VON', 'DA', 'DI', 'DO', 'DOS']);

/** Agrupa las palabras en términos: las partículas se unen al término que les sigue. */
export function nameTerms(full: string): string[] {
  const words = collapseSpaces(full).split(' ').filter(Boolean);
  const terms: string[] = [];
  let pending: string[] = [];
  for (const w of words) {
    const key = stripAccents(w).toUpperCase().replace(/\.$/, '');
    if (PARTICLES.has(key)) {
      pending.push(w);
      continue;
    }
    terms.push([...pending, w].join(' '));
    pending = [];
  }
  if (pending.length) {
    if (terms.length) terms[terms.length - 1] += ' ' + pending.join(' ');
    else terms.push(pending.join(' '));
  }
  return terms;
}

export function proposeSplit(full: string, order: NameOrder = 'nombres-apellidos'): NameSplit {
  const t = nameTerms(full);
  if (t.length === 0) return { nombre: '', apellidoPaterno: '', apellidoMaterno: '' };
  if (t.length === 1) return { nombre: t[0], apellidoPaterno: '', apellidoMaterno: '' };
  if (order === 'apellidos-nombres') {
    if (t.length === 2) return { apellidoPaterno: t[0], nombre: t[1], apellidoMaterno: '' };
    return { apellidoPaterno: t[0], apellidoMaterno: t[1], nombre: t.slice(2).join(' ') };
  }
  if (t.length === 2) return { nombre: t[0], apellidoPaterno: t[1], apellidoMaterno: '' };
  return {
    nombre: t.slice(0, -2).join(' '),
    apellidoPaterno: t[t.length - 2],
    apellidoMaterno: t[t.length - 1],
  };
}

/** Clave para comparar nombres completos (búsqueda por nombre en la tabla complementaria). */
export function nameKey(s: string): string {
  return collapseSpaces(stripAccents(s).toUpperCase().replace(/[^A-Z0-9Ñ ]+/g, ' '));
}
