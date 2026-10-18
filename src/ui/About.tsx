import { useEffect } from 'react';
import { APP_NAME, APP_VERSION, AUTHOR, CHANGELOG, RELEASE_DATE } from '../version';
import { isoToDisplay } from '../core/dates';

/** Apartado «Acerca de»: versión, fecha de liberación, autor y últimas mejoras. */
export function About({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <section className="card about" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(e) => e.stopPropagation()}>
        <header className="row between">
          <h2 id="about-title">Acerca de</h2>
          <button className="btn icon" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>
        <p className="about-name">{APP_NAME}</p>
        <table className="kv">
          <tbody>
            <tr>
              <th>Versión</th>
              <td>{APP_VERSION}</td>
            </tr>
            <tr>
              <th>Fecha de liberación</th>
              <td>{isoToDisplay(RELEASE_DATE)}</td>
            </tr>
            <tr>
              <th>Autor</th>
              <td>{AUTHOR}</td>
            </tr>
          </tbody>
        </table>
        {CHANGELOG.map((r) => (
          <div key={r.version} className="about-release">
            <h3>
              Últimas mejoras · v{r.version} <span className="muted small">({isoToDisplay(r.date)})</span>
            </h3>
            <ul>
              {r.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </div>
        ))}
        <p className="muted small">Los datos se procesan solo en este navegador; no se envían a ningún servidor.</p>
      </section>
    </div>
  );
}
