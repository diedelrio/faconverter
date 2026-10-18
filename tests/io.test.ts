import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { extractMovements, inspectWorkbook, readWorkbook } from '../src/core/reader';
import { defaultInput, evaluate } from '../src/core/pipeline';
import {
  IMPORT_HEADERS,
  buildImportRows,
  buildLogRows,
  isCfbXls,
  verifyImportXls,
  writeImportXls,
  writeLogXlsx,
  LOG_HEADERS,
} from '../src/core/exportXls';
import { buildReportHtml, buildSummary } from '../src/core/summary';
import { parseComplement, indexByName, indexByNumId } from '../src/core/complement';
import { ALTA, BAJA, exec, run, xlsxBuffer } from './helpers';

const HEADER = [
  'NUM.ID.',
  'CLAVE DE IDENTIDAD',
  'ASEGURADO(S)',
  'SEXO',
  'FECHA DE NACIMIENTO',
  'FECHA DE MOVIMIENTO',
  'FECHA DE INICIO VIG.',
  'ANTIGÜEDAD DESDE',
  'DESCRIPCIÓN',
  'ENDOSO',
  'STATUS',
  'GRUPO',
  'PRIMA NETA',
  'IVA',
];

describe('lectura', () => {
  it('lee el origen, ignora filas vacías/totales y conserva columnas adicionales sin exportarlas', () => {
    const buf = xlsxBuffer([
      [' num.id. ', 'Clave  de identidad', 'ASEGURADO(S)', 'sexo', 'Fecha de Nacimiento', 'FECHA DE MOVIMIENTO', 'FECHA DE INICIO VIG.', 'ANTIGUEDAD DESDE', 'Descripcion', 'ENDOSO', 'STATUS', 'GRUPO', 'PRIMA NETA', 'IVA'],
      ['0001234-0001-T', '00099', 'JUAN PEREZ LOPEZ', 'M', 32874, 45000, 45000, 45000, ALTA, '', 'VIGENTE', '01', 100, 16],
      [],
      ['0001234-0002-C', '00099', 'ANA RUIZ DIAZ', 'F', '', 45000, 45000, 45000, ALTA, '', 'VIGENTE', '01', 100, 16],
      ['', '', 'TOTAL', '', '', '', '', '', '', '', '', '', 200, 32],
      ['', '', '', '', '', '', '', '', '', '', '', '', 200, 32],
      ['Número de asegurados: 2'],
    ]);
    const wb = readWorkbook(buf);
    const [info] = inspectWorkbook(wb);
    expect(info.missing).toEqual([]);
    const ex = extractMovements(wb, info.name, info.headerRow, info.mapping);
    expect(ex.movements).toHaveLength(2);
    expect(ex.emptyRows).toBe(1);
    expect(ex.skipped.map((s) => s.kind)).toEqual(['total', 'total', 'total']);
    expect(ex.extraHeaders).toEqual(['PRIMA NETA', 'IVA']);
    expect(ex.movements[0].original.clave.text).toBe('00099');
    expect(ex.movements[0].original.numId.text).toBe('0001234-0001-T');
    expect(ex.movements[0].row).toBe(2);
    expect(ex.movements[1].row).toBe(4);
  });

  it('informa columnas faltantes y varias hojas candidatas', () => {
    const buf = xlsxBuffer([HEADER.filter((h) => h !== 'GRUPO')], 'A', { B: [HEADER], Notas: [['Hola']] });
    const infos = inspectWorkbook(readWorkbook(buf));
    expect(infos.filter((i) => i.candidate).map((i) => i.name)).toEqual(['A', 'B']);
    expect(infos[0].missing).toEqual(['grupo']);
    expect(infos[2].candidate).toBe(false);
  });
});

