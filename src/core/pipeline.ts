/**
 * Orquestador de la clasificación. Función pura: a partir de los movimientos originales y de
 * las decisiones del usuario (correcciones, exclusiones, clasificación de descripciones, etc.)
 * recalcula el estado de cada movimiento, los conteos y las incidencias.
 *
 * Orden de reglas (cada movimiento rechazado tiene una única razón principal):
 *   1. Exclusiones explícitas: manual con justificación y descripciones marcadas como no aplicables.
 *   2. Ordenación estable por CLAVE DE IDENTIDAD, NUM.ID. y orden original.
 *   3. Compensación de altas y bajas → "Asegurado dado de baja"; bajas restantes → "Baja sin alta asociada".
 *   4. Asociación con el titular → "Sin titular asociado".
 *   5. Validación de los movimientos restantes (incidencias bloqueantes y advertencias).
 */
import type {
  ComplementRecord,
  Correction,
  DescriptionKind,
  EvalRow,
  Exclusion,
  GlobalIssue,
  IssueCode,
  Movement,
  ReasonKey,
  WarningCode,
} from './types';
import { REASON_ORDER } from './types';
import { describeKind, normalizeDescription, normalizeKey } from './normalize';
import { sortMovements } from './sorting';
import { compensate } from './compensation';
import { associate, identifierPrefix, parentescoSegment, parseParentesco } from './family';
import { buildPerson, DEFAULT_STRICT, nameNeedsReview, resolveAntiguedad, validatePerson, type StrictOptions } from './validation';
import { fullNameOf, nameKey, type NameOrder } from './names';
import { validateExecData, type ExecData, type ExecIssue } from './config';

export const XLS_MAX_DATA_ROWS = 65535;

export interface ComplementState {
  records: ComplementRecord[];
  byNumId: Map<string, ComplementRecord[]>;
  byName: Map<string, ComplementRecord[]>;
}

export interface EvalInput {
  movements: readonly Movement[];
  date1904: boolean;
  corrections: ReadonlyMap<string, Correction>;
  /** id → exclusión decidida por el usuario (manual o por incidencia) con su motivo. */
  exclusions: ReadonlyMap<string, Exclusion>;
  nameReviewed: ReadonlySet<string>;
  /** Clasificación de descripciones definida por el usuario (descripción normalizada → tipo). */
  descKinds: Readonly<Record<string, DescriptionKind>>;
  nameOrder: NameOrder;
  complement: ComplementState | null;
  /** Búsqueda por nombre en la tabla complementaria cuando no hay coincidencia por NUM.ID. */
  complementByName: boolean;
  /** Elección explícita del registro complementario (índice) o null para no aplicar ninguno. */
  complementChoices: ReadonlyMap<string, number | null>;
  strict: StrictOptions;
  exec: ExecData | null;
}

export interface DescriptionSummary {
  descNorm: string;
  sample: string;
  count: number;
  kind: DescriptionKind | null;
  /** true si la clasificación viene de las reglas por defecto. */
  builtIn: boolean;
}

export interface EvalResult {
  /** Filas en el orden final (CLAVE DE IDENTIDAD, NUM.ID., orden original). */
  rows: EvalRow[];
  byId: Map<string, EvalRow>;
  counts: {
    total: number;
    aceptados: number;
    rechazados: number;
    bloqueados: number;
    byReason: Record<ReasonKey, number>;
  };
  issueCounts: Partial<Record<IssueCode, number>>;
  warningCounts: Partial<Record<WarningCode, number>>;
  globalIssues: GlobalIssue[];
  execIssues: ExecIssue[];
  descriptions: DescriptionSummary[];
  pairCount: number;
  /** Se puede finalizar: sin incidencias bloqueantes ni movimientos sin clasificar. */
  canFinish: boolean;
}

export function defaultInput(movements: readonly Movement[]): EvalInput {
  return {
    movements,
    date1904: false,
    corrections: new Map(),
    exclusions: new Map(),
    nameReviewed: new Set(),
    descKinds: {},
    nameOrder: 'nombres-apellidos',
    complement: null,
    complementByName: false,
    complementChoices: new Map(),
    strict: DEFAULT_STRICT,
    exec: null,
  };
}

function pickComplement(
  m: Movement,
  numId: string,
  input: EvalInput,
): { record?: ComplementRecord; candidates?: number[]; match?: 'numId' | 'nombre' } {
  const c = input.complement;
  if (!c) return {};
  if (input.complementChoices.has(m.id)) {
    const idx = input.complementChoices.get(m.id);
    return idx === null || idx === undefined ? {} : { record: c.records[idx], match: 'numId' };
  }
  const byId = numId ? c.byNumId.get(numId) : undefined;
  if (byId?.length === 1) return { record: byId[0], match: 'numId' };
  if (byId && byId.length > 1) return { candidates: byId.map((r) => r.index) };
  if (input.complementByName) {
    const byName = c.byName.get(nameKey(fullNameOf(m)));
    if (byName?.length === 1) return { record: byName[0], match: 'nombre' };
    if (byName && byName.length > 1) return { candidates: byName.map((r) => r.index) };
  }
  return {};
}

