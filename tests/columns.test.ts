import { describe, expect, it } from 'vitest';
import { autoMap, extractMovements, inspectWorkbook, mappingsToLearn, missingColumns, readWorkbook } from '../src/core/reader';
import { defaultInput, evaluate } from '../src/core/pipeline';
import { buildLogRows } from '../src/core/exportRows';
import { BAJA, xlsxBuffer } from './helpers';

const BASE = ['NUM.ID.', 'CLAVE DE IDENTIDAD', 'SEXO', 'FECHA DE NACIMIENTO', 'FECHA DE MOVIMIENTO', 'ANTIGÜEDAD DESDE', 'DESCRIPCIÓN', 'GRUPO'];

describe('archivo con nombre separado', () => {
  const buf = xlsxBuffer([
    [...BASE, 'Nombre(s)', 'Apellido Paterno', 'Apellido Materno'],
    ['1-0001-T', 'K', 'M', '12/03/1985', '15/01/2026', '01/01/2020', 'ALTA DE INCISOS/ASEGURADOS', '01', 'JUAN', 'PÉREZ', 'GÓMEZ'],
    ['1-0002-C', 'K', 'F', '20/08/1982', '15/01/2026', '01/01/2020', 'ALTA DE INCISOS/ASEGURADOS', '01', 'MARIA DE LA LUZ', 'GARCIA', 'DE LA CRUZ'],
    ['1-0003-H', 'K', 'M', '', '15/01/2026', '01/01/2020', BAJA, '01', 'LUIS', 'PEREZ', ''],
  ]);
  const wb = readWorkbook(buf);
  const [info] = inspectWorkbook(wb);

  it('no exige ASEGURADO(S) cuando vienen NOMBRE(S) y APELLIDO PATERNO', () => {
    expect(info.missing).toEqual([]);
    expect(info.mapping.asegurado).toBeNull();
    expect(info.mapping.nombre).not.toBeNull();
  });

  it('usa los nombres del origen sin propuesta pendiente y calcula el RFC', () => {
    const ex = extractMovements(wb, info.name, info.headerRow, info.mapping);
    const res = evaluate(defaultInput(ex.movements));
    const t = res.byId.get('r2')!;
    expect(t.person).toMatchObject({ nombre: 'JUAN', apellidoPaterno: 'PÉREZ', apellidoMaterno: 'GÓMEZ', rfc: 'PEGJ850312' });
    expect(t.person.provenance.nombre).toBe('origen');
    expect(t.warnings.map((w) => w.code)).not.toContain('nombrePendiente');
    expect(res.byId.get('r3')!.person.apellidoMaterno).toBe('DE LA CRUZ');
    // El log muestra el nombre completo aunque no exista ASEGURADO(S).
    const log = buildLogRows(res);
    expect(log[0][3]).toEqual({ t: 's', v: 'LUIS PEREZ' });
  });

  it('sin ninguna columna de nombre falta ASEGURADO(S)', () => {
    const m = { ...info.mapping, nombre: null, apellidoPaterno: null, apellidoMaterno: null };
    expect(missingColumns(m)).toEqual(['asegurado']);
  });
});

describe('asignaciones de columnas recordadas', () => {
  const headers = ['ID ASEGURADO', 'CVE FAMILIA', 'NOMBRE COMPLETO', 'GENERO', 'NACIMIENTO', 'FECHA MOV', 'ANTIGUEDAD', 'MOVIMIENTO', 'GRUPO'].map(
    (text, index) => ({ index, text }),
  );

  it('aprende solo lo que los alias previstos no resuelven', () => {
    const first = autoMap(headers);
    expect(first.numId).toBeNull();
    expect(first.clave).toBeNull();
    const manual = { ...first, numId: 0, clave: 1, fechaNacimiento: 4, descripcion: 7 };
    const learned = mappingsToLearn(manual, headers);
    expect(learned).toEqual({ 'ID ASEGURADO': 'numId', 'CVE FAMILIA': 'clave', NACIMIENTO: 'fechaNacimiento', MOVIMIENTO: 'descripcion' });
  });

  it('en la siguiente corrida asigna automáticamente con los mismos encabezados (sin importar mayúsculas ni acentos)', () => {
    const learned = { 'ID ASEGURADO': 'numId', 'CVE FAMILIA': 'clave', NACIMIENTO: 'fechaNacimiento', MOVIMIENTO: 'descripcion' } as const;
    const next = headers.map((h) => ({ ...h, text: h.text.toLowerCase().replace('MOVIMIENTO'.toLowerCase(), 'Movimiénto') }));
    const m = autoMap(next, learned);
    expect(m).toMatchObject({ numId: 0, clave: 1, asegurado: 2, sexo: 3, fechaNacimiento: 4, descripcion: 7, grupo: 8 });
    expect(missingColumns(m)).toEqual([]);
  });

  it('la asignación recordada tiene prioridad sobre el alias previsto', () => {
    const hs = [
      { index: 0, text: 'GRUPO' },
      { index: 1, text: 'SUBGRUPO REAL' },
    ];
    expect(autoMap(hs).grupo).toBe(0);
    expect(autoMap(hs, { 'SUBGRUPO REAL': 'grupo' }).grupo).toBe(1);
  });
});
