import { useEffect, type ReactNode } from 'react';
import { APP_NAME, APP_VERSION } from '../version';

/** Archivos de ejemplo publicados con la app (public/ejemplos). */
export const SAMPLE_FILES = [
  {
    file: 'asegurados_ejemplo.xlsx',
    title: 'Listado de asegurados de ejemplo',
    desc: '26 movimientos con todos los casos: altas y bajas repetidas, titular dado de baja, familiares sin titular, duplicados, fecha inválida, varios titulares, parentesco desconocido, filas de totales y columnas de primas.',
  },
  {
    file: 'configuracion_ejemplo.json',
    title: 'Configuración de ejemplo',
    desc: 'Valores predeterminados de Tipo Movimiento, Nombre Cliente, Sucursal, No. Empleado, Forma de Pago, contacto y domicilio.',
  },
  {
    file: 'complemento_ejemplo.xlsx',
    title: 'Tabla complementaria de ejemplo',
    desc: 'Nombres, fechas de nacimiento y RFC con homoclave de algunos asegurados, relacionados por NUM.ID.',
  },
  {
    file: 'asegurados_nombres_separados.xlsx',
    title: 'Listado con nombre separado',
    desc: 'Nombre, apellido paterno y materno en columnas propias, con encabezados no estándar (ID ASEGURADO, CVE FAMILIA, MOVIMIENTO, NACIMIENTO) para practicar la asignación manual de columnas.',
  },
];

