import { useConverter, type Step } from './ui/useConverter';
import { StepUpload } from './ui/StepUpload';
import { StepExec } from './ui/StepExec';
import { StepReview } from './ui/StepReview';
import { StepIssues } from './ui/StepIssues';
import { StepDownload } from './ui/StepDownload';
import { cx, fmt } from './ui/util';
import { ProgressOverlay } from './ui/Progress';
import { About } from './ui/About';
import { Manual } from './ui/Manual';
import { useState } from 'react';
import { APP_VERSION, RELEASE_DATE } from './version';
import { isoToDisplay } from './core/dates';

const STEPS: { n: Step; title: string }[] = [
  { n: 1, title: 'Cargar archivo' },
  { n: 2, title: 'Datos de ejecución' },
  { n: 3, title: 'Revisar movimientos' },
  { n: 4, title: 'Incidencias y confirmación' },
  { n: 5, title: 'Descargas y resumen' },
];

export default function App() {
  const c = useConverter();
  const [showAbout, setShowAbout] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const restart = () => {
    if (confirm('¿Iniciar una nueva conversión? Se descartarán el archivo y las correcciones de esta corrida (descargue antes los archivos que necesite).')) {
      c.restart();
      window.scrollTo({ top: 0 });
    }
  };
  const res = c.result;
  const canFinish = Boolean(res?.canFinish && c.confirmed && !c.recalculating);

  const enabled = (n: Step) => n === 1 || (c.sourceReady && Boolean(res) && (n < 5 || canFinish));
  const go = (n: Step) => enabled(n) && (c.setStep(n), window.scrollTo({ top: 0 }));
  const step = enabled(c.step) ? c.step : 1;

  const nextBlocked =
    step === 1 ? !c.sourceReady : step === 2 ? (res?.execIssues.length ?? 0) > 0 : step === 4 ? !canFinish : step === 5;
  const nextHint =
    step === 1
      ? 'Cargue el archivo y asigne las columnas obligatorias.'
      : step === 2
        ? 'Complete los campos obligatorios.'
        : step === 4
          ? 'Resuelva las incidencias y confirme el resultado.'
          : '';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ⇄
          </span>
          <div>
            <h1>Conversor de altas de asegurados</h1>
            <p className="muted small">Excel de movimientos → archivo de importación .xls · procesamiento local en el navegador</p>
          </div>
        </div>
        {res && (
          <div className="top-counts small" aria-live="polite">
            <span>Total {fmt(res.counts.total)}</span>
            <span className="good">Aceptados {fmt(res.counts.aceptados)}</span>
            <span>Rechazados {fmt(res.counts.rechazados)}</span>
            {res.counts.bloqueados > 0 && <span className="bad">Con incidencia {fmt(res.counts.bloqueados)}</span>}
          </div>
        )}
        <div className="top-links">
        <button className="btn small" onClick={() => setShowManual(true)} title="Manual de usuario, guion de ejemplo y archivos de ejemplo">
          Manual
        </button>
        <button className="btn link small version-link" onClick={() => setShowAbout(true)} title="Versión, fecha de liberación, autor y últimas mejoras">
          v{APP_VERSION} · Acerca de
        </button>
        </div>
      </header>

      <nav className="stepper" aria-label="Pasos">
        {STEPS.map((s) => (
          <button
            key={s.n}
            className={cx('step', step === s.n && 'current', step > s.n && 'done')}
            disabled={!enabled(s.n)}
            onClick={() => go(s.n)}
            aria-current={step === s.n ? 'step' : undefined}
          >
            <span className="step-n">{step > s.n ? '✓' : s.n}</span>
            <span className="step-t">{s.title}</span>
          </button>
        ))}
      </nav>

      <main className="content">
        {c.error && (
          <div className="notice bad" role="alert">
            {c.error}{' '}
            <button className="btn link" onClick={() => c.setError(null)}>
              Cerrar
            </button>
          </div>
        )}
        <ProgressOverlay busy={c.busy} />

        {step === 1 && <StepUpload c={c} onOpenManual={() => setShowManual(true)} />}
        {step === 2 && <StepExec c={c} />}
        {step === 3 && res && <StepReview c={c} />}
        {step === 4 && res && <StepIssues c={c} onGoto={(n) => go(n)} />}
        {step === 5 && res && canFinish && <StepDownload c={c} onRestart={restart} />}

        <footer className="nav-footer">
          <button className="btn" disabled={step === 1} onClick={() => go((step - 1) as Step)}>
            ← Anterior
          </button>
          {nextBlocked && nextHint && <span className="muted small">{nextHint}</span>}
          {step < 5 ? (
            <button className="btn primary" disabled={nextBlocked} onClick={() => go((step + 1) as Step)}>
              Siguiente →
            </button>
          ) : (
            <button className="btn primary" onClick={restart}>
              ↺ Volver al inicio
            </button>
          )}
        </footer>
        <p className="app-footer muted small">
          {APP_VERSION && <>Versión {APP_VERSION} · liberada el {isoToDisplay(RELEASE_DATE)} · </>}
          <button className="btn link small" onClick={() => setShowManual(true)}>
            Manual de usuario
          </button>{' '}
          ·{' '}
          <button className="btn link small" onClick={() => setShowAbout(true)}>
            Acerca de y últimas mejoras
          </button>
        </p>
      </main>
      {showAbout && <About onClose={() => setShowAbout(false)} />}
      {showManual && <Manual onClose={() => setShowManual(false)} />}
    </div>
  );
}
