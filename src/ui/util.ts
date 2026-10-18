export function downloadBlob(data: BlobPart, fileName: string, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function safeName(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'lote';
}

export function readFileAsText(f: File): Promise<string> {
  return f.text();
}

export function readFileAsBuffer(f: File): Promise<ArrayBuffer> {
  return f.arrayBuffer();
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const fmt = (n: number) => n.toLocaleString('es-MX');

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
