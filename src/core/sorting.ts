/**
 * Ordenación estable: CLAVE DE IDENTIDAD y NUM.ID. ascendentes con comparación natural
 * (los segmentos numéricos se comparan por valor). En empate se conserva el orden original.
 * Los identificadores se mantienen como texto; solo se tokenizan para comparar.
 */

type Token = string | { digits: string };

/** Divide un texto en segmentos de dígitos y de no dígitos. */
export function tokenize(s: string): Token[] {
  const out: Token[] = [];
  const re = /(\d+)|(\D+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[1] !== undefined) out.push({ digits: m[1].replace(/^0+(?=\d)/, '') });
    else out.push(m[2].toUpperCase());
  }
  return out;
}

function compareDigits(a: string, b: string): number {
  // Sin ceros iniciales: más dígitos = mayor valor; a igual longitud, comparación lexicográfica.
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareTokens(a: Token[], b: Token[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    const xd = typeof x !== 'string', yd = typeof y !== 'string';
    if (xd && yd) {
      const c = compareDigits(x.digits, y.digits);
      if (c) return c;
    } else if (!xd && !yd) {
      if (x !== y) return x < y ? -1 : 1;
    } else {
      // Los números van antes que el texto.
      return xd ? -1 : 1;
    }
  }
  return a.length - b.length;
}

/** Comparación natural de dos textos. Valores numéricamente iguales ("001" y "1") se desempatan por el texto. */
export function naturalCompare(a: string, b: string): number {
  const c = compareTokens(tokenize(a), tokenize(b));
  if (c) return c;
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface SortItem {
  clave: string;
  numId: string;
  seq: number;
}

const tokenCache = new Map<string, Token[]>();
function cachedTokens(s: string): Token[] {
  let t = tokenCache.get(s);
  if (!t) {
    if (tokenCache.size > 500000) tokenCache.clear();
    t = tokenize(s);
    tokenCache.set(s, t);
  }
  return t;
}

function cmpKey(a: string, b: string): number {
  if (a === b) return 0;
  const c = compareTokens(cachedTokens(a), cachedTokens(b));
  if (c) return c;
  return a < b ? -1 : 1;
}

/** Devuelve una copia ordenada (estable) por clave, numId y orden original. */
export function sortMovements<T extends SortItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => cmpKey(a.clave, b.clave) || cmpKey(a.numId, b.numId) || a.seq - b.seq);
}
