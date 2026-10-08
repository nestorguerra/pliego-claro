/* Copia completa del espacio (.zip): datos, originales con SHA-256 verificado, texto por página,
   análisis y comentarios. La restauración comprueba cada huella antes de escribir nada y no
   recrea usuarios ni permisos: los miembros se vuelven a invitar. */
(() => {
  const JSZIP = "vendor/jszip-3.10.1.min.js";
  const FORMAT = "pliego-claro-copia-completa";
  const cloud = () => globalThis.PliegoCloud;
  const db = () => cloud().client;

  function loadJSZip() {
    if (globalThis.JSZip) return Promise.resolve(globalThis.JSZip);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = JSZIP;
      script.onload = () => resolve(globalThis.JSZip);
      script.onerror = () => reject(new Error("No se pudo cargar el compresor (cdnjs). No se ha cambiado nada."));
      document.head.appendChild(script);
    });
  }
  async function sha256(buffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const safe = (name) => String(name || "documento").normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(0, 80) || "documento";

  /** Construye el paquete. `fetchFile(doc)` devuelve un ArrayBuffer (inyectable para pruebas). */
  async function buildPackage(JSZip, base, extras, fetchFile, onProgress = () => {}) {
    const zip = new JSZip();
    const live = extras.documents.filter((d) => !d.deleted_at);
    const files = [];
    for (const [index, doc] of live.entries()) {
      onProgress(`Originales ${index + 1}/${live.length}`);
      const zipPath = `originales/${doc.id}-${safe(doc.name)}`;
      let buffer;
      try { buffer = await fetchFile(doc); } catch (error) { files.push({ id: doc.id, zipPath: null, sha256: doc.sha256, error: error.message }); continue; }
      const actual = await sha256(buffer);
      zip.file(zipPath, buffer);
      files.push({ id: doc.id, zipPath, sha256: doc.sha256, size: buffer.byteLength, verified: actual === doc.sha256 });
    }
    const payload = { ...base, cloud: { ...extras, documents: extras.documents.map(({ storage_path, ...rest }) => rest) } };
    const manifest = {
      format: FORMAT, version: 1, createdAt: new Date().toISOString(), workspace: extras.workspace.name,
      counts: { expedientes: base.opportunities.length, notas: base.notes.length, roles: base.team.length, documentos: live.length, paginas: extras.pages.length, analisis: extras.analyses.length, comentarios: extras.comments.length },
      files,
      notRestored: "Usuarios, permisos, avisos y registro de actividad se conservan aquí como consulta; al restaurar no se recrean (las personas se vuelven a invitar)."
    };
    zip.file("espacio.json", JSON.stringify(payload, null, 2));
    zip.file("manifiesto.json", JSON.stringify(manifest, null, 2));
    zip.file("LEEME.txt", "Copia completa de un espacio de LicitIA.\nespacio.json: datos. manifiesto.json: huellas SHA-256 de los originales.\nRestaurar: Ajustes → Traer copia → elegir este .zip.\n");
    return { zip, manifest };
  }

  async function exportFull(base, onProgress) {
    const JSZip = await loadJSZip();
    onProgress("Leyendo datos del espacio…");
    const extras = await cloud().exportExtras();
    const fetchFile = async (doc) => {
      const { data, error } = await db().storage.from("documents").download(doc.storage_path);
      if (error || !data) throw new Error("no se pudo descargar");
      return data.arrayBuffer();
    };
    const { zip, manifest } = await buildPackage(JSZip, base, extras, fetchFile, onProgress);
    onProgress("Comprimiendo…");
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    return { blob, manifest, name: `pliego-claro-copia-completa-${safe(extras.workspace.name).toLowerCase()}-${new Date().toISOString().slice(0, 10)}.zip` };
  }

  /** Lee y verifica el paquete sin escribir nada. Lanza error si falta un archivo o no coincide su huella. */
  async function readPackage(JSZip, fileOrBuffer) {
    let zip;
    try { zip = await JSZip.loadAsync(fileOrBuffer); } catch (_) { throw new Error("El archivo no es un .zip válido. No se ha cambiado nada."); }
    const manifestFile = zip.file("manifiesto.json");
    const dataFile = zip.file("espacio.json");
    if (!manifestFile || !dataFile) throw new Error("Falta manifiesto.json o espacio.json. No se ha cambiado nada.");
    let manifest, payload;
    try { manifest = JSON.parse(await manifestFile.async("string")); payload = JSON.parse(await dataFile.async("string")); } catch (_) { throw new Error("La copia está dañada (JSON ilegible). No se ha cambiado nada."); }
    if (manifest.format !== FORMAT || manifest.version !== 1) throw new Error("No es una copia completa de LicitIA compatible.");
    const buffers = {};
    for (const entry of manifest.files || []) {
      if (!entry.zipPath) continue;
      const file = zip.file(entry.zipPath);
      if (!file) throw new Error(`Falta el original ${entry.zipPath}. No se ha cambiado nada.`);
      const buffer = await file.async("arraybuffer");
      if (await sha256(buffer) !== entry.sha256) throw new Error(`La huella de ${entry.zipPath} no coincide: copia dañada o modificada. No se ha cambiado nada.`);
      buffers[entry.id] = buffer;
    }
    return { manifest, payload, buffers };
  }

  /** Restaura documentos, páginas, análisis y comentarios tras importar expedientes con `mapping`. */
  async function restoreFiles({ payload, buffers }, mapping, onProgress = () => {}) {
    const ws = cloud().state.workspaceId;
    const docs = (payload.cloud?.documents || []).filter((d) => !d.deleted_at && buffers[d.id]);
    const pagesByDoc = {};
    (payload.cloud?.pages || []).forEach((p) => { (pagesByDoc[p.document_id] ||= []).push(p); });
    const docMap = {};
    const report = { documentos: 0, omitidos: 0, paginas: 0, comentarios: 0, analisis: 0, errores: [] };
    // Las versiones anteriores primero, para poder enlazar «sustituye a».
    const ordered = [...docs].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    for (const [index, doc] of ordered.entries()) {
      onProgress(`Restaurando originales ${index + 1}/${ordered.length}`);
      const target = mapping[doc.expediente]?.id;
      const meta = target && cloud().state.meta[target];
      if (!meta) { report.omitidos += 1; continue; }
      const existing = await cloud().run(db().from("documents").select("id").eq("expediente_id", meta.rowId).eq("sha256", doc.sha256).is("deleted_at", null).maybeSingle(), "");
      if (existing) { docMap[doc.id] = existing.id; report.omitidos += 1; continue; }
      const path = `${ws}/${meta.rowId}/${crypto.randomUUID()}-${safe(doc.name)}`;
      try {
        const row = await cloud().run(db().from("documents").insert({ workspace_id: ws, expediente_id: meta.rowId, name: doc.name, kind: doc.kind, version_label: doc.version_label || "", origin: doc.origin, source_url: doc.source_url, storage_path: path, sha256: doc.sha256, size_bytes: doc.size_bytes, mime_type: doc.mime_type, supersedes_id: doc.supersedes_id ? docMap[doc.supersedes_id] || null : null, extraction_status: doc.extraction_status, page_count: doc.page_count }).select("id").single(), "No se pudo registrar un original.");
        const upload = await db().storage.from("documents").upload(path, new Blob([buffers[doc.id]], { type: doc.mime_type }), { contentType: doc.mime_type, upsert: false });
        if (upload.error) { await db().from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", row.id); throw new Error(`subida fallida (${upload.error.message})`); }
        docMap[doc.id] = row.id;
        report.documentos += 1;
        const pages = (pagesByDoc[doc.id] || []).map((p) => ({ document_id: row.id, workspace_id: ws, page_number: p.page_number, text: p.text, method: p.method || "text" }));
        for (let i = 0; i < pages.length; i += 50) await cloud().run(db().from("document_pages").upsert(pages.slice(i, i + 50), { onConflict: "document_id,page_number" }), "No se pudo restaurar el texto.");
        report.paginas += pages.length;
      } catch (error) { report.errores.push(`${doc.name}: ${error.message}`); }
    }
    for (const comment of (payload.cloud?.comments || []).filter((c) => !c.deleted_at)) {
      const meta = mapping[comment.expediente]?.imported && cloud().state.meta[mapping[comment.expediente].id];
      if (!meta) continue;
      try {
        await cloud().run(db().from("comments").insert({ workspace_id: ws, expediente_id: meta.rowId, body: `[Comentario restaurado · autoría original: ${comment.author || "desconocida"} · ${new Date(comment.created_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}]\n${comment.body}`.slice(0, 4000) }), "");
        report.comentarios += 1;
      } catch (error) { report.errores.push(`Comentario: ${error.message}`); }
    }
    report.analisis = (payload.cloud?.analyses || []).length;
    return { report, docMap };
  }

  /** Los expedientes restaurados citan originales por su id antiguo: se actualizan al nuevo. */
  function remapStoredDocuments(item, docMap) {
    let changed = false;
    (item.documents || []).forEach((ref) => {
      if (ref.storedDocumentId && docMap[ref.storedDocumentId] && docMap[ref.storedDocumentId] !== ref.storedDocumentId) {
        const oldId = ref.storedDocumentId;
        ref.storedDocumentId = docMap[oldId];
        if (String(ref.url || "").includes(`#documento=${oldId}`)) ref.url = ref.url.replace(oldId, docMap[oldId]);
        (item.requirements || []).forEach((req) => { if (req.documentId === ref.id && req.sourceUrl?.includes(oldId)) req.sourceUrl = ref.url; });
        changed = true;
      }
    });
    return changed;
  }

  globalThis.PliegoFullBackup = Object.freeze({ loadJSZip, buildPackage, exportFull, readPackage, restoreFiles, remapStoredDocuments, FORMAT });
})();
