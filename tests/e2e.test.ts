import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { extractMovements, inspectWorkbook, readWorkbook, type ExtractResult } from '../src/core/reader';
import { defaultInput, evaluate, type EvalInput } from '../src/core/pipeline';
import { normalizeDescription } from '../src/core/normalize';
import { buildImportRows, buildLogRows, verifyImportXls, writeImportXls, writeLogXlsx } from '../src/core/exportXls';
import { buildSummary } from '../src/core/summary';
import { indexByName, indexByNumId, parseComplement } from '../src/core/complement';
import { exec } from './helpers';
import { planIncidentRejection, previewRejection } from '../src/core/incidents';

const root = fileURLToPath(new URL('..', import.meta.url));
let ex: ExtractResult;

beforeAll(() => {
  execFileSync(process.execPath, [join(root, 'scripts', 'generate-sample.mjs')], { cwd: root });
  const wb = readWorkbook(readFileSync(join(root, 'public', 'ejemplos', 'asegurados_ejemplo.xlsx')));
  const sheets = inspectWorkbook(wb);
  const candidates = sheets.filter((s) => s.candidate);
  expect(candidates.map((s) => s.name)).toEqual(['Movimientos']);
  ex = extractMovements(wb, candidates[0].name, candidates[0].headerRow, candidates[0].mapping);
});

const idOf = (numId: string, nth = 0) => ex.movements.filter((m) => m.original.numId.text === numId)[nth].id;

describe('flujo completo con el archivo de ejemplo', () => {
  it('clasifica los casos de prueba antes de las correcciones', () => {
    expect(ex.movements).toHaveLength(26);
    expect(ex.extraHeaders).toEqual(['PRIMA NETA', 'RECARGO', 'IVA', 'PRIMA TOTAL']);
    const res = evaluate({ ...defaultInput(ex.movements), exec: exec() });
    expect(res.counts).toMatchObject({ total: 26, aceptados: 8, rechazados: 10, bloqueados: 8 });
    expect(res.counts.byReason).toMatchObject({ compensado: 6, sinTitular: 3, bajaSinAlta: 1 });
    expect(res.canFinish).toBe(false);
  });

  it('tras resolver las incidencias exporta, vuelve a leer y cuadra el resumen', () => {
    const input: EvalInput = {
      ...defaultInput(ex.movements),
      date1904: ex.date1904,
      exec: exec(),
      descKinds: { [normalizeDescription('MODIFICACIÓN DE DATOS')]: 'excluir' },
      exclusions: new Map([
        [idOf('0005005-0001-T', 1), { reason: 'manual' as const, detail: 'Alta duplicada en el origen' }],
        [idOf('0008009-0001-T'), { reason: 'manual' as const, detail: 'Titular capturado con identificador erróneo' }],
      ]),
      corrections: new Map([
        [idOf('0007007-0001-T'), { fechaNacimiento: '28/02/1981', sexo: 'M' }],
        [idOf('0009009-0002-P'), { numId: '0009009-0002-C' }],
      ]),
    };
    const res = evaluate(input);
    expect(res.counts.bloqueados).toBe(0);
    expect(res.canFinish).toBe(true);
    expect(res.counts).toMatchObject({ total: 26, aceptados: 13, rechazados: 13 });
    expect(res.counts.byReason).toMatchObject({ compensado: 6, sinTitular: 3, bajaSinAlta: 1, noAplicable: 1, manual: 2 });

    const rows = buildImportRows(res, exec());
    const xls = writeImportXls(rows);
    expect(verifyImportXls(xls, rows).ok).toBe(true);
    const log = buildLogRows(res);
    const logWb = XLSX.read(writeLogXlsx(log), { type: 'array' });
    const logData = XLSX.utils.sheet_to_json<Record<string, unknown>>(logWb.Sheets.Rechazados);
    const s = buildSummary(res);
    expect(logData).toHaveLength(s.rechazados);
    expect(rows.length).toBe(s.aceptados);
    expect(s.total).toBe(s.aceptados + s.rechazados);

    // Los familiares aceptados quedan vinculados a su titular.
    const aoa = XLSX.utils.sheet_to_json<string[]>(XLSX.read(xls, { type: 'array' }).Sheets['Tabla 1'], { header: 1, defval: '' });
    const fam1 = aoa.filter((r) => r[7] === 'JUAN CARLOS');
    expect(fam1.map((r) => r[18])).toEqual(['Titular', 'Conyuge', 'Hijo', 'Hijo']);
    expect(fam1[1].slice(13, 16)).toEqual(['MARIA DE LA LUZ', 'GARCIA', 'DE LA CRUZ']);
    expect(fam1[1][16]).toBe('Femenino');
    const p = aoa.find((r) => r[13] === 'MARTA')!;
    expect(p[18]).toBe('Conyuge');
    expect(p[7]).toBe('ELENA');
  });

  it('aplica la tabla complementaria con procedencia', () => {
    const comp = parseComplement(readWorkbook(readFileSync(join(root, 'public', 'ejemplos', 'complemento_ejemplo.xlsx'))));
    const res = evaluate({
      ...defaultInput(ex.movements),
      complement: { records: comp.records, byNumId: indexByNumId(comp.records), byName: indexByName(comp.records) },
    });
    const ana = res.rows.find((r) => r.numId === '0001001-0004-H' && r.status === 'aceptado')!;
    expect(ana.person.fechaNacimiento).toBe('2015-02-14');
    expect(ana.person.provenance.fechaNacimiento).toBe('complemento');
    const carmen = res.rows.find((r) => r.numId === '0006006-0001-T')!;
    expect(carmen.person).toMatchObject({ rfc: 'VICA881224TT1', sexo: 'F', fechaNacimiento: '1988-12-24' });
  });
});

