// Descarga un pliego desde la Plataforma oficial y lo archiva con su huella SHA-256.
import { adminClient, handle, HttpError, json, requireRole, sha256Hex, userContext } from "../_shared/common.ts";
import { checkOfficialUrl, MAX_BYTES, safeFileName, sniffType } from "../_shared/official.ts";

const KINDS = new Set(["PCAP", "PPT", "Anexo", "Aclaración", "Otro"]);

async function download(start: URL): Promise<Uint8Array<ArrayBuffer>> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(60_000), headers: { "User-Agent": "PliegoClaro/1.0" } });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      await response.body?.cancel();
      if (!next) throw new HttpError(502, "La Plataforma devolvió una redirección sin destino.");
      url = checkOfficialUrl(new URL(next, url).href); // cada salto vuelve a validarse
      continue;
    }
    if (!response.ok) throw new HttpError(502, `La Plataforma respondió ${response.status}. El documento no se ha archivado.`);
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) throw new HttpError(413, "El documento supera 25 MB.");
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); throw new HttpError(413, "El documento supera 25 MB."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }
  throw new HttpError(502, "Demasiadas redirecciones.");
}

Deno.serve(handle(async (req) => {
  const { db, userId } = await userContext(req);
  const body = await req.json().catch(() => ({}));
  const expedienteId = String(body.expedienteId || "");
  const kind = KINDS.has(body.kind) ? body.kind : "Otro";
  const name = String(body.name || "").trim().slice(0, 200) || "Documento oficial";
  let url: URL;
  try { url = checkOfficialUrl(body.url); } catch (error) { throw new HttpError(400, (error as Error).message); }

  const { data: expediente } = await db.from("expedientes").select("id, workspace_id").eq("id", expedienteId).is("deleted_at", null).maybeSingle();
  if (!expediente) throw new HttpError(404, "Expediente no disponible.");
  await requireRole(db, expediente.workspace_id, "editor");

  const bytes = await download(url);
  const type = sniffType(bytes);
  if (!type) throw new HttpError(415, "El archivo descargado no es un PDF, DOC o ZIP reconocible. No se ha archivado.");
  const sha = await sha256Hex(bytes);

  const { data: duplicate } = await db.from("documents").select("id, name").eq("expediente_id", expediente.id).eq("sha256", sha).is("deleted_at", null).maybeSingle();
  if (duplicate) return json(req, { document: duplicate, duplicate: true });

  const path = `${expediente.workspace_id}/${expediente.id}/${crypto.randomUUID()}-${safeFileName(name, type.ext)}`;
  const admin = adminClient();
  const upload = await admin.storage.from("documents").upload(path, bytes, { contentType: type.mime, upsert: false });
  if (upload.error) throw new HttpError(500, "No se pudo archivar el documento.");

  const { data: row, error } = await db.from("documents").insert({
    workspace_id: expediente.workspace_id, expediente_id: expediente.id, name, kind, version_label: String(body.versionLabel || "").slice(0, 120),
    origin: "official", source_url: url.href, storage_path: path, sha256: sha, size_bytes: bytes.byteLength, mime_type: type.mime,
    supersedes_id: body.supersedesId || null, extraction_status: type.mime === "application/pdf" ? "pending" : "not_applicable", uploaded_by: userId,
  }).select("id, name, kind, sha256, size_bytes, mime_type, storage_path, created_at, extraction_status, origin, source_url, version_label, supersedes_id").single();
  if (error) {
    await admin.storage.from("documents").remove([path]);
    throw new HttpError(400, "No se pudo registrar el documento: " + error.message);
  }
  return json(req, { document: row, duplicate: false });
}));
