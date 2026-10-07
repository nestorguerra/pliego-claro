// Reglas de descarga de documentos oficiales. Separadas para poder probarlas sin red.

export const OFFICIAL_HOSTS = new Set([
  "contrataciondelestado.es",
  "www.contrataciondelestado.es",
  "contrataciondelsectorpublico.gob.es",
  "www.contrataciondelsectorpublico.gob.es",
]);
export const MAX_BYTES = 25 * 1024 * 1024;

/** Solo HTTPS hacia la Plataforma oficial: impide que el servidor consulte direcciones internas (SSRF). */
export function checkOfficialUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(String(raw || "").trim()); } catch { throw new Error("El enlace no es una URL válida."); }
  if (url.protocol !== "https:") throw new Error("Solo se descargan enlaces https.");
  if (url.username || url.password) throw new Error("El enlace no puede incluir credenciales.");
  if (url.port && url.port !== "443") throw new Error("Puerto no permitido.");
  if (!OFFICIAL_HOSTS.has(url.hostname.toLowerCase())) throw new Error("Solo se descargan documentos de la Plataforma de Contratación del Sector Público.");
  return url;
}

/** Tipo real según los primeros bytes; no se confía en la cabecera ni en el nombre. */
export function sniffType(bytes: Uint8Array): { mime: string; ext: string } | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46])) return { mime: "application/pdf", ext: "pdf" };
  if (starts([0x50, 0x4b, 0x03, 0x04])) return { mime: "application/zip", ext: "zip" };
  if (starts([0xd0, 0xcf, 0x11, 0xe0])) return { mime: "application/msword", ext: "doc" };
  return null;
}

export function safeFileName(name: string, ext: string): string {
  const base = String(name || "documento").normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(0, 80) || "documento";
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
}
