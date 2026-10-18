import { describe, expect, it } from 'vitest';
import { naturalCompare, sortMovements } from '../src/core/sorting';
import { compensate } from '../src/core/compensation';
import { proposeSplit } from '../src/core/names';
import { parseConfig, resolveExecData, serializeConfig } from '../src/core/config';
import { parseDateText, serialToIso, isoToSerial } from '../src/core/dates';
import { classifyRow, normalizeDescription, matchHeader } from '../src/core/normalize';
import { ALTA, BAJA, CANCEL, EMISION, run, statusOf } from './helpers';

describe('ordenación', () => {
  it('compara segmentos numéricos por valor y conserva el texto', () => {
    expect(naturalCompare('A-2', 'A-10')).toBeLessThan(0);
    expect(naturalCompare('1234567-0002-T', '1234567-0010-C')).toBeLessThan(0);
    expect(naturalCompare('99', '100')).toBeLessThan(0);
    expect(naturalCompare('123456789012345678901', '123456789012345678902')).toBeLessThan(0);
  });

  it('ordena por clave y numId, y conserva el orden original en empates', () => {
    const items = [
      { clave: 'B', numId: '1-0001-T', seq: 0, tag: 'b1' },
      { clave: 'A', numId: '1-0010-H', seq: 1, tag: 'a10' },
      { clave: 'A', numId: '1-0002-C', seq: 2, tag: 'a2-first' },
      { clave: 'A', numId: '1-0002-C', seq: 3, tag: 'a2-second' },
      { clave: '10', numId: '1-0001-T', seq: 4, tag: 'c10' },
      { clave: '9', numId: '1-0001-T', seq: 5, tag: 'c9' },
    ];
    expect(sortMovements(items).map((x) => x.tag)).toEqual(['c9', 'c10', 'a2-first', 'a2-second', 'a10', 'b1']);
  });
});

describe('compensación de altas y bajas', () => {
  const g = (kinds: ('alta' | 'baja' | null)[]) =>
    kinds.map((kind, i) => ({ id: `m${i}`, clave: 'K', numId: '1-0001-T', kind }));

  it('empareja alta seguida de baja sin reutilizar filas', () => {
    const r = compensate(g(['alta', 'baja', 'baja']));
    expect([...r.paired.keys()]).toEqual(['m0', 'm1']);
    expect([...r.orphanBajas]).toEqual(['m2']);
  });

  it('altas y bajas repetidas forman parejas independientes', () => {
    const r = compensate(g(['alta', 'baja', 'alta', 'baja', 'alta']));
    expect(r.pairCount).toBe(2);
    expect(r.paired.get('m0')).toBe(r.paired.get('m1'));
    expect(r.paired.get('m2')).toBe(r.paired.get('m3'));
    expect(r.paired.get('m0')).not.toBe(r.paired.get('m2'));
    expect(r.paired.has('m4')).toBe(false);
  });

  it('alta, alta, baja: solo la segunda alta se compensa', () => {
    const r = compensate(g(['alta', 'alta', 'baja']));
    expect([...r.paired.keys()]).toEqual(['m1', 'm2']);
  });

  it('baja antes del alta no se compensa', () => {
    const r = compensate(g(['baja', 'alta']));
    expect(r.paired.size).toBe(0);
    expect([...r.orphanBajas]).toEqual(['m0']);
  });

  it('no empareja movimientos de distinto NUM.ID.', () => {
    const r = compensate([
      { id: 'a', clave: 'K', numId: '1-0001-T', kind: 'alta' },
      { id: 'b', clave: 'K', numId: '1-0002-C', kind: 'baja' },
    ]);
    expect(r.paired.size).toBe(0);
  });
});