describe('exportación', () => {
  const specs = [
    { clave: 'K2', numId: '0002-0001-T', asegurado: 'PEDRO GOMEZ SOTO', fechaNacimiento: '01/01/1970', grupo: '007' },
    { clave: 'K1', numId: '0001-0002-H', asegurado: 'LUIS PEREZ LOPEZ', fechaNacimiento: '02/02/2010', grupo: '' },
    { clave: 'K1', numId: '0001-0001-T', asegurado: 'JUAN PEREZ LOPEZ', fechaNacimiento: '03/03/1980', grupo: '01' },
    { clave: 'K1', numId: '0001-0003-C', asegurado: 'ANA RUIZ DIAZ', sexo: 'F', descripcion: ALTA, grupo: '01' },
    { clave: 'K1', numId: '0001-0003-C', descripcion: BAJA },
  ];

  it('genera un .xls BIFF8 real con 32 columnas que coincide con la vista previa', () => {
    const res = run(specs, { exec: exec(), corrections: new Map([['r4', { rfc: 'PELJ800303AB1' }]]) });
    expect(res.canFinish).toBe(true);
    const rows = buildImportRows(res, exec());
    expect(rows).toHaveLength(3);
    const buf = writeImportXls(rows);
    expect(isCfbXls(buf)).toBe(true);
    const v = verifyImportXls(buf, rows);
    expect(v.differences).toEqual([]);

    const wb = XLSX.read(buf, { type: 'array', cellNF: true });
    expect(wb.SheetNames).toEqual(['Tabla 1']);
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Tabla 1'], { header: 1, raw: true, defval: null });
    expect(aoa[0]).toEqual([...IMPORT_HEADERS]);
    expect(aoa[0]).toHaveLength(32);
    // Orden: K1 titular, K1 hijo, K2 titular.
    expect(aoa[1][18]).toBe('Titular');
    expect(aoa[1].slice(12, 18)).toEqual([null, null, null, null, null, null]);
    expect(aoa[2][18]).toBe('Hijo');
    expect(aoa[2][6]).toBe('PELJ800303AB1'); // RFC del titular repetido en la fila del familiar
    expect(aoa[2][7]).toBe('JUAN');
    expect(aoa[2][13]).toBe('LUIS');
    expect(aoa[2][16]).toBe('Masculino');
    expect(aoa[2][20]).toBeNull(); // GRUPO vacío no se sustituye por cero
    expect(aoa[3][20]).toBe('007'); // ceros iniciales
    expect(aoa[1][0]).toBe('000123');
    expect(aoa[1][4]).toBe('00042');
    expect(aoa[1][25]).toBe('0155123456');
    expect(aoa[1][27]).toBe('01234');
    expect(aoa[1][21]).toBeNull(); // Fecha Alta GDS vacía si no se indica
    const cell = wb.Sheets['Tabla 1']['L2'];
    expect(cell.t).toBe('n');
    expect(cell.z).toBe('dd/mm/yyyy');
    expect(cell.w).toBe('03/03/1980');
    expect(wb.Sheets['Tabla 1']['AF2'].w).toBe('01/01/2026');
  });

  it('genera el log con la hoja Rechazados, incluso sin rechazos', () => {
    const empty = run([{ clave: 'K', numId: '1-0001-T' }], { exec: exec() });
    const buf = writeLogXlsx(buildLogRows(empty));
    const wb = XLSX.read(buf, { type: 'array' });
    expect(wb.SheetNames).toEqual(['Rechazados']);
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Rechazados, { header: 1 });
    expect(aoa).toEqual([[...LOG_HEADERS]]);

    const res = run(specs, { exec: exec() });
    const log = XLSX.utils.sheet_to_json<Record<string, unknown>>(XLSX.read(writeLogXlsx(buildLogRows(res)), { type: 'array' }).Sheets.Rechazados);
    expect(log).toHaveLength(2);
    expect(log[0]['Razón del rechazo']).toBe('Asegurado dado de baja');
    expect(log[0]['Pareja de compensación']).toBe(log[1]['Pareja de compensación']);
    expect(log.map((l) => l['Fila original'])).toEqual([5, 6]);
  });

  it('el resumen cumple Total = Aceptados + Rechazados y produce HTML autónomo', () => {
    const res = run(specs, { exec: exec() });
    const s = buildSummary(res);
    expect(s).toMatchObject({ total: 5, aceptados: 3, rechazados: 2, consistent: true });
    const html = buildReportHtml(s, { archivo: 'a.xlsx', hoja: 'H', poliza: 'P', plan: 'X', cliente: 'C', generado: new Date() });
    expect(html).toContain('<svg');
    expect(html).not.toMatch(/<script|<link|https?:\/\//);
  });

  it('bloquea más de 65.535 movimientos aceptados', () => {
    const many = Array.from({ length: 65536 }, (_, i) => ({ clave: `K${i}`, numId: `${i}-0001-T` }));
    const res = run(many, { exec: exec() });
    expect(res.globalIssues.map((g) => g.code)).toContain('limiteXls');
    expect(res.canFinish).toBe(false);
  }, 30000);
});

describe('tabla complementaria', () => {
  it('relaciona por NUM.ID. y registra la procedencia; por nombre exige confirmar ambigüedades', () => {
    const buf = xlsxBuffer([
      ['NUM.ID.', 'Nombre', 'Apellido paterno', 'Apellido materno', 'Fecha de nacimiento', 'RFC'],
      ['1-0001-T', 'JUAN CARLOS', 'DE LA ROSA', 'PEREZ', '10/10/1980', 'ROPJ801010AAA'],
      ['X-1', 'ANA', 'RUIZ', 'DIAZ', '', ''],
      ['X-2', 'ANA', 'RUIZ', 'DIAZ', '', ''],
    ]);
    const parsed = parseComplement(readWorkbook(buf));
    const complement = { records: parsed.records, byNumId: indexByNumId(parsed.records), byName: indexByName(parsed.records) };
    const res = run(
      [
        { clave: 'K', numId: '1-0001-T', asegurado: 'JUAN CARLOS DE LA ROSA PEREZ' },
        { clave: 'K', numId: '1-0002-C', asegurado: 'ANA RUIZ DIAZ', sexo: 'F' },
      ],
      { complement, complementByName: true },
    );
    const t = res.byId.get('r2')!;
    expect(t.person).toMatchObject({ apellidoPaterno: 'DE LA ROSA', rfc: 'ROPJ801010AAA', fechaNacimiento: '1980-10-10' });
    expect(t.person.provenance).toMatchObject({ nombre: 'complemento', rfc: 'complemento', sexo: 'origen' });
    const c = res.byId.get('r3')!;
    expect(c.complementCandidates).toHaveLength(2);
    expect(c.warnings.map((w) => w.code)).toContain('complementoAmbiguo');

    const ms = res.rows.map((r) => r.m);
    const res2 = evaluate({ ...defaultInput(ms), complement, complementByName: true, complementChoices: new Map([['r3', 2]]) });
    expect(res2.byId.get('r3')!.complementIndex).toBe(2);
  });
});
