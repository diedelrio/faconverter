import type { IssueCode, Provenance, RowStatus, WarningCode } from '../core/types';

export { ISSUE_LABELS } from '../core/incidents';

export const ISSUE_HELP: Record<IssueCode, string> = {
  claveAusente: 'Complete la CLAVE DE IDENTIDAD o el NUM.ID. en el editor del registro, o exclúyalo.',
  duplicado: 'El mismo NUM.ID. sigue vigente más de una vez tras la compensación. Excluya las filas sobrantes indicando el motivo.',
  variosTitulares: 'Hay más de un NUM.ID. titular en la misma clave. Corrija la clave de la familia que corresponda o excluya el titular sobrante.',
  parentescoDesconocido: 'El último segmento del NUM.ID. debe ser T, C o H. Corrija el NUM.ID. o excluya el registro.',
  fechaInvalida: 'Corrija la fecha de nacimiento o ANTIGÜEDAD DESDE (dd/mm/aaaa) en el editor del registro, o déjela vacía.',
  sexoInvalido: 'Seleccione Masculino o Femenino en el editor del registro.',
  datosIncompletos: 'Complete nombre y apellido paterno (y los datos exigidos en las validaciones estrictas).',
  rfcInvalido: 'El RFC debe tener 4 letras, 6 dígitos de fecha y, opcionalmente, 3 caracteres de homoclave.',
  descripcionSinClasificar: 'Clasifique la descripción en la tabla de descripciones (alta, baja o no aplicable).',
};

export const WARNING_LABELS: Record<WarningCode, string> = {
  nombrePendiente: 'Separación de nombre pendiente de revisión',
  sinFechaNacimiento: 'Sin fecha de nacimiento',
  sinRfc: 'Sin RFC',
  subgrupoVacio: 'GRUPO vacío',
  identificadorDistintoTitular: 'Identificador distinto al del titular',
  fechaOrigenInvalida: 'Fecha de movimiento no reconocida',
  complementoPorNombre: 'Complemento relacionado por nombre',
  complementoAmbiguo: 'Complemento ambiguo: confirme',
  rfcNoCoincide: 'RFC distinto al calculado',
  sinFechaAltaGds: 'Sin ANTIGÜEDAD DESDE (Fecha Alta GDS)',
};

export const STATUS_LABELS: Record<RowStatus, string> = {
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  bloqueado: 'Con incidencia',
};

export const PROVENANCE_LABELS: Record<Provenance, string> = {
  origen: 'Origen',
  propuesta: 'Propuesta (origen)',
  complemento: 'Tabla complementaria',
  manual: 'Corrección manual',
  calculado: 'Calculado (sin homoclave)',
};

export const PARENTESCO_FULL = { T: 'Titular', C: 'Cónyuge', H: 'Hijo' } as const;
