/**
 * Configuración (valores predeterminados en JSON) y datos de ejecución.
 * La configuración solo puede predefinir los campos permitidos. Los valores introducidos
 * en el formulario siempre prevalecen sobre la configuración.
 */
import { normalizeHeader } from './normalize';
import { parseDateText } from './dates';

export type ExecField =
  | 'poliza'
  | 'tipoMovimiento'
  | 'nombreCliente'
  | 'sucursal'
  | 'noEmpleado'
  | 'formaPago'
  | 'nombrePlan'
  | 'email'
  | 'telefono'
  | 'calle'
  | 'cp'
  | 'estado'
  | 'municipio'
  | 'colonia'
  | 'fechaInicioVigenciaCert'
  | 'fechaBajaGds'
  | 'fechaOtraCompania';

export type ExecData = Record<ExecField, string>;

export interface ExecFieldDef {
  key: ExecField;
  label: string;
  type: 'text' | 'date' | 'email' | 'tel';
  required: boolean;
  /** Puede predefinirse en el archivo de configuración. */
  configurable: boolean;
  /** Debe completarse explícitamente en cada ejecución. */
  perRun?: boolean;
  hint?: string;
}

export const EXEC_FIELDS: ExecFieldDef[] = [
  { key: 'poliza', label: 'No. Póliza Master', type: 'text', required: true, configurable: false, perRun: true },
  { key: 'tipoMovimiento', label: 'Tipo Movimiento', type: 'text', required: true, configurable: true },
  { key: 'nombreCliente', label: 'Nombre Cliente', type: 'text', required: true, configurable: true },
  { key: 'sucursal', label: 'Sucursal', type: 'text', required: false, configurable: true },
  {
    key: 'noEmpleado',
    label: 'No. Empleado',
    type: 'text',
    required: false,
    configurable: true,
    hint: 'Valor del lote: se aplica a todos los registros aceptados.',
  },
  { key: 'formaPago', label: 'Forma de Pago', type: 'text', required: true, configurable: true },
  { key: 'nombrePlan', label: 'Nombre Plan', type: 'text', required: true, configurable: false, perRun: true },
  { key: 'email', label: 'E-mail', type: 'email', required: false, configurable: true },
  { key: 'telefono', label: 'Teléfono', type: 'tel', required: false, configurable: true },
  { key: 'calle', label: 'Calle', type: 'text', required: false, configurable: true },
  { key: 'cp', label: 'CP', type: 'text', required: false, configurable: true },
  { key: 'estado', label: 'Estado', type: 'text', required: false, configurable: true },
  { key: 'municipio', label: 'Municipio', type: 'text', required: false, configurable: true },
  { key: 'colonia', label: 'Colonia', type: 'text', required: false, configurable: true },
  {
    key: 'fechaInicioVigenciaCert',
    label: 'Fecha Inicio Vigencia Certificado',
    type: 'date',
    required: true,
    configurable: false,
    perRun: true,
  },
  { key: 'fechaBajaGds', label: 'Fecha Baja GDS', type: 'date', required: false, configurable: false, hint: 'Opcional. Vacía si no se indica.' },
  {
    key: 'fechaOtraCompania',
    label: 'Fecha Otra Compañía',
    type: 'date',
    required: false,
    configurable: false,
    hint: 'Opcional. Vacía si no se indica.',
  },
];

export const EXEC_FIELD_BY_KEY = Object.fromEntries(EXEC_FIELDS.map((f) => [f.key, f])) as Record<ExecField, ExecFieldDef>;

export const CONFIGURABLE_FIELDS = EXEC_FIELDS.filter((f) => f.configurable).map((f) => f.key);

export function emptyExecData(): ExecData {
  return Object.fromEntries(EXEC_FIELDS.map((f) => [f.key, ''])) as ExecData;
}

export type ConfigDefaults = Partial<Record<ExecField, string>>;

export interface ConfigImport {
  defaults: ConfigDefaults;
  /** Claves ignoradas (no permitidas o desconocidas). */
  ignored: string[];
}

