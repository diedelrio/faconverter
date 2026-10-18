/**
 * Asociación familiar: agrupa por CLAVE DE IDENTIDAD los movimientos que siguen vigentes
 * tras la compensación y localiza al titular (NUM.ID. terminado en T) en todo el grupo.
 */
import type { Parentesco } from './types';
import { normalizeKey } from './normalize';

/** Último segmento del NUM.ID. (tras el último guion). */
export function parentescoSegment(numId: string): string {
  const parts = normalizeKey(numId).split('-');
  return parts.length > 1 ? parts[parts.length - 1].trim() : '';
}

export function parseParentesco(numId: string): Parentesco | null {
  const seg = parentescoSegment(numId);
  return seg === 'T' || seg === 'C' || seg === 'H' ? seg : null;
}

/** Parte del NUM.ID. anterior a la secuencia (identificador de la familia). */
export function identifierPrefix(numId: string): string {
  return normalizeKey(numId).split('-')[0] ?? '';
}

export interface FamilyItem {
  id: string;
  clave: string;
  numId: string;
  parentesco: Parentesco | null;
}

export type FamilyOutcome =
  | { kind: 'ok'; titularId: string }
  | { kind: 'sinTitular' }
  | { kind: 'variosTitulares'; titularIds: string[] };

/**
 * Evalúa cada grupo. Devuelve un resultado por id de movimiento.
 * - Grupo sin ningún titular (T) → 'sinTitular' para todos sus movimientos.
 * - Grupo con titulares de distintos NUM.ID. → 'variosTitulares' (incidencia bloqueante).
 * - Varios movimientos de titular con el mismo NUM.ID. se tratan como duplicados en la validación;
 *   aquí se toma ese NUM.ID. como titular del grupo, sin elegir fila.
 */
export function associate(items: readonly FamilyItem[]): Map<string, FamilyOutcome> {
  const groups = new Map<string, FamilyItem[]>();
  for (const it of items) {
    let g = groups.get(it.clave);
    if (!g) groups.set(it.clave, (g = []));
    g.push(it);
  }
  const out = new Map<string, FamilyOutcome>();
  for (const g of groups.values()) {
    const titulares = g.filter((x) => x.parentesco === 'T');
    let outcome: FamilyOutcome;
    if (titulares.length === 0) outcome = { kind: 'sinTitular' };
    else {
      const distinct = new Set(titulares.map((t) => t.numId));
      outcome =
        distinct.size > 1
          ? { kind: 'variosTitulares', titularIds: titulares.map((t) => t.id) }
          : { kind: 'ok', titularId: titulares[0].id };
    }
    for (const x of g) out.set(x.id, outcome);
  }
  return out;
}