export function SampleDownloads({ compact }: { compact?: boolean }) {
  return (
    <ul className={compact ? 'samples compact' : 'samples'}>
      {SAMPLE_FILES.map((s) => (
        <li key={s.file}>
          <a className="btn small" href={`ejemplos/${s.file}`} download={s.file}>
            ⤓ {s.file}
          </a>
          {!compact && (
            <span>
              <strong>{s.title}.</strong> <span className="muted">{s.desc}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

const SECTIONS: { id: string; title: string }[] = [
  { id: 'intro', title: '1. Qué hace la aplicación' },
  { id: 'entrada', title: '2. Archivo de entrada' },
  { id: 'pasos', title: '3. Paso a paso' },
  { id: 'reglas', title: '4. Reglas de procesamiento' },
  { id: 'incidencias', title: '5. Incidencias y cómo resolverlas' },
  { id: 'salida', title: '6. Archivos que se generan' },
  { id: 'recordar', title: '7. Configuración y datos recordados' },
  { id: 'guion', title: '8. Guion de ejemplo' },
  { id: 'faq', title: '9. Preguntas frecuentes' },
  { id: 'ejemplos', title: '10. Archivos de ejemplo' },
];

const Sec = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <section id={`manual-${id}`} className="manual-sec">
    <h2>{title}</h2>
    {children}
  </section>
);

/** Paso del guion con el resultado esperado. */
const Step = ({ n, children, expect }: { n: number; children: ReactNode; expect: ReactNode }) => (
  <li className="guion-step">
    <span className="guion-n">{n}</span>
    <div>
      <div>{children}</div>
      <div className="guion-expect">
        <strong>Resultado esperado:</strong> {expect}
      </div>
    </div>
  </li>
);

export function Manual({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('manual-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('manual-open');
    };
  }, [onClose]);

  const goto = (id: string) => document.getElementById(`manual-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="manual" role="dialog" aria-modal="true" aria-labelledby="manual-title">
      <header className="manual-head">
        <div>
          <h1 id="manual-title">Manual de usuario</h1>
          <p className="muted small">
            {APP_NAME} · versión {APP_VERSION}
          </p>
        </div>
        <div className="row gap">
          <button className="btn" onClick={() => window.print()} title="Imprimir o guardar como PDF">
            Imprimir / PDF
          </button>
          <button className="btn primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </header>
      <div className="manual-body">
        <nav className="manual-toc" aria-label="Índice del manual">
          {SECTIONS.map((s) => (
            <button key={s.id} className="btn link" onClick={() => goto(s.id)}>
              {s.title}
            </button>
          ))}
        </nav>
        <article className="manual-content">
          <Sec id="intro" title="1. Qué hace la aplicación">
            <p>
              Convierte el listado de movimientos de asegurados (Excel <code>.xlsx</code>) en el <strong>archivo de importación de altas</strong> (
              <code>.xls</code>, Excel 97-2003) que espera el sistema receptor, y además genera:
            </p>
            <ul>
              <li>
                un <strong>log de rechazados</strong> (<code>.xlsx</code>) con cada movimiento excluido y su razón;
              </li>
              <li>
                un <strong>reporte resumen</strong> (<code>.html</code>) con los totales y dos gráficos.
              </li>
            </ul>
            <p className="notice ok">
              <strong>Privacidad:</strong> los archivos se procesan solo en su navegador. Ningún dato personal se envía a un servidor.
            </p>
            <p>Use un navegador actualizado (Microsoft Edge, Google Chrome o Firefox).</p>
          </Sec>

          <Sec id="entrada" title="2. Archivo de entrada">
            <p>Un Excel con los encabezados en la primera fila y un movimiento por fila. Columnas reconocidas:</p>
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Columna</th>
                  <th>Contenido</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['NUM.ID.', 'Identificador identificador-secuencia-parentesco, p. ej. 1234567-0001-T (T titular, C cónyuge, H hijo). Obligatoria.'],
                  ['CLAVE DE IDENTIDAD', 'Clave común del titular y su familia. Obligatoria.'],
                  ['ASEGURADO(S)', 'Nombre completo. Puede sustituirse por NOMBRE(S) + APELLIDO PATERNO (+ APELLIDO MATERNO).'],
                  ['SEXO', 'M o F. Obligatoria (admite valor por defecto).'],
                  ['FECHA DE NACIMIENTO', 'Puede venir vacía. Se usa para calcular el RFC.'],
                  ['FECHA DE MOVIMIENTO', 'Aparece en el log.'],
                  ['ANTIGÜEDAD DESDE', 'Se exporta como Fecha Alta GDS. Obligatoria (admite valor por defecto).'],
                  ['DESCRIPCIÓN', 'Tipo de movimiento: identifica altas y bajas.'],
                  ['GRUPO', 'Se exporta como Subgrupo. Obligatoria (admite valor por defecto).'],
                  ['FECHA DE INICIO VIG., ENDOSO, STATUS', 'Opcionales, solo informativas.'],
                ].map(([a, b]) => (
                  <tr key={a}>
                    <td>
                      <strong>{a}</strong>
                    </td>
                    <td>{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul>
              <li>No importan mayúsculas, acentos ni espacios repetidos en los encabezados.</li>
              <li>Las columnas de primas, recargos e impuestos se leen pero no se exportan.</li>
              <li>Las filas vacías, de totales y de contadores se omiten y no cuentan como movimientos.</li>
            </ul>
          </Sec>

          <Sec id="pasos" title="3. Paso a paso">
            <h3>Paso 1 · Cargar archivo</h3>
            <ul>
              <li>Arrastre el Excel al recuadro o haga clic para elegirlo. Se muestra el progreso y el tiempo restante estimado.</li>
              <li>Si el libro tiene varias hojas con datos, elija la correcta.</li>
              <li>
                Si falta alguna columna obligatoria, se abre la tabla de asignación: elija qué columna del archivo corresponde a cada campo o escriba
                un <strong>valor por defecto</strong> (si la columna no existe se aplica a todas las filas; si existe, solo a las celdas vacías). Pulse
                <em> Aplicar asignación y leer movimientos</em>.
              </li>
              <li>
                Opcional: importe la <strong>configuración</strong> (<code>.json</code>) y la <strong>tabla complementaria</strong> (nombres, fechas
                de nacimiento y RFC por NUM.ID.).
              </li>
            </ul>
            <h3>Paso 2 · Datos de ejecución</h3>
            <ul>
              <li>
                Complete en cada corrida <strong>No. Póliza Master</strong>, <strong>Nombre Plan</strong> y{' '}
                <strong>Fecha Inicio Vigencia Certificado</strong>.
              </li>
              <li>Los demás campos se precargan desde la configuración; lo que escriba aquí prevalece.</li>
              <li>
                Fecha Baja GDS y Fecha Otra Compañía son opcionales. <strong>Fecha Alta GDS</strong> se toma de ANTIGÜEDAD DESDE de cada movimiento.
              </li>
              <li>Puede activar validaciones estrictas (exigir fecha de nacimiento, RFC o revisión de nombres).</li>
            </ul>
            <h3>Paso 3 · Revisar movimientos</h3>
            <ul>
              <li>
                La tabla muestra cada movimiento con su clave, el movimiento original, el titular asociado y su estado:{' '}
                <span className="status st-aceptado">Aceptado</span> <span className="status st-rechazado">Rechazado</span>{' '}
                <span className="status st-bloqueado">Con incidencia</span>.
              </li>
              <li>Filtre por estado, razón, incidencia o advertencia, o busque por nombre, clave, NUM.ID. o fila.</li>
              <li>
                Haga clic en una fila para abrir el <strong>editor</strong>: corregir nombre y apellidos, sexo, fecha de nacimiento, RFC, ANTIGÜEDAD
                DESDE o las claves; confirmar la separación del nombre; excluir el registro o rechazarlo por incidencia. Cada dato indica su
                procedencia (origen, propuesta, tabla complementaria, calculado o corrección manual).
              </li>
            </ul>
            <h3>Paso 4 · Incidencias y confirmación</h3>
            <ul>
              <li>Clasifique las descripciones no previstas (alta, baja o no aplicable).</li>
              <li>
                Corrija las incidencias o use <strong>Avanzar rechazando</strong>: rechazar solo los movimientos con incidencia o la{' '}
                <strong>familia/certificado</strong> completo. El motivo del log se completa con la incidencia.
              </li>
              <li>Marque «He revisado los movimientos y confirmo el resultado».</li>
            </ul>
            <h3>Paso 5 · Descargas y resumen</h3>
            <ul>
              <li>La aplicación genera el .xls, lo vuelve a leer y comprueba que coincide con la vista previa.</li>
              <li>Descargue la importación (.xls), el log (.xlsx) y el reporte (.html).</li>
              <li>
                Con <strong>Nueva conversión</strong> vuelve al inicio; se conservan la configuración, las asignaciones de columnas y los valores por
                defecto.
              </li>
            </ul>
          </Sec>

          <Sec id="reglas" title="4. Reglas de procesamiento">
            <ol>
              <li>
                <strong>Orden:</strong> por CLAVE DE IDENTIDAD y NUM.ID. (los números se comparan por su valor); en empate se respeta el orden del
                archivo.
              </li>
              <li>
                <strong>Compensación:</strong> en un mismo NUM.ID., un alta (EMISIÓN DE LA POLIZA, ALTA DE INCISOS/ASEGURADOS) seguida inmediatamente
                de una baja (BAJA DE INCISOS/ASEGURADOS, CANCELACIÓN AUTOMÁTICA ENDOSOS) se excluyen ambas con la razón{' '}
                <em>Asegurado dado de baja</em> y un identificador de pareja (P-0001…). Una baja sin alta previa: <em>Baja sin alta asociada</em>.
              </li>
              <li>
                <strong>Titular:</strong> si en una clave no queda ningún titular (T) vigente, sus familiares se excluyen con <em>Sin titular asociado</em>.
              </li>
              <li>
                <strong>Nombre:</strong> si viene completo, se proponen los dos últimos términos como apellidos (agrupando DE, DEL, LA…), pendiente de
                revisión.
              </li>
              <li>
                <strong>RFC:</strong> si no viene en la tabla complementaria ni se corrige a mano, se calcula sin homoclave (10 caracteres) con
                nombre, apellidos y fecha de nacimiento según las reglas del SAT. Ejemplo: Juan Pérez Gómez, 12/03/1985 → PEGJ850312.
              </li>
            </ol>
            <p>Cada movimiento termina aceptado o rechazado con una sola razón: Total = Aceptados + Rechazados.</p>
          </Sec>

          <Sec id="incidencias" title="5. Incidencias y cómo resolverlas">
            <p>Las incidencias bloquean la conversión hasta que se corrigen o se rechazan los movimientos afectados.</p>
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Incidencia</th>
                  <th>Cómo resolverla</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Clave o identificador ausente', 'Escriba la CLAVE o el NUM.ID. en el editor, o rechace el movimiento.'],
                  ['Duplicado no resuelto', 'El mismo NUM.ID. sigue vigente dos veces: excluya la copia sobrante.'],
                  ['Varios titulares en una familia', 'Corrija la clave de la familia equivocada o excluya el titular sobrante.'],
                  ['Parentesco desconocido', 'El NUM.ID. debe terminar en T, C o H: corríjalo.'],
                  ['Fecha inválida', 'Corrija la fecha de nacimiento o ANTIGÜEDAD DESDE (dd/mm/aaaa).'],
                  ['Sexo no reconocido', 'Elija Masculino o Femenino.'],
                  ['Datos obligatorios incompletos', 'Complete nombre y apellido paterno (y lo exigido por las validaciones estrictas).'],
                  ['RFC con formato inválido', 'Corrija el RFC o bórrelo para que se calcule.'],
                  ['Descripción sin clasificar', 'Clasifíquela en la tabla de descripciones del paso 4.'],
                ].map(([a, b]) => (
                  <tr key={a}>
                    <td>
                      <strong>{a}</strong>
                    </td>
                    <td>{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Las <strong>advertencias</strong> (sin RFC, sin fecha de nacimiento, nombre pendiente de revisión, GRUPO vacío…) no bloquean.
            </p>
          </Sec>

          <Sec id="salida" title="6. Archivos que se generan">
            <ul>
              <li>
                <strong>Importación (.xls):</strong> hoja «Tabla 1» con 32 columnas. Las columnas 7-12 llevan los datos del titular y las 13-18 los del
                familiar (vacías en la fila del titular). Las fechas se guardan como fechas dd/mm/aaaa; póliza, RFC, teléfonos y CP como texto (se
                conservan los ceros iniciales).
              </li>
              <li>
                <strong>Log (.xlsx):</strong> hoja «Rechazados» con fila original, claves, nombre, descripción, fecha de movimiento, razón, pareja de
                compensación y detalle. Si no hay rechazos contiene solo los encabezados.
              </li>
              <li>
                <strong>Reporte (.html):</strong> totales y gráficos; se abre sin conexión y no contiene datos personales.
              </li>
            </ul>
            <p>El formato .xls admite hasta 65.535 movimientos aceptados por archivo.</p>
          </Sec>

          <Sec id="recordar" title="7. Configuración y datos recordados">
            <ul>
              <li>
                <strong>Configuración JSON:</strong> en el paso 2 puede descargar la configuración actual o guardarla como predeterminada en el
                navegador. Póliza, plan y fecha de vigencia del certificado nunca se guardan.
              </li>
              <li>
                <strong>Asignaciones de columnas y valores por defecto:</strong> se recuerdan en este navegador al aplicar la asignación y se usan
                solos la próxima vez (aparecen como «recordada»). Se borran con «Olvidar asignaciones guardadas».
              </li>
              <li>Nunca se guardan datos de asegurados.</li>
            </ul>
          </Sec>

          <Sec id="guion" title="8. Guion de ejemplo">
            <p>
              Práctica guiada de unos 5 minutos con los archivos de ejemplo. Descárguelos en la sección{' '}
              <button className="btn link" onClick={() => goto('ejemplos')}>
                10. Archivos de ejemplo
              </button>{' '}
              y siga los pasos; cada uno indica qué debe ver.
            </p>
            <ol className="guion">
              <Step n={1} expect="«26 movimientos leídos». Se omiten 2 filas vacías y 2 de totales; las columnas de primas se leen pero no se exportan.">
                En el paso 1, cargue <code>asegurados_ejemplo.xlsx</code>.
              </Step>
              <Step n={2} expect="«Configuración cargada: 12 valores» y «4 registros (hoja Complemento)».">
                Importe <code>configuracion_ejemplo.json</code> y cargue la tabla complementaria <code>complemento_ejemplo.xlsx</code>.
              </Step>
              <Step n={3} expect="Nombre Cliente, Sucursal, Forma de Pago, etc. aparecen precargados con la etiqueta «configuración».">
                Pulse <em>Siguiente</em>. Escriba Póliza <code>PM-000987</code>, Plan <code>PLAN EMPRESARIAL</code> y Fecha Inicio Vigencia
                Certificado <code>01/02/2026</code>.
              </Step>
              <Step n={4} expect="Total 26 · Aceptados 8 · Rechazados 10 · Con incidencia 8.">
                Pulse <em>Siguiente</em> para revisar los movimientos.
              </Step>
              <Step
                n={5}
                expect="Las 4 primeras filas de ANA SOFIA forman las parejas P-0001 y P-0002 («Asegurado dado de baja»); su última alta queda aceptada. ROBERTO SANCHEZ se compensa y su cónyuge e hijo quedan «Sin titular asociado»."
              >
                Busque <code>ANA SOFIA</code> y luego <code>000777</code> para ver la compensación de altas y bajas.
              </Step>
              <Step n={6} expect="Al guardar, el registro pasa a «Aceptado» y el RFC calculado aparece en el editor.">
                Busque <code>NUÑEZ</code>, abra el registro y corrija la fecha de nacimiento a <code>28/02/1981</code> y el sexo a Masculino.
              </Step>
              <Step n={7} expect="Quedan 5 movimientos con incidencia: Duplicado no resuelto (2), Varios titulares (2) y Parentesco desconocido (1).">
                Vaya al paso 4 y clasifique <code>MODIFICACIÓN DE DATOS</code> como «No aplicable».
              </Step>
              <Step
                n={8}
                expect="Opción A: Total 26 = Aceptados 10 + Rechazados 16. Opción B: se rechazan 3 familias (6 movimientos) y queda Aceptados 9 + Rechazados 17."
              >
                En <em>Avanzar rechazando</em>, elija <strong>A)</strong> «Rechazar 5 movimientos con incidencia» o <strong>B)</strong> «Rechazar 3
                familias/certificados».
              </Step>
              <Step n={9} expect="«Verificación correcta» y los tres archivos disponibles. En el log, los rechazados por incidencia muestran el motivo.">
                Marque la confirmación y pulse <em>Siguiente</em>. Descargue la importación, el log y el reporte.
              </Step>
            </ol>
            <p>
              <strong>Práctica adicional:</strong> cargue <code>asegurados_nombres_separados.xlsx</code>. Asigne a mano NUM.ID. → ID ASEGURADO, CLAVE
              DE IDENTIDAD → CVE FAMILIA, FECHA DE NACIMIENTO → NACIMIENTO y DESCRIPCIÓN → MOVIMIENTO. Pulse <em>Nueva conversión</em> y cárguelo de
              nuevo: las cuatro columnas se asignan solas («recordada»).
            </p>
          </Sec>

          <Sec id="faq" title="9. Preguntas frecuentes">
            <dl className="faq">
              <dt>No puedo pasar al paso siguiente.</dt>
              <dd>Lea el mensaje junto al botón «Siguiente»: faltan columnas, datos de ejecución o hay incidencias sin resolver.</dd>
              <dt>¿Por qué un familiar quedó rechazado si sus datos están bien?</dt>
              <dd>Porque su titular fue dado de baja o no existe en el archivo («Sin titular asociado»).</dd>
              <dt>El RFC no tiene homoclave.</dt>
              <dd>La homoclave la asigna el SAT; cárguela con la tabla complementaria o escríbala en el editor.</dd>
              <dt>Me equivoqué al rechazar por incidencia.</dt>
              <dd>Use «Deshacer rechazos por incidencia» en el paso 4, o «Volver a incluir» en el editor del registro.</dd>
              <dt>Una columna se asigna mal automáticamente.</dt>
              <dd>Cámbiela en la tabla de asignación del paso 1; la próxima vez se recordará su elección.</dd>
              <dt>El sistema receptor rechaza el archivo.</dt>
              <dd>Compruebe los datos de ejecución (póliza, plan, fechas) y envíe el log y el reporte a soporte junto con el archivo.</dd>
            </dl>
          </Sec>

          <Sec id="ejemplos" title="10. Archivos de ejemplo">
            <p>Descargue los archivos para practicar con el guion de la sección 8. Son datos ficticios.</p>
            <SampleDownloads />
          </Sec>
        </article>
      </div>
    </div>
  );
}
