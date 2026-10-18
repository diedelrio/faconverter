/**
 * Genera los archivos de ejemplo en public/ejemplos/ (se publican con la app y se descargan desde el manual):
 *  - asegurados_ejemplo.xlsx: casos de prueba (altas/bajas repetidas, titular dado de baja, familiares
 *    sin titular, nombres compuestos, fechas ausentes, duplicados, totales, columnas de primas...).
 *  - complemento_ejemplo.xlsx: tabla complementaria.
 *  - configuracion_ejemplo.json.
 *  - Con --grande N: asegurados_grande.xlsx con N movimientos (por defecto 60000) para pruebas de volumen.
 */
import * as XLSX from 'xlsx';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const save = (wb, path) => writeFileSync(path, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', compression: true }));
// Los ejemplos pequeños se publican con la app (descargables desde el manual); el de volumen queda local.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ejemplos');
const outGrande = join(root, 'samples');
mkdirSync(outGrande, { recursive: true });
mkdirSync(out, { recursive: true });

const H = [
  'NUM.ID.', 'CLAVE DE IDENTIDAD', 'ASEGURADO(S)', 'SEXO', 'FECHA DE NACIMIENTO', 'FECHA DE MOVIMIENTO',
  'FECHA DE INICIO VIG.', 'ANTIGÜEDAD DESDE', 'DESCRIPCIÓN', 'ENDOSO', 'STATUS', 'GRUPO',
  'PRIMA NETA', 'RECARGO', 'IVA', 'PRIMA TOTAL',
];
const ALTA = 'ALTA DE INCISOS/ASEGURADOS';
const EMI = 'EMISIÓN DE LA POLIZA';
const BAJA = 'BAJA DE INCISOS/ASEGURADOS';
const CANC = 'CANCELACIÓN AUTOMÁTICA ENDOSOS';
const d = (s) => {
  const [dd, mm, yy] = s.split('/').map(Number);
  return (Date.UTC(yy, mm - 1, dd) - Date.UTC(1899, 11, 30)) / 86400000;
};
const r = (numId, clave, nombre, sexo, nac, desc, grupo = '01', endoso = '') => [
  numId, clave, nombre, sexo, nac === '' ? '' : typeof nac === 'string' && nac.includes('/') ? d(nac) : nac,
  d('15/01/2026'), d('01/01/2026'), d('01/01/2020'), desc, endoso, 'VIGENTE', grupo, 1200.5, 60, 201.68, 1462.18,
];

const rows = [
  H,
  // Familia completa válida (orden mezclado en el origen; el titular aparece después).
  r('0001001-0003-H', '000501', 'LUIS PEREZ GARCIA', 'M', '12/05/2012', EMI),
  r('0001001-0001-T', '000501', 'JUAN CARLOS PEREZ LOPEZ', 'M', '03/03/1980', EMI),
  r('0001001-0002-C', '000501', 'MARIA DE LA LUZ GARCIA DE LA CRUZ', 'F', '20/08/1982', EMI),
  // Alta y baja repetidas del mismo hijo: dos parejas compensadas, la tercera alta queda vigente.
  r('0001001-0004-H', '000501', 'ANA SOFIA PEREZ GARCIA', 'F', '', ALTA, '01', 'E-10'),
  r('0001001-0004-H', '000501', 'ANA SOFIA PEREZ GARCIA', 'F', '', BAJA, '01', 'E-11'),
  r('0001001-0004-H', '000501', 'ANA SOFIA PEREZ GARCIA', 'F', '', ALTA, '01', 'E-12'),
  r('0001001-0004-H', '000501', 'ANA SOFIA PEREZ GARCIA', 'F', '', CANC, '01', 'E-13'),
  r('0001001-0004-H', '000501', 'ANA SOFIA PEREZ GARCIA', 'F', '', ALTA, '01', 'E-14'),
  [],
  // Titular dado de baja: sus familiares quedan sin titular.
  r('0002002-0001-T', '000777', 'ROBERTO SANCHEZ RUIZ', 'M', '01/01/1975', ALTA),
  r('0002002-0001-T', '000777', 'ROBERTO SANCHEZ RUIZ', 'M', '01/01/1975', BAJA),
  r('0002002-0002-C', '000777', 'LAURA MENDEZ SOTO', 'F', '02/02/1978', ALTA),
  r('0002002-0003-H', '000777', 'DIEGO SANCHEZ MENDEZ', 'M', '03/03/2008', ALTA),
  // Familiar sin titular en el archivo.
  r('0003003-0002-C', '000888', 'PATRICIA LOPEZ NAVA', 'F', '15/07/1985', ALTA, '02'),
  // Baja sin alta asociada.
  r('0004004-0001-T', '000999', 'ERNESTO DIAZ VEGA', 'M', '10/10/1970', EMI, '02'),
  r('0004004-0002-C', '000999', 'SUSANA VEGA ROJAS', 'F', '11/11/1972', BAJA, '02'),
  // Duplicado no resuelto (dos altas seguidas del mismo titular).
  r('0005005-0001-T', '001000', 'FERNANDO TORRES IBARRA', 'M', '05/05/1990', ALTA, '03'),
  r('0005005-0001-T', '001000', 'FERNANDO TORRES IBARRA', 'M', '05/05/1990', ALTA, '03'),
  // Nombre de dos palabras, sexo con texto completo, fecha como texto y grupo vacío.
  r('0006006-0001-T', '001100', 'CARMEN VILLA', 'Femenino', '1988-12-24', ALTA, ''),
  // Fecha inválida y sexo no reconocido.
  r('0007007-0001-T', '001200', 'JORGE ALBERTO NUÑEZ DEL VALLE', 'X', '31-02-1981', ALTA, '01'),
  // Varios titulares en la misma clave.
  r('0008008-0001-T', '001300', 'RAUL ORTIZ LEON', 'M', '01/06/1979', ALTA),
  r('0008009-0001-T', '001300', 'RAUL ORTIZ LEON', 'M', '01/06/1979', ALTA),
  // Parentesco desconocido.
  r('0009009-0001-T', '001400', 'ELENA RIOS CAMPOS', 'F', '09/09/1991', ALTA),
  r('0009009-0002-P', '001400', 'MARTA CAMPOS RIOS', 'F', '09/09/1960', ALTA),
  // Descripción no prevista (debe clasificarse).
  r('0010010-0001-T', '001500', 'OSCAR MORA PAZ', 'M', '04/04/1984', 'MODIFICACIÓN DE DATOS'),
  r('0010010-0001-T', '001500', 'OSCAR MORA PAZ', 'M', '04/04/1984', EMI),
  // Descripción con variaciones de espacios y mayúsculas.
  r('0011011-0001-T', '001600', 'GABRIELA  PONCE  LUNA', 'F', '07/07/1993', 'alta de incisos / asegurados'),
  [],
  ['', '', 'TOTAL', '', '', '', '', '', '', '', '', '', 30015.0, 1500, 5042, 36557],
  ['Número de asegurados: 29'],
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
// Fechas con formato visible en Excel.
for (const [addr, cell] of Object.entries(ws)) {
  if (addr.startsWith('!')) continue;
  const col = XLSX.utils.decode_cell(addr).c;
  if ([4, 5, 6, 7].includes(col) && cell.t === 'n') cell.z = 'dd/mm/yyyy';
  // Claves como texto para conservar los ceros iniciales.
}
XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Notas'], ['Hoja informativa sin movimientos']]), 'Notas');
save(wb, join(out, 'asegurados_ejemplo.xlsx'));

const comp = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  comp,
  XLSX.utils.aoa_to_sheet([
    ['NUM.ID.', 'Nombre', 'Apellido paterno', 'Apellido materno', 'Fecha de nacimiento', 'RFC'],
    ['0001001-0001-T', 'JUAN CARLOS', 'PEREZ', 'LOPEZ', '03/03/1980', 'PELJ800303AB1'],
    ['0001001-0002-C', 'MARIA DE LA LUZ', 'GARCIA', 'DE LA CRUZ', '20/08/1982', 'GACL820820QW2'],
    ['0001001-0004-H', 'ANA SOFIA', 'PEREZ', 'GARCIA', '14/02/2015', ''],
    ['0006006-0001-T', 'CARMEN', 'VILLA', '', '24/12/1988', 'VICA881224TT1'],
  ]),
  'Complemento',
);
save(comp, join(out, 'complemento_ejemplo.xlsx'));

writeFileSync(
  join(out, 'configuracion_ejemplo.json'),
  JSON.stringify(
    {
      version: 1,
      valoresPredeterminados: {
        tipoMovimiento: 'ALTA',
        nombreCliente: 'EMPRESA EJEMPLO SA DE CV',
        sucursal: '001',
        noEmpleado: '000123',
        formaPago: 'MENSUAL',
        email: 'rh@ejemplo.com.mx',
        telefono: '5555123456',
        calle: 'AV. REFORMA 100',
        cp: '06600',
        estado: 'CIUDAD DE MEXICO',
        municipio: 'CUAUHTEMOC',
        colonia: 'JUAREZ',
      },
    },
    null,
    2,
  ) + '\n',
);

// Variante con el nombre separado y encabezados que no coinciden con los previstos
// (ID ASEGURADO, CVE FAMILIA, MOVIMIENTO, NACIMIENTO): requieren asignación manual la primera vez.
{
  const sep = [
    ['ID ASEGURADO', 'CVE FAMILIA', 'NOMBRE(S)', 'APELLIDO PATERNO', 'APELLIDO MATERNO', 'SEXO', 'NACIMIENTO', 'FECHA DE MOVIMIENTO', 'ANTIGÜEDAD DESDE', 'MOVIMIENTO', 'GRUPO', 'PRIMA NETA'],
    ['0101001-0001-T', '005001', 'JUAN', 'PÉREZ', 'GÓMEZ', 'M', d('12/03/1985'), d('15/01/2026'), d('01/06/2018'), EMI, '01', 900],
    ['0101001-0002-C', '005001', 'MARIA DE LA LUZ', 'DEL VALLE', 'ROJAS', 'F', d('20/08/1987'), d('15/01/2026'), d('01/06/2018'), EMI, '01', 900],
    ['0101001-0003-H', '005001', 'JOSE LUIS', 'PÉREZ', 'DEL VALLE', 'M', d('05/09/2015'), d('15/01/2026'), d('01/06/2018'), ALTA, '01', 400],
    ['0102002-0001-T', '005002', 'CARMEN', 'VILLA', '', 'F', d('24/12/1988'), d('15/01/2026'), d('10/02/2021'), ALTA, '02', 900],
    ['0102002-0001-T', '005002', 'CARMEN', 'VILLA', '', 'F', d('24/12/1988'), d('16/01/2026'), d('10/02/2021'), BAJA, '02', -900],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(sep);
  for (const [addr, cell] of Object.entries(ws2)) {
    if (!addr.startsWith('!') && [6, 7, 8].includes(XLSX.utils.decode_cell(addr).c) && cell.t === 'n') cell.z = 'dd/mm/yyyy';
  }
  const wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2, ws2, 'Asegurados');
  save(wb2, join(out, 'asegurados_nombres_separados.xlsx'));
}

const gi = process.argv.indexOf('--grande');
if (gi >= 0) {
  const n = Number(process.argv[gi + 1]) || 60000;
  const big = [H];
  const nombres = ['JUAN', 'MARIA', 'JOSE LUIS', 'ANA', 'CARLOS', 'LAURA', 'MIGUEL ANGEL', 'SOFIA'];
  const apellidos = ['PEREZ', 'LOPEZ', 'GARCIA', 'MARTINEZ', 'DE LA CRUZ', 'HERNANDEZ', 'RAMIREZ', 'TORRES'];
  let fam = 0;
  while (big.length - 1 < n) {
    fam++;
    const id = String(fam).padStart(7, '0');
    const clave = String(100000 + fam);
    const ap = apellidos[fam % 8], am = apellidos[(fam * 3) % 8];
    big.push(r(`${id}-0001-T`, clave, `${nombres[fam % 8]} ${ap} ${am}`, fam % 2 ? 'M' : 'F', d('01/01/1980') + (fam % 9000), EMI, String(fam % 5).padStart(2, '0')));
    if (fam % 3 === 0) big.push(r(`${id}-0002-C`, clave, `${nombres[(fam + 1) % 8]} ${am} ${ap}`, fam % 2 ? 'F' : 'M', d('01/01/1982') + (fam % 9000), EMI));
    if (fam % 4 === 0) {
      big.push(r(`${id}-0003-H`, clave, `${nombres[(fam + 2) % 8]} ${ap} ${am}`, 'M', d('01/01/2010') + (fam % 3000), ALTA));
      big.push(r(`${id}-0003-H`, clave, `${nombres[(fam + 2) % 8]} ${ap} ${am}`, 'M', d('01/01/2010') + (fam % 3000), BAJA));
    }
    if (fam % 50 === 0) big.push(r(`${id}-0009-H`, String(900000 + fam), `HIJO SIN TITULAR ${ap}`, 'M', '', ALTA));
  }
  big.length = n + 1;
  const wbg = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbg, XLSX.utils.aoa_to_sheet(big), 'Movimientos');
  save(wbg, join(outGrande, 'asegurados_grande.xlsx'));
  console.log(`asegurados_grande.xlsx: ${n} movimientos`);
}
console.log(`Ejemplos generados en ${out}`);
