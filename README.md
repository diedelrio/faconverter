# Conversor de altas de asegurados

**Versión 1.0.0** · liberada el 19/10/2026 · autor: diegohdelrio@gmail.com. Las mejoras de cada versión se ven en la app, en «Acerca de» (cabecera y pie de página).

Aplicación web en español que convierte un listado de movimientos de asegurados (Excel `.xlsx`) en el archivo de importación de altas (`.xls` binario, Excel 97-2003), además de un log de rechazados (`.xlsx`) y un reporte resumen (`.html` autónomo).

Todo el procesamiento ocurre en el navegador. Los datos personales no se envían a ningún servidor. La compilación añade una política CSP con `connect-src 'self'` que impide conexiones a otros orígenes.

## Uso

```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm run build      # compila en dist/
npm run preview    # sirve dist/ en http://localhost:4173
npm test           # pruebas automatizadas
npm run sample     # regenera los archivos de ejemplo en public/ejemplos/
node scripts/generate-sample.mjs --grande 60000   # archivo de volumen en samples/ (no se publica)
```

`dist/` puede publicarse en cualquier servidor estático (IIS, Nginx, SharePoint, etc.). Debe servirse por HTTP: abrir `index.html` directamente con `file://` no funciona, porque los Web Workers no cargan en ese modo.

## Manual de usuario y ejemplos

- El **manual de usuario** se abre desde la cabecera («? Manual de usuario») o el pie de página. Tiene índice, se puede imprimir o guardar como PDF y cubre: archivo de entrada, paso a paso, reglas, incidencias, archivos de salida, datos recordados, preguntas frecuentes y un **guion de ejemplo** de 9 pasos con el resultado esperado en cada uno (`src/ui/Manual.tsx`).
- Los **archivos de ejemplo** (`public/ejemplos/`) se publican con la app y se descargan desde el manual y desde la tarjeta «¿Primera vez?» del paso 1: `asegurados_ejemplo.xlsx`, `configuracion_ejemplo.json`, `complemento_ejemplo.xlsx` y `asegurados_nombres_separados.xlsx`. Se regeneran con `npm run sample`; si cambian, revise las cifras del guion (la prueba `tests/e2e.test.ts` las comprueba).

## Flujo en cinco pasos

1. **Cargar archivo.** El nombre puede venir completo en ASEGURADO(S) o separado en NOMBRE(S), APELLIDO PATERNO y APELLIDO MATERNO; si viene separado se usa tal cual (procedencia «Origen», sin revisión pendiente). Las columnas que se asignen a mano se recuerdan en el navegador y se aplican solas en la siguiente corrida con los mismos encabezados (sin distinguir mayúsculas, acentos ni espacios); se pueden olvidar con «Olvidar asignaciones guardadas». A las columnas sin asignar (SEXO, fechas, DESCRIPCIÓN, ENDOSO, STATUS, GRUPO) se les puede dar un **valor por defecto**: si la columna no viene en el archivo se aplica a todas las filas; si viene, solo a las celdas vacías. Los valores por defecto también se recuerdan, se informan al leer el archivo («Valores por defecto aplicados…») y se marcan en el editor del registro. Los identificadores y nombres no admiten valor por defecto.
   Se carga el Excel y, opcionalmente, la configuración JSON y la tabla complementaria. Si hay varias hojas candidatas o faltan columnas obligatorias, la conversión no avanza hasta que se elige la hoja o se asignan las columnas.
2. **Datos de ejecución.** Póliza, plan y fecha de inicio de vigencia del certificado se piden en cada ejecución. Los demás campos se cargan desde la configuración. Fecha Baja GDS y Fecha Otra Compañía son opcionales; **Fecha Alta GDS se toma de ANTIGÜEDAD DESDE** de cada movimiento.
3. **Revisión.** Tabla virtualizada con claves, movimiento original, parentesco, titular asociado, estado y razón. Se puede filtrar y buscar. Al pulsar una fila se abre el editor, donde se corrigen nombres, RFC, fecha, sexo y claves, o se excluye el registro con un motivo.
4. **Incidencias y confirmación.** Aquí se clasifican las descripciones no previstas, se resuelven las incidencias bloqueantes y se confirma el resultado. Para avanzar sin corregir, «Avanzar rechazando» permite rechazar **los movimientos con incidencia** o **la familia/certificado completo** (todos los movimientos vigentes con la misma CLAVE DE IDENTIDAD), para todas las incidencias o solo para la seleccionada; también desde el editor de cada registro. En el log quedan con la razón «Rechazado por incidencia» y el detalle de la incidencia (en los familiares arrastrados: «Familia/certificado X rechazado por incidencia en NUM.ID. (fila N): …»). Los movimientos ya rechazados por una regla automática conservan su razón. «Deshacer rechazos por incidencia» los revierte.
5. **Descargas y resumen.** Se descargan el `.xls`, el log y el reporte. El paso muestra los indicadores, los dos gráficos de torta y la vista previa de la importación.

