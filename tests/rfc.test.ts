import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { calcularRfcBase } from '../src/core/rfc';
import { buildImportRows, writeImportXls } from '../src/core/exportXls';
import { exec, run } from './helpers';

const rfc = (nombre: string, apellidoPaterno: string, apellidoMaterno: string, fechaNacimiento: string) =>
  calcularRfcBase({ nombre, apellidoPaterno, apellidoMaterno, fechaNacimiento });

describe('RFC sin homoclave', () => {
  it('aplica la regla general (ejemplo: Juan Pérez Gómez, 12/03/1985)', () => {
    expect(rfc('JUAN', 'PÉREZ', 'GÓMEZ', '1985-03-12')).toBe('PEGJ850312');
    expect(rfc('JUAN CARLOS', 'PEREZ', 'LOPEZ', '1980-03-03')).toBe('PELJ800303');
  });

  it('ignora partículas y usa el segundo nombre tras JOSE o MARIA', () => {
    expect(rfc('MARIA DE LA LUZ', 'GARCIA', 'DE LA CRUZ', '1982-08-20')).toBe('GACL820820');
    expect(rfc('JOSE LUIS', 'DEL VALLE', 'ROJAS', '1990-01-02')).toBe('VARL900102');
    expect(rfc('MA. ELENA', 'RUIZ', 'DIAZ', '1975-12-31')).toBe('RUDE751231');
  });

  it('casos especiales: un apellido, apellido corto, sin vocal interna, Ñ y palabras inconvenientes', () => {
    expect(rfc('CARMEN', 'VILLA', '', '1988-12-24')).toBe('VICA881224');
    expect(rfc('ANA', 'LI', 'WONG', '2000-05-06')).toBe('LWAN000506');
    expect(rfc('PEDRO', 'SZCZYK', 'MORA', '1970-07-07')).toBe('SXMP700707');
    expect(rfc('JORGE', 'ÑUÑEZ', 'PAZ', '1981-02-28')).toBe('XUPJ810228');
    expect(rfc('OSCAR', 'PUENTE', 'TORRES', '1984-04-04')).toBe('PUTX840404');
  });

  it('no calcula sin fecha de nacimiento o sin nombre', () => {
    expect(rfc('JUAN', 'PEREZ', 'GOMEZ', '')).toBeNull();
    expect(rfc('', 'PEREZ', 'GOMEZ', '1985-03-12')).toBeNull();
  });

  it('se calcula en la clasificación con procedencia "calculado"; el dato manual prevalece', () => {
    const res = run(
      [
        { clave: 'K', numId: '1-0001-T', asegurado: 'JUAN PEREZ GOMEZ', fechaNacimiento: '12/03/1985' },
        { clave: 'K', numId: '1-0002-C', asegurado: 'ANA RUIZ DIAZ', sexo: 'F' },
        { clave: 'K', numId: '1-0003-H', asegurado: 'LUIS PEREZ RUIZ', fechaNacimiento: '01/01/2010' },
      ],
      { corrections: new Map([['r4', { rfc: 'XXXX010101AAA' }]]) },
    );
    const t = res.byId.get('r2')!;
    expect(t.person.rfc).toBe('PEGJ850312');
    expect(t.person.provenance.rfc).toBe('calculado');
    expect(res.byId.get('r3')!.warnings.map((w) => w.code)).toContain('sinRfc');
    const h = res.byId.get('r4')!;
    expect(h.person.provenance.rfc).toBe('manual');
    expect(h.warnings.map((w) => w.code)).toContain('rfcNoCoincide');
  });
});

describe('Fecha Alta GDS desde ANTIGÜEDAD DESDE', () => {
  it('exporta la antigüedad de cada movimiento como fecha', () => {
    const res = run(
      [
        { clave: 'K', numId: '1-0001-T', antiguedad: 43631 },
        { clave: 'K', numId: '1-0002-C', antiguedad: '01/02/2021', sexo: 'F' },
      ],
      { exec: exec() },
    );
    const rows = buildImportRows(res, exec());
    const ws = XLSX.read(writeImportXls(rows), { type: 'array' }).Sheets['Tabla 1'];
    expect(ws.V2.w).toBe('15/06/2019');
    expect(ws.V3.w).toBe('01/02/2021');
  });

  it('una antigüedad inválida bloquea y puede corregirse', () => {
    const specs = [{ clave: 'K', numId: '1-0001-T', antiguedad: '32/13/2020' }];
    expect(run(specs).byId.get('r2')!.issues.map((i) => i.code)).toContain('fechaInvalida');
    const fixed = run(specs, { corrections: new Map([['r2', { antiguedad: '01/01/2020' }]]) }).byId.get('r2')!;
    expect(fixed.status).toBe('aceptado');
    expect(fixed.fechaAltaGds).toBe('2020-01-01');
  });
});