describe('reglas completas', () => {
  it('pareja compensada → "Asegurado dado de baja" con el mismo identificador de pareja', () => {
    const res = run([
      { clave: 'K1', numId: '100-0001-T', descripcion: EMISION },
      { clave: 'K1', numId: '100-0001-T', descripcion: CANCEL },
    ]);
    const a = statusOf(res, 'r2'), b = statusOf(res, 'r3');
    expect(a.reason).toBe('compensado');
    expect(b.reason).toBe('compensado');
    expect(a.pairId).toBe(b.pairId);
    expect(res.counts.byReason.compensado).toBe(2);
  });

  it('titular dado de baja → familiares "Sin titular asociado" (después de la compensación)', () => {
    const res = run([
      { clave: 'K1', numId: '100-0002-C' },
      { clave: 'K1', numId: '100-0001-T', descripcion: ALTA },
      { clave: 'K1', numId: '100-0001-T', descripcion: BAJA },
      { clave: 'K1', numId: '100-0003-H' },
    ]);
    expect(statusOf(res, 'r3').reason).toBe('compensado');
    expect(statusOf(res, 'r4').reason).toBe('compensado');
    expect(statusOf(res, 'r2').reason).toBe('sinTitular');
    expect(statusOf(res, 'r5').reason).toBe('sinTitular');
    expect(res.counts).toMatchObject({ total: 4, aceptados: 0, rechazados: 4 });
  });

  it('familiar sin titular se excluye y no bloquea a otros grupos', () => {
    const res = run([
      { clave: 'K2', numId: '200-0002-H' },
      { clave: 'K1', numId: '100-0001-T' },
      { clave: 'K1', numId: '100-0002-C', asegurado: 'ANA MARIA RUIZ DE LA CRUZ', sexo: 'F' },
    ]);
    expect(statusOf(res, 'r2').reason).toBe('sinTitular');
    expect(statusOf(res, 'r3').status).toBe('aceptado');
    expect(statusOf(res, 'r4').status).toBe('aceptado');
    expect(statusOf(res, 'r4').titularId).toBe('r3');
    expect(res.canFinish).toBe(true);
  });

  it('el titular se encuentra aunque aparezca después del familiar', () => {
    const res = run([
      { clave: 'K1', numId: '100-0002-C' },
      { clave: 'K1', numId: 'Z-0001-T' },
    ]);
    expect(statusOf(res, 'r2').titularId).toBe('r3');
    expect(statusOf(res, 'r2').status).toBe('aceptado');
  });

  it('baja sin alta → razón diferenciada', () => {
    const res = run([
      { clave: 'K1', numId: '100-0001-T' },
      { clave: 'K1', numId: '100-0002-C', descripcion: BAJA },
    ]);
    expect(statusOf(res, 'r3').reason).toBe('bajaSinAlta');
    expect(statusOf(res, 'r2').status).toBe('aceptado');
  });

  it('duplicados sin resolver y varios titulares bloquean', () => {
    const res = run([
      { clave: 'K1', numId: '100-0001-T' },
      { clave: 'K1', numId: '100-0001-T' },
      { clave: 'K2', numId: '200-0001-T' },
      { clave: 'K2', numId: '201-0001-T' },
      { clave: 'K3', numId: '300-0001-T' },
      { clave: 'K3', numId: '300-0002-X' },
    ]);
    expect(statusOf(res, 'r2').issues.map((i) => i.code)).toContain('duplicado');
    expect(statusOf(res, 'r4').issues.map((i) => i.code)).toContain('variosTitulares');
    expect(statusOf(res, 'r7').issues.map((i) => i.code)).toContain('parentescoDesconocido');
    expect(statusOf(res, 'r6').status).toBe('aceptado');
    expect(res.canFinish).toBe(false);
  });

  it('excluir un duplicado lo resuelve y queda en el log como exclusión manual', () => {
    const base = [
      { clave: 'K1', numId: '100-0001-T' },
      { clave: 'K1', numId: '100-0001-T' },
    ];
    const res = run(base, { exclusions: new Map([['r3', { reason: 'manual' as const, detail: 'Registro repetido en el origen' }]]) });
    expect(statusOf(res, 'r2').status).toBe('aceptado');
    expect(statusOf(res, 'r3')).toMatchObject({ status: 'rechazado', reason: 'manual', reasonDetail: 'Registro repetido en el origen' });
    expect(res.canFinish).toBe(true);
  });

  it('excluir al titular reevalúa a sus familiares', () => {
    const res = run(
      [
        { clave: 'K1', numId: '100-0001-T' },
        { clave: 'K1', numId: '100-0002-H' },
      ],
      { exclusions: new Map([['r2', { reason: 'manual' as const, detail: 'Titular no aplica' }]]) },
    );
    expect(statusOf(res, 'r3').reason).toBe('sinTitular');
  });

  it('fechas inválidas, sexo no reconocido y datos incompletos bloquean', () => {
    const res = run([
      { clave: 'K1', numId: '100-0001-T', fechaNacimiento: '31/02/1980' },
      { clave: 'K2', numId: '200-0001-T', sexo: 'X' },
      { clave: 'K3', numId: '300-0001-T', asegurado: 'MADONNA' },
      { clave: '', numId: '400-0001-T' },
    ]);
    expect(statusOf(res, 'r2').issues.map((i) => i.code)).toContain('fechaInvalida');
    expect(statusOf(res, 'r3').issues.map((i) => i.code)).toContain('sexoInvalido');
    expect(statusOf(res, 'r4').issues.map((i) => i.code)).toContain('datosIncompletos');
    expect(statusOf(res, 'r5').issues.map((i) => i.code)).toContain('claveAusente');
    expect(res.counts.bloqueados).toBe(4);
  });

  it('las correcciones siguen al id interno y prevalecen sobre el origen', () => {
    const res = run([{ clave: 'K1', numId: '100-0001-T', fechaNacimiento: 'xx', sexo: '?' }], {
      corrections: new Map([['r2', { fechaNacimiento: '05/06/1990', sexo: 'F', nombre: 'MARIA JOSE', apellidoPaterno: 'PEREZ' }]]),
    });
    const r = statusOf(res, 'r2');
    expect(r.status).toBe('aceptado');
    expect(r.person).toMatchObject({ fechaNacimiento: '1990-06-05', sexo: 'F', nombre: 'MARIA JOSE' });
    expect(r.person.provenance.nombre).toBe('manual');
    expect(r.m.original.fechaNacimiento.text).toBe('xx');
  });

  it('descripción desconocida queda sin clasificar hasta que el usuario la clasifica', () => {
    const specs = [
      { clave: 'K1', numId: '100-0001-T' },
      { clave: 'K1', numId: '100-0001-T', descripcion: 'MODIFICACIÓN DE DATOS' },
    ];
    const res = run(specs);
    expect(statusOf(res, 'r3').issues.map((i) => i.code)).toContain('descripcionSinClasificar');
    const res2 = run(specs, { descKinds: { [normalizeDescription('MODIFICACION DE DATOS')]: 'excluir' } });
    expect(statusOf(res2, 'r3').reason).toBe('noAplicable');
    expect(res2.canFinish).toBe(true);
  });

  it('cada movimiento termina aceptado o rechazado sin doble conteo', () => {
    const res = run([
      { clave: 'K1', numId: '1-0001-T', descripcion: ALTA },
      { clave: 'K1', numId: '1-0001-T', descripcion: BAJA },
      { clave: 'K1', numId: '1-0001-T', descripcion: ALTA },
      { clave: 'K1', numId: '1-0001-T', descripcion: BAJA },
      { clave: 'K1', numId: '1-0002-C', descripcion: ALTA },
      { clave: 'K2', numId: '2-0001-T', descripcion: EMISION },
      { clave: 'K2', numId: '2-0002-H', descripcion: EMISION },
      { clave: 'K3', numId: '3-0002-H', descripcion: EMISION },
      { clave: 'K4', numId: '4-0001-T', descripcion: CANCEL },
    ]);
    const { total, aceptados, rechazados, byReason } = res.counts;
    expect(total).toBe(9);
    expect(aceptados + rechazados).toBe(total);
    expect(byReason).toMatchObject({ compensado: 4, sinTitular: 2, bajaSinAlta: 1 });
    expect(aceptados).toBe(2);
  });
});

