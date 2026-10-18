/**
 * Estado de la aplicación. Los movimientos originales son inmutables; las decisiones del usuario
 * (correcciones, exclusiones, clasificaciones, elecciones de complemento) se guardan aparte,
 * vinculadas al id interno de cada movimiento. La clasificación se recalcula al cambiar cualquiera.
 * No se guarda nada de forma persistente salvo que el usuario lo pida (configuración).
 */
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import type { ColumnMapping, ExtractResult, HeaderCell, SheetInfo } from '../core/reader';
import { autoMap, mappingsToLearn, missingColumns } from '../core/reader';
import { ALL_COLUMNS, DEFAULTABLE_COLUMNS, type ColumnDefaults, type LearnedMappings } from '../core/normalize';
import { planIncidentRejection, type RejectScope } from '../core/incidents';
import type { ComplementParse } from '../core/complement';
import { indexByName, indexByNumId } from '../core/complement';
import type { Correction, CorrectableField, DescriptionKind, Exclusion } from '../core/types';
import { applyExec, evaluate, type ComplementState, type EvalInput } from '../core/pipeline';
import { DEFAULT_STRICT, type StrictOptions } from '../core/validation';
import type { NameOrder } from '../core/names';
import { CONFIGURABLE_FIELDS, resolveExecData, type ConfigDefaults, type ExecData, type ExecField } from '../core/config';
import * as client from '../core/workerClient';
import { newBusy, withPhase, type BusyState } from './Progress';

export type Step = 1 | 2 | 3 | 4 | 5;

const LS_KEY = 'faConverter.config.v1';
const LS_COLUMNS = 'faConverter.columnas.v1';

/** Asignaciones de columnas hechas a mano en corridas anteriores (solo nombres de encabezados, sin datos). */
function loadLearned(): LearnedMappings {
  try {
    const obj = JSON.parse(localStorage.getItem(LS_COLUMNS) ?? '{}') as Record<string, unknown>;
    const out: LearnedMappings = {};
    for (const [k, v] of Object.entries(obj)) if ((ALL_COLUMNS as string[]).includes(String(v))) out[k] = v as LearnedMappings[string];
    return out;
  } catch {
    return {};
  }
}

const LS_COL_DEFAULTS = 'faConverter.valoresDefecto.v1';

/** Valores por defecto de columnas usados en la última corrida. */
function loadColDefaults(): ColumnDefaults {
  try {
    const obj = JSON.parse(localStorage.getItem(LS_COL_DEFAULTS) ?? '{}') as Record<string, unknown>;
    const out: ColumnDefaults = {};
    for (const c of DEFAULTABLE_COLUMNS) if (typeof obj[c] === 'string' && (obj[c] as string).trim()) out[c] = obj[c] as string;
    return out;
  } catch {
    return {};
  }
}

function saveColDefaults(d: ColumnDefaults) {
  try {
    const clean = Object.fromEntries(Object.entries(d).filter(([, v]) => v && v.trim()));
    if (Object.keys(clean).length) localStorage.setItem(LS_COL_DEFAULTS, JSON.stringify(clean));
    else localStorage.removeItem(LS_COL_DEFAULTS);
  } catch {
    /* sin almacenamiento */
  }
}

const sameDefaults = (a: ColumnDefaults, b: ColumnDefaults) =>
  DEFAULTABLE_COLUMNS.every((c) => (a[c] ?? '').trim() === (b[c] ?? '').trim());

function saveLearned(l: LearnedMappings) {
  try {
    if (Object.keys(l).length) localStorage.setItem(LS_COLUMNS, JSON.stringify(l));
    else localStorage.removeItem(LS_COLUMNS);
  } catch {
    /* almacenamiento no disponible: la asignación solo vale para esta corrida */
  }
}

function loadSavedDefaults(): ConfigDefaults {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: ConfigDefaults = {};
    for (const k of CONFIGURABLE_FIELDS) if (typeof obj[k] === 'string') out[k] = obj[k] as string;
    return out;
  } catch {
    return {};
  }
}

