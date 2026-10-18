import { useEffect, useRef, useState } from 'react';
import type { ProgressPhase } from '../core/workerClient';

/** Tarea en curso: título, fase actual y momentos de inicio (performance.now()). */
export interface BusyState {
  title: string;
  phase: ProgressPhase;
  phaseStart: number;
  start: number;
}

export function newBusy(title: string): BusyState {
  const now = performance.now();
  return { title, phase: { label: title, from: 0, to: 0 }, phaseStart: now, start: now };
}

export function withPhase(b: BusyState | null, phase: ProgressPhase): BusyState | null {
  return b ? { ...b, phase, phaseStart: performance.now() } : b;
}

function formatEta(sec: number): string {
  if (sec < 1.5) return 'menos de 1 s';
  if (sec < 60) return `≈ ${Math.round(sec)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `≈ ${m} min${s ? ` ${s} s` : ''}`;
}

/**
 * Avance estimado: en fases opacas interpola según la duración estimada (sin pasar del 97 % de
 * la fase); en fases con avance real usa el valor informado. Nunca retrocede.
 */
function useProgressValue(busy: BusyState | null) {
  const [now, setNow] = useState(() => performance.now());
  const last = useRef(0);
  useEffect(() => {
    if (!busy) {
      last.current = 0;
      return;
    }
    const t = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(t);
  }, [busy]);
  if (!busy) return null;

  const { phase } = busy;
  let fraction = phase.from;
  let capped = false;
  if (phase.estMs && phase.to > phase.from) {
    const local = (now - busy.phaseStart) / phase.estMs;
    capped = local >= 0.97;
    fraction = phase.from + (phase.to - phase.from) * Math.min(0.97, Math.max(0, local));
  }
  fraction = Math.max(last.current, Math.min(1, fraction));
  last.current = fraction;

  const elapsed = (now - busy.start) / 1000;
  const eta = fraction >= 0.03 && elapsed >= 0.6 ? (elapsed * (1 - fraction)) / fraction : null;
  return { fraction, eta, capped, elapsed };
}

export function ProgressPanel({ busy, className }: { busy: BusyState | null; className?: string }) {
  const v = useProgressValue(busy);
  if (!busy || !v) return null;
  const pct = Math.round(v.fraction * 100);
  const etaText = v.capped ? 'terminando…' : v.eta === null ? 'calculando tiempo restante…' : `faltan ${formatEta(v.eta)}`;
  return (
    <div className={`progress-panel ${className ?? ''}`} role="status" aria-live="polite">
      <div className="progress-head">
        <span className="spinner big" aria-hidden />
        <div>
          <strong>{busy.title}</strong>
          <div className="muted small">{busy.phase.label}</div>
        </div>
      </div>
      <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={busy.title}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-meta small">
        <span>{pct} %</span>
        <span>
          {etaText} · {Math.round(v.elapsed)} s transcurridos
        </span>
      </div>
    </div>
  );
}

/** Capa que bloquea la interfaz mientras se procesa un archivo. */
export function ProgressOverlay({ busy }: { busy: BusyState | null }) {
  if (!busy) return null;
  return (
    <div className="overlay">
      <ProgressPanel busy={busy} className="card" />
    </div>
  );
}