describe('guion de ejemplo del manual de usuario', () => {
  // Las cifras de este test son las que el manual (src/ui/Manual.tsx) indica en cada paso.
  const base = () => {
    const comp = parseComplement(readWorkbook(readFileSync(join(root, 'public', 'ejemplos', 'complemento_ejemplo.xlsx'))));
    return {
      ...defaultInput(ex.movements),
      date1904: ex.date1904,
      exec: exec(),
      complement: { records: comp.records, byNumId: indexByNumId(comp.records), byName: indexByName(comp.records) },
    };
  };

  it('pasos 1 a 3: lectura y clasificación inicial', () => {
    expect(ex.emptyRows).toBe(2);
    expect(ex.skipped).toHaveLength(2);
    const res = evaluate(base());
    expect(res.counts).toMatchObject({ total: 26, aceptados: 8, rechazados: 10, bloqueados: 8 });
    const ana = res.rows.filter((r) => r.numId === '0001001-0004-H');
    expect(ana.map((r) => r.pairId ?? r.status)).toEqual(['P-0001', 'P-0001', 'P-0002', 'P-0002', 'aceptado']);
    expect(res.rows.filter((r) => r.clave === '000777').map((r) => r.reason)).toEqual(['compensado', 'compensado', 'sinTitular', 'sinTitular']);
  });

  const corrected = () => ({
    ...base(),
    corrections: new Map([[idOf('0007007-0001-T'), { fechaNacimiento: '28/02/1981', sexo: 'M' }]]),
    descKinds: { [normalizeDescription('MODIFICACIÓN DE DATOS')]: 'excluir' as const },
  });

  it('pasos 3 y 4: corregir a JORGE ALBERTO y clasificar MODIFICACIÓN DE DATOS', () => {
    const res = evaluate(corrected());
    expect(res.counts).toMatchObject({ aceptados: 10, rechazados: 11, bloqueados: 5 });
    expect(res.issueCounts).toEqual({ duplicado: 2, variosTitulares: 2, parentescoDesconocido: 1 });
  });

  it('opción A: rechazar los 5 movimientos con incidencia', () => {
    const before = evaluate(corrected());
    const ids = before.rows.filter((r) => r.status === 'bloqueado').map((r) => r.m.id);
    const res = evaluate({ ...corrected(), exclusions: planIncidentRejection(before, ids, 'movimiento') });
    expect(res.canFinish).toBe(true);
    expect(res.counts).toMatchObject({ total: 26, aceptados: 10, rechazados: 16 });
    expect(buildImportRows(res, exec())).toHaveLength(10);
  });

  it('opción B: rechazar las 3 familias/certificados (6 movimientos)', () => {
    const before = evaluate(corrected());
    const ids = before.rows.filter((r) => r.status === 'bloqueado').map((r) => r.m.id);
    const p = previewRejection(before, ids, 'familia');
    expect([p.familias, p.movimientos]).toEqual([3, 6]);
    const res = evaluate({ ...corrected(), exclusions: p.plan });
    expect(res.counts).toMatchObject({ total: 26, aceptados: 9, rechazados: 17 });
  });
});