## Liberar una nueva versión

1. Subir `version` en `package.json`; se inyecta en la compilación y aparece en la app y en el reporte HTML.
2. Actualizar `RELEASE_DATE` y añadir la versión con sus mejoras al inicio de `CHANGELOG` en `src/version.ts`.
3. `npm test` y `npm run build`; publicar `dist/`.

## Progreso y nueva conversión

- Mientras se carga un archivo, se procesan las filas o se generan los archivos, se muestra la fase en curso, el porcentaje y el tiempo restante estimado.
- Las lecturas y escrituras de Excel son llamadas únicas a la biblioteca: su avance se estima con ritmos (bytes o celdas por milisegundo) que se ajustan solos con cada ejecución en ese equipo (`localStorage`). El procesamiento de filas informa el avance real.
- En el paso 5, «Nueva conversión» y «Volver al inicio» descartan el archivo y las correcciones de la corrida (previa confirmación). Se conservan la configuración, las asignaciones de columnas, los valores por defecto y las opciones.

## Arquitectura

| Módulo | Archivo |
|---|---|
| Lectura y normalización | `src/core/reader.ts`, `src/core/normalize.ts`, `src/core/dates.ts` (se ejecuta en `reader.worker.ts`) |
| Configuración y datos de ejecución | `src/core/config.ts` |
| Ordenación estable | `src/core/sorting.ts` |
| Compensación de altas y bajas | `src/core/compensation.ts` |
| Asociación familiar | `src/core/family.ts` |
| Validación y correcciones | `src/core/validation.ts`, `src/core/names.ts`, `src/core/complement.ts`, `src/core/rfc.ts` |
| Orquestación (orden de reglas) | `src/core/pipeline.ts` |
| Exportación | `src/core/exportRows.ts` (filas), `src/core/exportXls.ts` (archivos, en el worker) |
| Resumen y gráficos | `src/core/summary.ts`, `src/ui/PieChart.tsx` |
| Interfaz | `src/App.tsx`, `src/ui/*` |

- Los movimientos originales son inmutables. Las correcciones, exclusiones y clasificaciones se guardan aparte, vinculadas al identificador interno (`r<fila>`), y se conservan aunque se ordene o filtre la tabla.
- `evaluate()` es una función pura que recalcula estados, conteos e incidencias ante cualquier cambio. Los datos de ejecución se validan por separado, así que editar el formulario no reclasifica todo.
- La biblioteca es **SheetJS 0.20.3** (distribución oficial `cdn.sheetjs.com`, sin vulnerabilidades conocidas). Genera BIFF8 real en contenedor OLE2, con la firma `D0 CF 11 E0`.

## Reglas aplicadas (en este orden)

1. **Exclusiones explícitas:** las manuales, con su motivo, y las descripciones clasificadas como «no aplicable». Ambas salen de la secuencia antes de compensar.
2. **Ordenación:** por `CLAVE DE IDENTIDAD` y luego `NUM.ID.`, con comparación natural (los segmentos numéricos se comparan por su valor). En empate se conserva la fila original.
3. **Compensación:** dentro de cada grupo (misma clave y mismo NUM.ID.), un alta seguida inmediatamente de una baja forma una pareja `P-0001…`. La razón es «Asegurado dado de baja» y ninguna fila se reutiliza. Las bajas sin pareja se rechazan con la razón «Baja sin alta asociada».
4. **Titular:** se buscan los registros con terminación `T` en todo el grupo de la clave. Si un grupo no tiene titular vigente, todos sus registros se rechazan con «Sin titular asociado».
5. **Validación:** las incidencias bloqueantes son claves ausentes, duplicados no resueltos, varios titulares, parentesco desconocido, fecha de nacimiento inválida, sexo no reconocido, nombre o apellido paterno vacíos, RFC con formato inválido, descripción sin clasificar, datos de ejecución incompletos y más de 65.535 aceptados.

Cada movimiento rechazado tiene una única razón principal, y siempre se cumple `Total = Aceptados + Rechazados`.

## RFC calculado

Cuando el RFC no viene de la tabla complementaria ni de una corrección manual, se calcula **sin homoclave** (10 caracteres, ABCD + AAMMDD) a partir de nombre, apellidos y fecha de nacimiento. La procedencia se muestra como «Calculado (sin homoclave)».