describe('nombres', () => {
  it('propone los dos últimos términos como apellidos, agrupando partículas', () => {
    expect(proposeSplit('JUAN CARLOS PEREZ LOPEZ')).toEqual({ nombre: 'JUAN CARLOS', apellidoPaterno: 'PEREZ', apellidoMaterno: 'LOPEZ' });
    expect(proposeSplit('MARIA  DE LA LUZ GARCIA DE LA CRUZ')).toEqual({ nombre: 'MARIA DE LA LUZ', apellidoPaterno: 'GARCIA', apellidoMaterno: 'DE LA CRUZ' });
    expect(proposeSplit('ANA RUIZ')).toEqual({ nombre: 'ANA', apellidoPaterno: 'RUIZ', apellidoMaterno: '' });
    expect(proposeSplit('PEREZ LOPEZ JUAN CARLOS', 'apellidos-nombres')).toEqual({ nombre: 'JUAN CARLOS', apellidoPaterno: 'PEREZ', apellidoMaterno: 'LOPEZ' });
  });

  it('marca la propuesta como pendiente de revisión', () => {
    const res = run([{ clave: 'K', numId: '1-0001-T' }]);
    expect(statusOf(res, 'r2').warnings.map((w) => w.code)).toContain('nombrePendiente');
    const res2 = run([{ clave: 'K', numId: '1-0001-T' }], { nameReviewed: new Set(['r2']) });
    expect(statusOf(res2, 'r2').warnings.map((w) => w.code)).not.toContain('nombrePendiente');
  });
});

