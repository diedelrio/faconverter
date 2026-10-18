/**
 * Datos de la versión. Al liberar una nueva versión: actualizar `version` en package.json
 * (se inyecta en la compilación), la fecha y añadir sus mejoras al inicio de CHANGELOG.
 */
export const APP_NAME = 'Conversor de altas de asegurados';
export const APP_VERSION: string = __APP_VERSION__;
export const RELEASE_DATE = '2026-10-19';
export const AUTHOR = 'diegohdelrio@gmail.com';

export interface ReleaseNotes {
  version: string;
  date: string;
  items: string[];
}

export const CHANGELOG: ReleaseNotes[] = [
  {
    version: '1.0.0',
    date: '2026-10-19',
    items: [
      'Conversión de movimientos a archivo de importación .xls (Excel 97-2003) de 32 columnas, con verificación por relectura.',
      'Compensación de altas y bajas, asociación con el titular y log de rechazados con razón única por movimiento.',
      'RFC calculado sin homoclave (reglas del SAT) y Fecha Alta GDS tomada de ANTIGÜEDAD DESDE.',
      'Admite nombre completo o separado en NOMBRE(S), APELLIDO PATERNO y APELLIDO MATERNO.',
      'Las asignaciones de columnas y los valores por defecto se recuerdan para la siguiente corrida.',
      'Avanzar rechazando incidencias por movimiento o por familia/certificado, con el motivo autocompletado.',
      'Indicador de progreso con tiempo restante estimado y botón «Nueva conversión».',
      'Manual de usuario integrado con guion de ejemplo y archivos de ejemplo descargables.',
      'Resumen con gráficos y reporte HTML autónomo. Todo el procesamiento ocurre en el navegador.',
      'Interfaz moderna y minimalista, con modo oscuro automático y diseño adaptado a móvil.',
    ],
  },
];