- Regla general: inicial del apellido paterno, su primera vocal interna, inicial del materno, inicial del nombre y fecha AAMMDD. Ejemplo: Juan Pérez Gómez, 12/03/1985 → `PEGJ850312`.
- Casos especiales del SAT: se ignoran partículas (DE, DEL, LA…); con JOSE/MARIA compuestos se usa el segundo nombre; con un solo apellido se toman dos letras del apellido y dos del nombre; con paterno de 1-2 letras, inicial paterno + inicial materno + dos letras del nombre; sin vocal interna se usa X; Ñ → X; las palabras altisonantes cambian la cuarta letra por X.
- Sin fecha de nacimiento no se calcula (advertencia «Sin RFC»).
- Si un RFC del complemento o manual no coincide con el calculado en sus 10 primeros caracteres, aparece la advertencia «RFC distinto al calculado».

## Decisiones que conviene validar

- **Descripciones no previstas** (p. ej. «MODIFICACIÓN DE DATOS»): bloquean hasta que el usuario las clasifica como alta, baja o no aplicable. Las cuatro descripciones del requisito son fijas.
- **Fecha de nacimiento y RFC vacíos:** generan una advertencia y se exportan vacíos. En el paso 2 hay casillas para exigirlos, igual que la revisión de todas las separaciones de nombre.
- **ANTIGÜEDAD DESDE** es ahora columna obligatoria: inválida bloquea (se corrige en el editor del registro); vacía genera advertencia y Fecha Alta GDS se exporta vacía.
- **Fechas no exportadas inválidas** (movimiento, inicio de vigencia): generan una advertencia, no un bloqueo.
- **Nombres:** por defecto, los dos últimos términos son los apellidos. Las partículas (DE, DEL, LA…) se agrupan, de modo que «GARCIA DE LA CRUZ» da paterno GARCIA y materno DE LA CRUZ. Hay una opción para el orden «Apellidos Nombres».
- **Campos obligatorios de ejecución:** Póliza, Tipo Movimiento, Nombre Cliente, Forma de Pago, Nombre Plan y Fecha Inicio Vigencia Certificado.
- **Persistencia:** en el navegador solo se guardan (1) los predeterminados, cuando el usuario pulsa «Guardar como predeterminados», y (2) las asignaciones manuales de columnas (encabezado → columna), al aplicar la asignación. Nunca se guardan datos de asegurados.
- **Nombre separado y completo a la vez:** si una fila trae ambas cosas, prevalecen las columnas separadas; si las separadas vienen vacías en una fila, se propone la separación de ASEGURADO(S).

## Configuración JSON

Solo se admiten los campos configurables. Las demás claves se ignoran y se informan al cargar el archivo. Ver `public/ejemplos/configuracion_ejemplo.json`:

```json
{ "version": 1, "valoresPredeterminados": { "tipoMovimiento": "ALTA", "nombreCliente": "...", "sucursal": "001", "noEmpleado": "000123", "formaPago": "MENSUAL", "email": "...", "telefono": "...", "calle": "...", "cp": "06600", "estado": "...", "municipio": "...", "colonia": "..." } }
```

## Rendimiento medido (Edge, 60.000 movimientos)

- Lectura y clasificación: 2,7 s.
- Recálculo tras una corrección: alrededor de 0,5 s, diferido para que la edición no se bloquee.
- Generación del `.xls` con 43.000 filas, más relectura de verificación y log: 4,1 s, en el worker.

## Pruebas

`npm test` ejecuta 58 pruebas:

- Ordenación y empates.
- Archivo con nombre separado y asignaciones de columnas recordadas.
- Valores por defecto de columnas y rechazo por incidencia (movimiento y familia/certificado).
- RFC sin homoclave (regla general y casos especiales) y Fecha Alta GDS desde ANTIGÜEDAD DESDE.
- Parejas sin reutilización, altas y bajas repetidas, titular dado de baja y familiares sin titular.
- Duplicados, varios titulares y parentesco desconocido.
- Nombres compuestos y fechas ausentes o inválidas.
- Prioridad del formulario sobre la configuración.
- 32 columnas exactas, ceros iniciales, fechas `dd/mm/aaaa` y archivo releído igual a la vista previa.
- Log vacío con encabezados y límite de 65.535.
- Flujo completo con `public/ejemplos/asegurados_ejemplo.xlsx` y el guion del manual paso a paso (las cifras del manual están verificadas por pruebas).

**Pendiente:** comprobar la compatibilidad final importando el `.xls` en el sistema receptor.