export function evaluate(input: EvalInput): EvalResult {
  const rows: EvalRow[] = input.movements.map((m) => {
    const corr = input.corrections.get(m.id);
    const clave = normalizeKey(corr?.clave ?? m.original.clave.text);
    const numId = normalizeKey(corr?.numId ?? m.original.numId.text);
    const descNorm = normalizeDescription(m.original.descripcion.text);
    const comp = pickComplement(m, numId, input);
    const person = buildPerson(m, {
      nameOrder: input.nameOrder,
      date1904: input.date1904,
      complement: comp.record,
      correction: corr,
    });
    const alta = resolveAntiguedad(m, corr, input.date1904);
    return {
      m,
      clave,
      numId,
      parentesco: parseParentesco(numId),
      parentescoRaw: parentescoSegment(numId),
      descKind: describeKind(descNorm, input.descKinds),
      descNorm,
      person,
      fechaAltaGds: alta.iso,
      fechaAltaGdsInvalida: alta.invalid,
      nameReviewed: input.nameReviewed.has(m.id) || !nameNeedsReview(person),
      status: 'aceptado',
      issues: [],
      warnings: [],
      complementIndex: comp.record?.index,
      complementCandidates: comp.candidates,
      complementMatch: comp.match,
      order: 0,
    } satisfies EvalRow;
  });

  // 1. Exclusiones explícitas.
  for (const r of rows) {
    const exc = input.exclusions.get(r.m.id);
    if (exc !== undefined) {
      r.status = 'rechazado';
      r.reason = exc.reason;
      r.reasonDetail = exc.detail;
    } else if (r.descKind === 'excluir') {
      r.status = 'rechazado';
      r.reason = 'noAplicable';
      r.reasonDetail = r.m.original.descripcion.text;
    }
  }

  // 2. Orden final.
  const sorted = sortMovements(rows.map((r) => ({ clave: r.clave, numId: r.numId, seq: r.m.seq, r }))).map((x) => x.r);
  sorted.forEach((r, i) => (r.order = i));

  const pending = (r: EvalRow) => r.status !== 'rechazado';
  for (const r of sorted) {
    if (!pending(r)) continue;
    if (!r.clave || !r.numId) {
      const falta = [!r.clave && 'CLAVE DE IDENTIDAD', !r.numId && 'NUM.ID.'].filter(Boolean).join(' y ');
      r.issues.push({ code: 'claveAusente', message: `Falta ${falta}.` });
    }
    if (r.descKind === null) {
      r.issues.push({
        code: 'descripcionSinClasificar',
        message: `"${r.m.original.descripcion.text || '(vacía)'}".`,
      });
    }
  }
  const keyed = (r: EvalRow) => pending(r) && Boolean(r.clave && r.numId);

  // 3. Compensación de altas y bajas.
  const comp = compensate(sorted.filter(keyed).map((r) => ({ id: r.m.id, clave: r.clave, numId: r.numId, kind: r.descKind })));
  const byId = new Map(rows.map((r) => [r.m.id, r]));
  for (const [id, pid] of comp.paired) {
    const r = byId.get(id)!;
    r.status = 'rechazado';
    r.reason = 'compensado';
    r.pairId = pid;
  }
  for (const id of comp.orphanBajas) {
    const r = byId.get(id)!;
    r.status = 'rechazado';
    r.reason = 'bajaSinAlta';
  }

  // 4. Asociación con el titular (sobre los movimientos que siguen vigentes).
  const remaining = sorted.filter(keyed);
  const fam = associate(remaining.map((r) => ({ id: r.m.id, clave: r.clave, numId: r.numId, parentesco: r.parentesco })));
  for (const r of remaining) {
    const o = fam.get(r.m.id)!;
    if (o.kind === 'sinTitular') {
      // Un movimiento sin clasificar sigue bloqueado: su razón dependería de la clasificación.
      if (r.descKind === null) continue;
      r.status = 'rechazado';
      r.reason = 'sinTitular';
      r.issues = [];
    } else if (o.kind === 'variosTitulares') {
      const ids = o.titularIds.map((id) => byId.get(id)!);
      r.issues.push({
        code: 'variosTitulares',
        message: `titulares ${[...new Set(ids.map((t) => t.numId))].join(', ')} en la clave ${r.clave}.`,
      });
    } else {
      r.titularId = o.titularId;
    }
  }

  // 5. Validación de los movimientos restantes.
  const stillPending = sorted.filter(pending);
  const keyCount = new Map<string, number>();
  for (const r of stillPending) {
    if (!r.clave || !r.numId) continue;
    const k = `${r.clave}\u0000${r.numId}`;
    keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
  }
  for (const r of stillPending) {
    if (r.clave && r.numId && (keyCount.get(`${r.clave}\u0000${r.numId}`) ?? 0) > 1) {
      r.issues.push({
        code: 'duplicado',
        message: `${r.numId} sigue vigente ${keyCount.get(`${r.clave}\u0000${r.numId}`)} veces después de la compensación.`,
      });
    }
    if (r.numId && r.parentesco === null) {
      r.issues.push({
        code: 'parentescoDesconocido',
        message: `"${r.parentescoRaw || '(sin segmento)'}" en ${r.numId} (se esperaba T, C o H).`,
      });
    }
    const v = validatePerson(r.person, r.m, r.nameReviewed, input.strict, input.date1904);
    r.issues.push(...v.issues);
    r.warnings.push(...v.warnings);
    if (r.fechaAltaGdsInvalida !== undefined) {
      r.issues.push({ code: 'fechaInvalida', message: `ANTIGÜEDAD DESDE (Fecha Alta GDS) "${r.fechaAltaGdsInvalida}".` });
    } else if (!r.fechaAltaGds) {
      r.warnings.push({ code: 'sinFechaAltaGds', message: 'Fecha Alta GDS se exporta vacía.' });
    }
    if (r.complementCandidates?.length) {
      r.warnings.push({
        code: 'complementoAmbiguo',
        message: `${r.complementCandidates.length} registros complementarios coinciden: confirme cuál aplicar.`,
      });
    }
    if (r.complementMatch === 'nombre' && !input.complementChoices.has(r.m.id)) {
      r.warnings.push({ code: 'complementoPorNombre', message: 'verifique que corresponde a la persona correcta.' });
    }
    if (r.titularId && r.titularId !== r.m.id) {
      const t = byId.get(r.titularId)!;
      if (identifierPrefix(t.numId) !== identifierPrefix(r.numId)) {
        r.warnings.push({
          code: 'identificadorDistintoTitular',
          message: `El identificador ${identifierPrefix(r.numId)} no coincide con el del titular (${identifierPrefix(t.numId)}).`,
        });
      }
    }
    r.status = r.issues.length ? 'bloqueado' : 'aceptado';
  }

  // Conteos.
  const byReason = Object.fromEntries(REASON_ORDER.map((k) => [k, 0])) as Record<ReasonKey, number>;
  const issueCounts: Partial<Record<IssueCode, number>> = {};
  const warningCounts: Partial<Record<WarningCode, number>> = {};
  let aceptados = 0, rechazados = 0, bloqueados = 0;
  for (const r of sorted) {
    if (r.status === 'aceptado') aceptados++;
    else if (r.status === 'rechazado') {
      rechazados++;
      byReason[r.reason!]++;
    } else bloqueados++;
    for (const i of r.issues) issueCounts[i.code] = (issueCounts[i.code] ?? 0) + 1;
    for (const w of r.warnings) warningCounts[w.code] = (warningCounts[w.code] ?? 0) + 1;
  }

  const descMap = new Map<string, DescriptionSummary>();
  for (const r of rows) {
    let d = descMap.get(r.descNorm);
    if (!d) {
      d = {
        descNorm: r.descNorm,
        sample: r.m.original.descripcion.text,
        count: 0,
        kind: r.descKind,
        builtIn: !(r.descNorm in input.descKinds) && r.descKind !== null,
      };
      descMap.set(r.descNorm, d);
    }
    d.count++;
  }

  const globalIssues: GlobalIssue[] = [];
  if (aceptados > XLS_MAX_DATA_ROWS) {
    globalIssues.push({
      code: 'limiteXls',
      message: `Hay ${aceptados.toLocaleString('es-MX')} movimientos aceptados; el formato .xls admite como máximo ${XLS_MAX_DATA_ROWS.toLocaleString('es-MX')}.`,
    });
  }
  if (rows.length === 0) globalIssues.push({ code: 'sinMovimientos', message: 'El archivo no contiene movimientos.' });

  const result: EvalResult = {
    rows: sorted,
    byId,
    counts: { total: rows.length, aceptados, rechazados, bloqueados, byReason },
    issueCounts,
    warningCounts,
    globalIssues,
    execIssues: [],
    descriptions: [...descMap.values()].sort((a, b) => b.count - a.count),
    pairCount: comp.pairCount,
    canFinish: false,
  };
  return applyExec(result, input.exec);
}

/**
 * Añade la validación de los datos de ejecución a un resultado ya calculado. Es barata, de modo
 * que editar el formulario no obliga a reclasificar todos los movimientos.
 */
export function applyExec(r: EvalResult, exec: ExecData | null): EvalResult {
  const execIssues = exec ? validateExecData(exec) : [];
  const globalIssues = r.globalIssues.filter((g) => g.code !== 'datosEjecucion');
  if (execIssues.length) {
    globalIssues.unshift({ code: 'datosEjecucion', message: `Datos de ejecución incompletos o inválidos (${execIssues.length}).` });
  }
  const { total, aceptados, rechazados, bloqueados } = r.counts;
  return {
    ...r,
    execIssues,
    globalIssues,
    canFinish: bloqueados === 0 && globalIssues.length === 0 && aceptados + rechazados === total,
  };
}
