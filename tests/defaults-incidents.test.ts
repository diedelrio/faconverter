import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { extractMovements, inspectWorkbook, missingColumns, readWorkbook } from '../src/core/reader';
import { defaultInput, evaluate } from '../src/core/pipeline';
import { planIncidentRejection, previewRejection } from '../src/core/incidents';
import { buildLogRows, writeLogXlsx } from '../src/core/exportXls';
import { buildSummary } from '../src/core/summary';
import { ALTA, BAJA, exec, movements, xlsxBuffer } from './helpers';

describe('valores por defecto de columnas', () => {
  const buf = xlsxBuffer([
    ['NUM.ID.', 'CLAVE DE IDENTIDAD', 'ASEGURADO(S)', 'SEXO', 'FECHA DE NACIMIENTO', 'FECHA DE MOVIMIENTO', 'ANTIGÜEDAD DESDE', 'DESCRIPCIÓN'],
    ['1-0001-T', 'K', 'JUAN PEREZ GOMEZ', 'M', '12/03/1985', '15/01/2026', '', ALTA],
    ['1-0002-C', 'K', 'ANA RUIZ DIAZ', '', '01/01/1986', '15/01/2026', '01/06/2019', ALTA],
    [],
    ['', '', 'TOTAL'],
  ]);
  const wb = readWorkbook(buf);
  const [info] = inspectWorkbook(wb);

  it('una columna ausente queda resuelta con un valor fijo', () => {
    expect(info.missing).toEqual(['grupo']);
    expect(missingColumns(info.mapping, { grupo: '07' })).toEqual([]);
    expect(missingColumns(info.mapping, { grupo: '   ' })).toEqual(['grupo']);
  });

  it('aplica el valor fijo a todas las filas y el de celdas vacías solo donde falta, sin crear movimientos', () => {
    const ex = extractMovements(wb, info.name, info.headerRow, info.mapping, { grupo: '07', antiguedad: '01/01/2020', sexo: 'F' });
    expect(ex.movements).toHaveLength(2);
    expect(ex.movements.map((m) => m.original.grupo)).toEqual([
      { text: '07', defaulted: true },
      { text: '07', defaulted: true },
    ]);
    expect(ex.movements[0].original.antiguedad).toEqual({ text: '01/01/2020', defaulted: true });
    expect(ex.movements[1].original.antiguedad.defaulted).toBeUndefined();
    expect(ex.movements[0].original.sexo.text).toBe('M');
    expect(ex.movements[1].original.sexo).toEqual({ text: 'F', defaulted: true });
    expect(ex.defaultsApplied).toEqual({ grupo: 2, antiguedad: 1, sexo: 1 });

    const res = evaluate({ ...defaultInput(ex.movements), exec: exec() });
    expect(res.canFinish).toBe(true);
    expect(res.byId.get('r2')!.fechaAltaGds).toBe('2020-01-01');
  });

  it('no admite valor por defecto en identificadores', () => {
    const m = { ...info.mapping, numId: null };
    expect(missingColumns(m, { numId: 'X' } as never)).toContain('numId');
  });
});

describe('rechazo por incidencia', () => {
  const specs = [
    // Familia K1: titular válido, hijo con fecha inválida, cónyuge con alta y baja (ya compensado).
    { clave: 'K1', numId: '1-0001-T' },
    { clave: 'K1', numId: '1-0003-H', fechaNacimiento: '31/02/2010' },
    { clave: 'K1', numId: '1-0002-C', descripcion: ALTA },
    { clave: 'K1', numId: '1-0002-C', descripcion: BAJA },
    // Familia K2: varios titulares.
    { clave: 'K2', numId: '2-0001-T' },
    { clave: 'K2', numId: '3-0001-T' },
    // Familia K3 válida.
    { clave: 'K3', numId: '4-0001-T' },
  ];
  const ms = movements(specs);
  const base = evaluate({ ...defaultInput(ms), exec: exec() });
  const blocked = base.rows.filter((r) => r.status === 'bloqueado').map((r) => r.m.id);

  it('rechazar movimientos: motivo = incidencia y se puede finalizar', () => {
    expect(blocked).toEqual(['r3', 'r6', 'r7']);
    const plan = planIncidentRejection(base, blocked, 'movimiento');
    expect(plan.size).toBe(3);
    expect(plan.get('r3')!.detail).toMatch(/^Fecha inválida: fecha de nacimiento "31\/02\/2010"/);
    const res = evaluate({ ...defaultInput(ms), exec: exec(), exclusions: plan });
    expect(res.canFinish).toBe(true);
    expect(res.byId.get('r2')!.status).toBe('aceptado'); // el titular de K1 sigue
    expect(res.counts.byReason).toMatchObject({ incidencia: 3, compensado: 2 });
    expect(res.byId.get('r8')!.status).toBe('aceptado');
  });

  it('rechazar familia/certificado: incluye a los vigentes de la clave sin tocar los ya rechazados', () => {
    const { familias, movimientos, plan } = previewRejection(base, blocked, 'familia');
    expect(familias).toBe(2);
    expect(movimientos).toBe(4); // K1: titular + hijo; K2: dos titulares
    expect(plan.has('r4')).toBe(false); // compensado conserva su razón
    expect(plan.get('r2')!.detail).toBe(
      'Familia/certificado K1 rechazado por incidencia en 1-0003-H (fila 3): Fecha inválida: fecha de nacimiento "31/02/2010".',
    );
    const res = evaluate({ ...defaultInput(ms), exec: exec(), exclusions: plan });
    expect(res.canFinish).toBe(true);
    expect(res.counts).toMatchObject({ total: 7, aceptados: 1, rechazados: 6 });
    expect(res.byId.get('r4')!.reason).toBe('compensado');
    expect(buildSummary(res).consistent).toBe(true);

    const log = XLSX.utils.sheet_to_json<Record<string, unknown>>(XLSX.read(writeLogXlsx(buildLogRows(res)), { type: 'array' }).Sheets.Rechazados);
    const fila2 = log.find((l) => l['Fila original'] === 2)!;
    expect(fila2['Razón del rechazo']).toBe('Rechazado por incidencia');
    expect(String(fila2['Detalle'])).toContain('Familia/certificado K1');
  });
});