describe('configuración', () => {
  it('solo admite los campos permitidos', () => {
    const r = parseConfig(JSON.stringify({ valoresPredeterminados: { 'Tipo Movimiento': 'ALTA', poliza: '999', nombrePlan: 'X', cp: '01000' } }));
    expect(r.defaults).toEqual({ tipoMovimiento: 'ALTA', cp: '01000' });
    expect(r.ignored).toEqual(['poliza', 'nombrePlan']);
    expect(JSON.parse(serializeConfig(r.defaults)).valoresPredeterminados.cp).toBe('01000');
  });

  it('el formulario prevalece sobre la configuración', () => {
    const d = resolveExecData({ sucursal: 'CFG', colonia: 'CFG' }, { sucursal: 'FORM', colonia: '' }, new Set(['sucursal', 'colonia'] as const));
    expect(d.sucursal).toBe('FORM');
    expect(d.colonia).toBe('');
    const d2 = resolveExecData({ sucursal: 'CFG' }, {}, new Set());
    expect(d2.sucursal).toBe('CFG');
  });
});

describe('fechas y normalización', () => {
  it('interpreta fechas de Excel y de texto', () => {
    expect(serialToIso(45000)).toBe('2023-03-15');
    expect(isoToSerial('2023-03-15')).toBe(45000);
    expect(parseDateText('05/06/1990')).toBe('1990-06-05');
    expect(parseDateText('1990-06-05')).toBe('1990-06-05');
    expect(parseDateText('5-ENE-1990')).toBe('1990-01-05');
    expect(parseDateText('29/02/2023')).toBeNull();
  });

  it('tolera espacios, mayúsculas y acentos en encabezados y descripciones', () => {
    expect(matchHeader('  num.id. ')).toBe('numId');
    expect(matchHeader('Antiguedad   desde')).toBe('antiguedad');
    expect(matchHeader('DESCRIPCION')).toBe('descripcion');
    expect(normalizeDescription('alta de incisos / asegurados')).toBe(normalizeDescription(ALTA));
    expect(normalizeDescription('Emision  de la póliza')).toBe(normalizeDescription(EMISION));
  });

  it('detecta filas vacías y de totales', () => {
    expect(classifyRow({}, ['', ''])).toBe('vacia');
    expect(classifyRow({ asegurado: 'TOTAL' }, ['TOTAL', '1500.00'])).toBe('total');
    expect(classifyRow({}, ['Total de asegurados: 25'])).toBe('total');
    expect(classifyRow({}, ['', '1500.00', '200'])).toBe('total');
    expect(classifyRow({ numId: '1-0001-T', clave: 'K', endoso: 'NO. 123' }, ['1-0001-T', 'K', 'NO. 123'])).toBe('movimiento');
  });
});
