import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * En la compilación se añade una política de seguridad de contenido que impide conexiones
 * a otros orígenes: los datos personales no pueden salir del navegador.
 * (En desarrollo no se aplica porque el servidor de Vite inyecta scripts en línea.)
 */
const csp: Plugin = {
  name: 'csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
    ].join('; ');
    return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
  },
};

export default defineConfig({
  plugins: [react(), csp],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  worker: { format: 'es' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