export function useConverter() {
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusyState] = useState<BusyState | null>(null);
  const setBusy = (title: string | null) => setBusyState(title ? newBusy(title) : null);
  const onProgress = (p: client.ProgressPhase) => setBusyState((b) => withPhase(b, p));
  const [error, setError] = useState<string | null>(null);

  // Origen
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [sheets, setSheets] = useState<SheetInfo[] | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [headers, setHeaders] = useState<HeaderCell[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [extractResult, setExtract] = useState<ExtractResult | null>(null);
  const [learned, setLearned] = useState<LearnedMappings>(loadLearned);
  const [learnedMsg, setLearnedMsg] = useState<string | null>(null);
  const [colDefaults, setColDefaults] = useState<ColumnDefaults>(loadColDefaults);
  /** Asignación y valores por defecto con los que se leyeron los movimientos (para detectar cambios sin aplicar). */
  const [appliedKey, setAppliedKey] = useState<string | null>(null);

  // Configuración y datos de ejecución
  const [savedDefaults] = useState<ConfigDefaults>(loadSavedDefaults);
  const [configDefaults, setConfigDefaults] = useState<ConfigDefaults>(savedDefaults);
  const [configSource, setConfigSource] = useState<string | null>(Object.keys(savedDefaults).length ? 'Guardada en este navegador' : null);
  const [form, setForm] = useState<Partial<ExecData>>({});
  const [touched, setTouched] = useState<Set<ExecField>>(new Set());
  const [strict, setStrict] = useState<StrictOptions>(DEFAULT_STRICT);
  const [nameOrder, setNameOrder] = useState<NameOrder>('nombres-apellidos');

  // Decisiones de revisión
  const [corrections, setCorrections] = useState<Map<string, Correction>>(new Map());
  const [exclusions, setExclusions] = useState<Map<string, Exclusion>>(new Map());
  const [nameReviewed, setNameReviewed] = useState<Set<string>>(new Set());
  const [descKinds, setDescKinds] = useState<Record<string, DescriptionKind>>({});
  const [complementInfo, setComplementInfo] = useState<(ComplementParse & { fileName: string }) | null>(null);
  const [complementByName, setComplementByName] = useState(false);
  const [complementChoices, setComplementChoices] = useState<Map<string, number | null>>(new Map());
  const [confirmed, setConfirmed] = useState(false);

  const exec = useMemo(() => resolveExecData(configDefaults, form, touched), [configDefaults, form, touched]);

  const complement = useMemo<ComplementState | null>(
    () =>
      complementInfo
        ? { records: complementInfo.records, byNumId: indexByNumId(complementInfo.records), byName: indexByName(complementInfo.records) }
        : null,
    [complementInfo],
  );

  const input = useMemo<EvalInput | null>(
    () =>
      extractResult
        ? {
            movements: extractResult.movements,
            date1904: extractResult.date1904,
            corrections,
            exclusions,
            nameReviewed,
            descKinds,
            nameOrder,
            complement,
            complementByName,
            complementChoices,
            strict,
            exec: null,
          }
        : null,
    [extractResult, corrections, exclusions, nameReviewed, descKinds, nameOrder, complement, complementByName, complementChoices, strict],
  );
  // Con volúmenes grandes el recálculo se difiere para que la edición siga fluida.
  const deferredInput = useDeferredValue(input);
  const baseResult = useMemo(() => (deferredInput ? evaluate(deferredInput) : null), [deferredInput]);
  const result = useMemo(() => (baseResult ? applyExec(baseResult, exec) : null), [baseResult, exec]);
  const recalculating = input !== deferredInput;

  /** Cualquier cambio que afecte al resultado invalida la confirmación. */
  const invalidate = useCallback(() => setConfirmed(false), []);

  const resetReview = () => {
    setCorrections(new Map());
    setExclusions(new Map());
    setNameReviewed(new Set());
    setComplementChoices(new Map());
    setConfirmed(false);
  };

  async function loadFile(f: File) {
    setError(null);
    setBusy(`Cargando ${f.name}`);
    try {
      const buf = await f.arrayBuffer();
      const infos = await client.openWorkbook(buf, learned, onProgress);
      setFile({ name: f.name, size: f.size });
      setSheets(infos);
      setExtract(null);
      resetReview();
      const candidates = infos.filter((i) => i.candidate);
      const chosen = candidates.length === 1 ? candidates[0] : null;
      if (chosen) await chooseSheet(chosen);
      else {
        setSheet(null);
        setMapping(null);
        setHeaders([]);
      }
    } catch (e) {
      setError(`No se pudo leer el archivo: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function chooseSheet(info: SheetInfo) {
    setSheet(info.name);
    setHeaderRow(info.headerRow);
    setHeaders(info.headers);
    setMapping(info.mapping);
    setExtract(null);
    resetReview();
    if (missingColumns(info.mapping, colDefaults).length === 0) await runExtract(info.name, info.headerRow, info.mapping, info.headers);
  }

  async function changeHeaderRow(row: number) {
    if (!sheet) return;
    setBusy('Leyendo encabezados');
    try {
      const h = await client.getHeaders(sheet, row);
      setHeaderRow(row);
      setHeaders(h);
      setMapping(autoMap(h, learned));
      setExtract(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runExtract(sh = sheet, hr = headerRow, mp = mapping, hs = headers, df = colDefaults) {
    if (!sh || !mp) return;
    if (missingColumns(mp, df).length) {
      setError('Asigne todas las columnas obligatorias antes de continuar.');
      return;
    }
    setError(null);
    setBusy('Procesando movimientos');
    try {
      const r = await client.extract(sh, hr, mp, df, onProgress);
      setExtract(r);
      setAppliedKey(JSON.stringify([mp, df]));
      resetReview();
      // Recordar los valores por defecto para la próxima corrida.
      if (!sameDefaults(df, loadColDefaults())) saveColDefaults(df);
      // Recordar las asignaciones manuales para próximos archivos con los mismos encabezados.
      const nuevas = mappingsToLearn(mp, hs);
      const cambios = Object.entries(nuevas).filter(([k, v]) => learned[k] !== v);
      if (cambios.length) {
        const next = { ...learned, ...nuevas };
        setLearned(next);
        saveLearned(next);
        setLearnedMsg(`Se recordarán ${cambios.length} asignaciones de columnas para los próximos archivos.`);
      }
    } catch (e) {
      setError(`Error al procesar la hoja: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function loadComplement(f: File) {
    setError(null);
    setBusy(`Cargando tabla complementaria ${f.name}`);
    try {
      const r = await client.readComplement(await f.arrayBuffer(), onProgress);
      setComplementInfo({ ...r, fileName: f.name });
      setComplementChoices(new Map());
      invalidate();
    } catch (e) {
      setError(`Tabla complementaria: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  function applyConfig(defaults: ConfigDefaults, source: string) {
    setConfigDefaults(defaults);
    setConfigSource(source);
    invalidate();
  }

  function setField(k: ExecField, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setTouched((t) => (t.has(k) ? t : new Set(t).add(k)));
    invalidate();
  }

  function resetField(k: ExecField) {
    setForm((f) => {
      const n = { ...f };
      delete n[k];
      return n;
    });
    setTouched((t) => {
      const n = new Set(t);
      n.delete(k);
      return n;
    });
    invalidate();
  }

  function saveDefaultsLocally() {
    const out: ConfigDefaults = {};
    for (const k of CONFIGURABLE_FIELDS) out[k] = exec[k];
    localStorage.setItem(LS_KEY, JSON.stringify(out));
    setConfigDefaults(out);
    setConfigSource('Guardada en este navegador');
  }

  function forgetLocalDefaults() {
    localStorage.removeItem(LS_KEY);
    setConfigSource((s) => (s === 'Guardada en este navegador' ? null : s));
  }

  function setCorrection(id: string, field: CorrectableField, value: string | undefined) {
    setCorrections((prev) => {
      const next = new Map(prev);
      const c = { ...(next.get(id) ?? {}) };
      if (value === undefined) delete c[field];
      else c[field] = value;
      if (Object.keys(c).length) next.set(id, c);
      else next.delete(id);
      return next;
    });
    invalidate();
  }

  function setCorrectionBatch(id: string, values: Correction) {
    setCorrections((prev) => {
      const next = new Map(prev);
      const c = { ...(next.get(id) ?? {}), ...values };
      for (const k of Object.keys(c) as CorrectableField[]) if (c[k] === undefined) delete c[k];
      if (Object.keys(c).length) next.set(id, c);
      else next.delete(id);
      return next;
    });
    invalidate();
  }

  function exclude(ids: string[], justification: string) {
    setExclusions((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.set(id, { reason: 'manual', detail: justification });
      return next;
    });
    invalidate();
  }

  /** Rechaza movimientos con incidencia (o su familia/certificado completo); el motivo es la incidencia. */
  function rejectIncidents(ids: string[], scope: RejectScope) {
    if (!result) return 0;
    const plan = planIncidentRejection(result, ids, scope);
    setExclusions((prev) => new Map([...prev, ...plan]));
    invalidate();
    return plan.size;
  }

  function undoIncidentRejections() {
    setExclusions((prev) => new Map([...prev].filter(([, e]) => e.reason !== 'incidencia')));
    invalidate();
  }

  function reinclude(id: string) {
    setExclusions((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    invalidate();
  }

  function markNamesReviewed(ids: string[], reviewed = true) {
    setNameReviewed((prev) => {
      const next = new Set(prev);
      for (const id of ids) reviewed ? next.add(id) : next.delete(id);
      return next;
    });
    invalidate();
  }

  function classifyDescription(descNorm: string, kind: DescriptionKind | null) {
    setDescKinds((prev) => {
      const next = { ...prev };
      if (kind === null) delete next[descNorm];
      else next[descNorm] = kind;
      return next;
    });
    invalidate();
  }

  function chooseComplement(id: string, index: number | null | undefined) {
    setComplementChoices((prev) => {
      const next = new Map(prev);
      if (index === undefined) next.delete(id);
      else next.set(id, index);
      return next;
    });
    invalidate();
  }

  /**
   * Nueva conversión: descarta el archivo y las decisiones de esta corrida. Conserva la
   * configuración, las asignaciones de columnas, los valores por defecto y las opciones.
   */
  function restart() {
    setFile(null);
    setSheets(null);
    setSheet(null);
    setHeaderRow(0);
    setHeaders([]);
    setMapping(null);
    setExtract(null);
    setAppliedKey(null);
    setLearnedMsg(null);
    setForm({});
    setTouched(new Set());
    setDescKinds({});
    setComplementInfo(null);
    setComplementByName(false);
    resetReview();
    setError(null);
    setStep(1);
    void client.resetWorker();
  }

  const sourceReady = Boolean(extractResult);
  const mappingMissing = mapping ? missingColumns(mapping, colDefaults) : [];
  const mappingDirty = Boolean(extractResult && appliedKey !== JSON.stringify([mapping, colDefaults]));

  return {
    step, setStep, busy, error, setError, recalculating, restart,
    file, sheets, sheet, headerRow, headers, mapping, setMapping, mappingMissing, extractResult, sourceReady,
    learned, learnedMsg, colDefaults, mappingDirty,
    setColDefault: (col: keyof ColumnDefaults, v: string) => setColDefaults((d) => ({ ...d, [col]: v })),
    forgetLearned: () => (
      setLearned({}), saveLearned({}), setColDefaults({}), saveColDefaults({}),
      setLearnedMsg('Se olvidaron las asignaciones de columnas y los valores por defecto guardados.')
    ),
    loadFile, chooseSheet, changeHeaderRow, runExtract,
    configDefaults, configSource, applyConfig, form, touched, setField, resetField, exec,
    saveDefaultsLocally, forgetLocalDefaults, hasSavedDefaults: configSource === 'Guardada en este navegador',
    strict, setStrict: (s: StrictOptions) => (setStrict(s), invalidate()),
    nameOrder, setNameOrder: (o: NameOrder) => (setNameOrder(o), invalidate()),
    corrections, setCorrection, setCorrectionBatch, exclusions, exclude, reinclude, rejectIncidents, undoIncidentRejections,
    nameReviewed, markNamesReviewed, descKinds, classifyDescription,
    complementInfo, loadComplement, clearComplement: () => (setComplementInfo(null), setComplementChoices(new Map()), invalidate()),
    complementByName, setComplementByName: (b: boolean) => (setComplementByName(b), invalidate()),
    complementChoices, chooseComplement,
    result, confirmed, setConfirmed,
  };
}

export type Converter = ReturnType<typeof useConverter>;
