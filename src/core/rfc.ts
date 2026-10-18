/**
 * Cálculo del RFC de persona física sin homoclave (10 caracteres: ABCD + AAMMDD).
 *
 * Regla general:
 *   1-2. Primera letra del apellido paterno y su primera vocal interna.
 *   3.   Primera letra del apellido materno.
 *   4.   Primera letra del nombre de pila.
 *   5-10. Fecha de nacimiento AAMMDD.
 *
 * Casos especiales del instructivo del SAT:
 *   - Se ignoran partículas (DE, DEL, LA, LOS, Y, MC, VON...) en apellidos y nombres.
 *   - Con nombre compuesto que empieza por JOSE/MARIA (o J., MA.), se usa el segundo nombre.
 *   - Un solo apellido: dos primeras letras del apellido + dos primeras del nombre.
 *   - Apellido paterno de una o dos letras: inicial paterno + inicial materno + dos primeras del nombre.
 *   - Sin vocal interna en el apellido paterno se usa X.
 *   - La Ñ se sustituye por X.
 *   - Si las cuatro letras forman una palabra altisonante, la última se sustituye por X.
 * La homoclave (3 caracteres) la asigna el SAT y no se calcula.
 */
import { stripAccents } from './normalize';

const PARTICLES = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'MC', 'MAC', 'VON', 'VAN', 'MI', 'DA', 'DAS', 'DER', 'DI', 'DIE', 'DD', 'EL', 'LE', 'LES']);
const COMMON_FIRST = new Set(['JOSE', 'J', 'MARIA', 'MA']);

const INCONVENIENTES = new Set([
  'BUEI', 'BUEY', 'CACA', 'CACO', 'CAGA', 'CAGO', 'CAKA', 'CAKO', 'COGE', 'COJA', 'COJE', 'COJI', 'COJO', 'CULO', 'FETO', 'GUEY',
  'JOTO', 'KACA', 'KACO', 'KAGA', 'KAGO', 'KOGE', 'KOJO', 'KAKA', 'KULO', 'MAME', 'MAMO', 'MEAR', 'MEAS', 'MEON', 'MION', 'MOCO',
  'MULA', 'PEDA', 'PEDO', 'PENE', 'PUTA', 'PUTO', 'QULO', 'RATA', 'RUIN',
]);

/** Palabras significativas: mayúsculas, sin acentos, Ñ→X, sin signos ni partículas. */
function words(s: string): string[] {
  const clean = stripAccents(String(s ?? '').toUpperCase().replace(/Ñ/g, 'X')).replace(/[^A-Z\s]/g, ' ');
  return clean.split(/\s+/).filter((w) => w && !PARTICLES.has(w));
}

function firstName(nombre: string): string {
  const w = words(nombre);
  return w.length > 1 && COMMON_FIRST.has(w[0]) ? w[1] : w[0] ?? '';
}

function firstInternalVowel(s: string): string {
  const m = /[AEIOU]/.exec(s.slice(1));
  return m ? m[0] : 'X';
}

export interface RfcInput {
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  /** ISO aaaa-mm-dd. */
  fechaNacimiento: string;
}

/** Devuelve el RFC sin homoclave, o null si faltan datos (nombre, algún apellido o fecha). */
export function calcularRfcBase(p: RfcInput): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.fechaNacimiento ?? '');
  if (!m) return null;
  const nombre = firstName(p.nombre);
  let paterno = words(p.apellidoPaterno)[0] ?? '';
  let materno = words(p.apellidoMaterno)[0] ?? '';
  if (!nombre || (!paterno && !materno)) return null;
  if (!paterno) [paterno, materno] = [materno, ''];

  let letras: string;
  if (!materno) letras = paterno.slice(0, 2).padEnd(2, 'X') + nombre.slice(0, 2).padEnd(2, 'X');
  else if (paterno.length <= 2) letras = paterno[0] + materno[0] + nombre.slice(0, 2).padEnd(2, 'X');
  else letras = paterno[0] + firstInternalVowel(paterno) + materno[0] + nombre[0];

  if (INCONVENIENTES.has(letras)) letras = letras.slice(0, 3) + 'X';
  return letras + m[1].slice(2) + m[2] + m[3];
}
