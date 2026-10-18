import type { ColumnMapping, ExtractResult, HeaderCell, SheetInfo } from './reader';
import type { ComplementParse } from './complement';
import type { OutCell } from './exportRows';
import type { ColumnDefaults, LearnedMappings } from './normalize';

export interface VerifyResult {
  ok: boolean;
  rows: number;
  differences: string[];
}

/** Operaciones de duración opaca (una sola llamada a la biblioteca) cuyo tiempo se estima. */
export type TimedOp = 'read' | 'write' | 'verify';

/** Duración real de una operación, para calibrar las estimaciones de este equipo. */
export interface Timing {
  op: TimedOp;
  units: number;
  ms: number;
}

/**
 * Aviso de progreso. La fase va de `from` a `to` (0..1 del total de la tarea). Si la fase es
 * opaca, `op` y `units` permiten estimar su duración; si no, `from` es el avance exacto.
 */
export interface ProgressMsg {
  id: number;
  type: 'progress';
  label: string;
  from: number;
  to: number;
  op?: TimedOp;
  units?: number;
}

export type WorkerRequest =
  | { id: number; type: 'open'; buffer: ArrayBuffer; learned: LearnedMappings }
  | { id: number; type: 'headers'; sheet: string; headerRow: number }
  | { id: number; type: 'extract'; sheet: string; headerRow: number; mapping: ColumnMapping; defaults: ColumnDefaults }
  | { id: number; type: 'complement'; buffer: ArrayBuffer }
  | { id: number; type: 'export'; importRows: OutCell[][]; logRows: OutCell[][] }
  | { id: number; type: 'reset' };

export type WorkerResponse =
  | { id: number; type: 'open'; sheets: SheetInfo[]; timings: Timing[] }
  | { id: number; type: 'headers'; headers: HeaderCell[] }
  | { id: number; type: 'extract'; result: ExtractResult }
  | { id: number; type: 'complement'; result: ComplementParse; timings: Timing[] }
  | { id: number; type: 'export'; xls: ArrayBuffer; log: ArrayBuffer; verify: VerifyResult; timings: Timing[] }
  | { id: number; type: 'reset' }
  | ProgressMsg
  | { id: number; type: 'error'; message: string };
