/**
 * Compensación de altas y bajas.
 * Dentro de cada grupo (misma CLAVE DE IDENTIDAD y NUM.ID.), recorrido en orden, un alta
 * seguida inmediatamente de una baja forman una pareja. Ninguna fila se reutiliza.
 * Las bajas restantes quedan como "Baja sin alta asociada".
 */
import type { DescriptionKind } from './types';

export interface CompensationItem {
  id: string;
  clave: string;
  numId: string;
  kind: DescriptionKind | null;
}

export interface CompensationResult {
  /** id de movimiento → id de pareja (P-0001...). */
  paired: Map<string, string>;
  /** Bajas que no encontraron alta inmediatamente anterior. */
  orphanBajas: Set<string>;
  pairCount: number;
}

/**
 * @param sorted movimientos ya ordenados por clave, numId y orden original
 *               (los de un mismo grupo quedan contiguos).
 */
export function compensate(sorted: readonly CompensationItem[]): CompensationResult {
  const paired = new Map<string, string>();
  const orphanBajas = new Set<string>();
  let pairCount = 0;

  let start = 0;
  while (start < sorted.length) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].clave === sorted[start].clave && sorted[end].numId === sorted[start].numId) end++;

    let i = start;
    while (i < end) {
      const cur = sorted[i];
      const next = i + 1 < end ? sorted[i + 1] : undefined;
      if (cur.kind === 'alta' && next && next.kind === 'baja') {
        const pid = `P-${String(++pairCount).padStart(4, '0')}`;
        paired.set(cur.id, pid);
        paired.set(next.id, pid);
        i += 2;
        continue;
      }
      if (cur.kind === 'baja') orphanBajas.add(cur.id);
      i++;
    }
    start = end;
  }
  return { paired, orphanBajas, pairCount };
}
