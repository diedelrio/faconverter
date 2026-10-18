/**
 * Rechazo de movimientos con incidencias para poder avanzar sin corregirlas.
 * El motivo del log se completa con la razón de la incidencia. Se puede rechazar solo el
 * movimiento o la familia/certificado completo (todos los movimientos vigentes con la misma
 * CLAVE DE IDENTIDAD).
 */
import type { EvalRow, Exclusion, IssueCode } from './types';
import type { EvalResult } from './pipeline';

export const ISSUE_LABELS: Record<IssueCode, string> = {
  claveAusente: 'Clave o identificador ausente',
  duplicado: 'Duplicado no resuelto',
  variosTitulares: 'Varios titulares en una familia',
  parentescoDesconocido: 'Parentesco desconocido',
  fechaInvalida: 'Fecha inválida',
  sexoInvalido: 'Sexo no reconocido',
  datosIncompletos: 'Datos obligatorios incompletos',
  rfcInvalido: 'RFC con formato inválido',
  descripcionSinClasificar: 'Descripción sin clasificar',
};

export type RejectScope = 'movimiento' | 'familia';

/** Motivo legible a partir de las incidencias del movimiento. */
export function incidentDetail(r: EvalRow): string {
  return r.issues.map((i) => `${ISSUE_LABELS[i.code]}: ${i.message}`).join(' | ');
}

/**
 * Calcula las exclusiones a aplicar. Solo se tocan movimientos todavía no rechazados, para no
 * cambiar la razón principal de los rechazados automáticamente.
 */
export function planIncidentRejection(result: EvalResult, ids: readonly string[], scope: RejectScope): Map<string, Exclusion> {
  const out = new Map<string, Exclusion>();
  const withIssues = ids.map((id) => result.byId.get(id)).filter((r): r is EvalRow => Boolean(r && r.status === 'bloqueado'));

  for (const r of withIssues) out.set(r.m.id, { reason: 'incidencia', detail: incidentDetail(r) });
  if (scope === 'movimiento') return out;

  // Familia/certificado: primer movimiento con incidencia de cada clave como referencia.
  const origin = new Map<string, EvalRow>();
  for (const r of withIssues) if (r.clave && !origin.has(r.clave)) origin.set(r.clave, r);
  for (const r of result.rows) {
    if (r.status === 'rechazado' || out.has(r.m.id) || !r.clave) continue;
    const ref = origin.get(r.clave);
    if (!ref) continue;
    out.set(r.m.id, {
      reason: 'incidencia',
      detail: `Familia/certificado ${r.clave} rechazado por incidencia en ${ref.numId || 'sin NUM.ID.'} (fila ${ref.m.row}): ${incidentDetail(ref)}`,
    });
  }
  return out;
}

/** Resumen previo: cuántos movimientos y familias se rechazarían. */
export function previewRejection(result: EvalResult, ids: readonly string[], scope: RejectScope) {
  const plan = planIncidentRejection(result, ids, scope);
  const familias = new Set<string>();
  for (const id of plan.keys()) {
    const r = result.byId.get(id)!;
    familias.add(r.clave || `#${r.m.id}`);
  }
  return { movimientos: plan.size, familias: familias.size, plan };
}