const KEY_LOOKUP = new Map<string, ExecField>();
for (const f of EXEC_FIELDS) {
  KEY_LOOKUP.set(normalizeHeader(f.key), f.key);
  KEY_LOOKUP.set(normalizeHeader(f.label), f.key);
}
KEY_LOOKUP.set('NUMERO EMPLEADO', 'noEmpleado');
KEY_LOOKUP.set('NUMERO DE EMPLEADO', 'noEmpleado');
KEY_LOOKUP.set('CODIGO POSTAL', 'cp');
KEY_LOOKUP.set('CORREO', 'email');
KEY_LOOKUP.set('EMAIL', 'email');

/**
 * Lee un JSON de configuración. Acepta un objeto plano o { "valoresPredeterminados": {...} }.
 * Las claves se comparan sin acentos ni mayúsculas, por nombre interno o por etiqueta.
 * Las claves no permitidas (p. ej. póliza, plan o fecha de vigencia) se ignoran y se informan.
 */
export function parseConfig(json: string): ConfigImport {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('El archivo de configuración no es un JSON válido.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('La configuración debe ser un objeto JSON.');
  const obj = data as Record<string, unknown>;
  const src = (obj.valoresPredeterminados ?? obj) as Record<string, unknown>;
  if (!src || typeof src !== 'object' || Array.isArray(src)) throw new Error('"valoresPredeterminados" debe ser un objeto.');

  const defaults: ConfigDefaults = {};
  const ignored: string[] = [];
  for (const [k, v] of Object.entries(src)) {
    if (src === obj && k === 'version') continue;
    const field = KEY_LOOKUP.get(normalizeHeader(k));
    if (!field || !CONFIGURABLE_FIELDS.includes(field) || (v !== null && typeof v === 'object')) {
      ignored.push(k);
      continue;
    }
    if (v === null || v === undefined) continue;
    defaults[field] = String(v).trim();
  }
  return { defaults, ignored };
}

/** Serializa los valores configurables (solo los permitidos) como JSON descargable. */
export function serializeConfig(values: ConfigDefaults): string {
  const out: Record<string, string> = {};
  for (const k of CONFIGURABLE_FIELDS) out[k] = (values[k] ?? '').trim();
  return JSON.stringify({ version: 1, valoresPredeterminados: out }, null, 2) + '\n';
}

/**
 * Combina configuración y formulario. Un campo modificado en el formulario (`touched`)
 * prevalece siempre, incluso si se dejó vacío a propósito; si no se tocó, se usa el valor
 * de la configuración. Los campos no configurables solo salen del formulario.
 */
export function resolveExecData(defaults: ConfigDefaults, form: Partial<ExecData>, touched: ReadonlySet<ExecField>): ExecData {
  const out = emptyExecData();
  for (const f of EXEC_FIELDS) {
    const fromForm = (form[f.key] ?? '').trim();
    if (!f.configurable || touched.has(f.key)) out[f.key] = fromForm;
    else out[f.key] = (defaults[f.key] ?? '').trim() || fromForm;
  }
  return out;
}

export interface ExecIssue {
  field: ExecField;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Fecha del formulario (input date = aaaa-mm-dd, o texto dd/mm/aaaa) → ISO. */
export function execDateIso(v: string): string | null {
  return v ? parseDateText(v) : null;
}

export function validateExecData(d: ExecData): ExecIssue[] {
  const out: ExecIssue[] = [];
  for (const f of EXEC_FIELDS) {
    const v = d[f.key];
    if (f.required && !v) {
      out.push({ field: f.key, message: `${f.label} es obligatorio.` });
      continue;
    }
    if (!v) continue;
    if (f.type === 'date' && !execDateIso(v)) out.push({ field: f.key, message: `${f.label}: fecha inválida.` });
    if (f.type === 'email' && !EMAIL_RE.test(v)) out.push({ field: f.key, message: `${f.label}: formato de correo inválido.` });
  }
  if (d.cp && !/^\d{5}$/.test(d.cp)) out.push({ field: 'cp', message: 'CP debe tener 5 dígitos.' });
  return out;
}
