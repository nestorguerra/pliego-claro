/* Funciones conectadas al servidor: fuente oficial, originales, lectura de PDF, IA, equipo,
   avisos, cuenta y privacidad. Cada operación pasa por la sesión y los permisos del servidor. */
(() => {
  const html = (value = "") => String(value ?? "").replace(/[&<>'"`]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;", "`": "&#96;" }[char]));
  const cloud = () => globalThis.PliegoCloud;
  const app = () => globalThis.PliegoApp;
  const db = () => cloud().client;
  const MADRID = "Europe/Madrid";
  const STATUS = { PRE: "Anuncio previo", PUB: "En plazo", EV: "Pendiente de adjudicación", ADJ: "Adjudicada", RES: "Resuelta", ANUL: "Anulada" };
  const CONTRACT = { 1: "Suministros", 2: "Servicios", 3: "Obras", 21: "Gestión de servicios públicos", 22: "Concesión de servicios", 31: "Concesión de obras públicas", 32: "Concesión de obras", 7: "Administrativo especial", 8: "Privado", 50: "Patrimonial" };
  const PROCEDURE = { 1: "Abierto", 2: "Restringido", 3: "Negociado sin publicidad", 4: "Negociado con publicidad", 5: "Diálogo competitivo", 6: "Contrato menor", 7: "Derivado de acuerdo marco", 9: "Abierto simplificado", 13: "Licitación con negociación" };
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const MAX_UPLOAD = 25 * 1024 * 1024;
  const UPLOAD_TYPES = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", odt: "application/vnd.oasis.opendocument.text", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip: "application/zip", txt: "text/plain", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

  const state = {
    docs: {}, // expediente rowId -> { status, list, error }
    analyses: {}, // document id -> { status, list }
    aiResult: {}, // expediente client id -> análisis mostrado
    social: {}, // expediente rowId -> { comments, activity }
    alerts: [], alertsLoaded: false,
    invitations: [], lastInviteLink: "",
    search: { filters: { status: "vigentes" }, results: null, loading: false, error: "", stats: null, page: 0 },
    usage: null, trash: null, busy: {}
  };

  const fmtBytes = (n) => n > 1048576 ? `${(n / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
  const fmtDateTime = (iso) => iso ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: MADRID }).format(new Date(iso)) : "—";
  const fmtDate = (iso) => iso ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeZone: MADRID }).format(new Date(iso)) : "—";
  const madridDate = (iso) => iso ? new Intl.DateTimeFormat("en-CA", { timeZone: MADRID, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) : null;
  const euros = (n) => (n === null || n === undefined || !Number.isFinite(Number(n))) ? null : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(Number(n));
  const ago = (iso) => { if (!iso) return "nunca"; const min = Math.round((Date.now() - new Date(iso)) / 60000); return min < 1 ? "hace un momento" : min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} días`; };
  const toast = (message) => app()?.toast(message);
  const memberName = (userId) => cloud().state.members.find((m) => m.userId === userId)?.name || "Persona retirada del espacio";
  const metaFor = (item) => cloud().state.meta[item?.id] || {};

  async function invoke(name, body) {
    const { data, error } = await db().functions.invoke(name, { body });
    if (error) {
      let message = "";
      try { message = (await error.context?.json())?.error || ""; } catch (_) { /* respuesta sin JSON */ }
      if (error.context?.status === 401) throw new (cloud().CloudError)("session", message || "Tu sesión ha caducado. Vuelve a entrar.");
      throw new (cloud().CloudError)("server", message || "El servidor no ha podido completar la operación.");
    }
    return data;
  }
  function setBusy(key, value) { state.busy[key] = value; }

  // ================================================================ Fuente oficial: búsqueda
  function fitReasons(tender, settings) {
    const reasons = [];
    const haystack = `${tender.title} ${tender.buyer || ""}`.toLocaleLowerCase("es");
    const words = String(settings.sectors || "").toLocaleLowerCase("es").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 5);
    const hit = [...new Set(words.filter((w) => haystack.includes(w)))].slice(0, 3);
    if (hit.length) reasons.push(`El objeto menciona «${hit.join("», «")}», presente en tus sectores.`);
    const cpvs = String(settings.sectors || "").match(/\b\d{4,8}\b/g) || [];
    const cpvHit = cpvs.find((code) => (tender.cpv || []).some((c) => c.startsWith(code)));
    if (cpvHit) reasons.push(`CPV ${cpvHit} declarado en tu perfil.`);
    const zones = String(settings.locations || "").toLocaleLowerCase("es");
    if (tender.province && zones.includes(tender.province.toLocaleLowerCase("es"))) reasons.push(`Se ejecuta en ${tender.province}, una de tus zonas declaradas.`);
    if (!reasons.length) reasons.push(settings.sectors || settings.locations ? "Sin coincidencias directas con tu perfil: revísala si el objeto te encaja." : "Completa sectores y zonas en Empresa para ver coincidencias.");
    return reasons;
  }
  function amountLabel(t) {
    const net = euros(t.amount_without_tax), gross = euros(t.amount_with_tax);
    if (!net && !gross) return "Importe no publicado en la fuente";
    return [net && `${net} sin IVA`, gross && `${gross} con IVA`].filter(Boolean).join(" · ");
  }
  function isHistoric(t) { return t.status_code !== "PUB" || (t.deadline_at && new Date(t.deadline_at) < new Date()); }

  async function runSearch() {
    const f = state.search.filters;
    state.search.loading = true; state.search.error = "";
    app().rerender();
    try {
      const [results, stats] = await Promise.all([
        cloud().run(db().rpc("search_tenders", { p_q: f.q || null, p_cpv: f.cpv || null, p_province: f.province || null, p_min: f.min ? Number(f.min) : null, p_max: f.max ? Number(f.max) : null, p_from: f.from || null, p_to: f.to || null, p_status: f.status || "vigentes", p_limit: 30, p_offset: state.search.page * 30 }), "No se pudo buscar."),
        cloud().run(db().rpc("tender_stats"), "No se pudo leer el estado de la fuente.")
      ]);
      state.search.results = results || [];
      state.search.stats = stats;
    } catch (error) { state.search.error = error.message; }
    state.search.loading = false;
    app().rerender();
  }

  function searchMarkup(settings, opportunities) {
    const f = state.search.filters;
    const s = state.search;
    const stats = s.stats;
    const byTender = Object.fromEntries(Object.entries(cloud().state.meta).filter(([, m]) => m.tenderId).map(([clientId, m]) => [m.tenderId, clientId]));
    const last = stats?.lastRun;
    const sourceLine = !stats ? "Pulsa Buscar para consultar la muestra oficial." : last?.status === "failed" ? `La última consulta a PLACSP falló ${ago(last.finished_at)}: ${html(last.error || "sin detalle")}. Se muestran los datos conocidos hasta ${fmtDateTime(stats.lastOk)}.` : `Última comprobación correcta de PLACSP: ${ago(stats.lastOk)} (${fmtDateTime(stats.lastOk)}). ${stats.total} licitaciones en la muestra, ${stats.vigentes} en plazo.`;
    const cards = (s.results || []).map((t) => {
      const existing = byTender[t.id];
      const historic = isHistoric(t);
      return `<article class="tender-card ${historic ? "is-historic" : ""}"><div class="card-topline"><span class="card-sector">${html(CONTRACT[t.contract_type] || "Contrato")} · ${html(PROCEDURE[t.procedure_code] || "Procedimiento por confirmar")}</span><span class="decision-pill ${historic ? "no-go" : "go"}">${historic ? "HISTÓRICO" : "VIGENTE"}</span></div>
        <h3>${html(t.title)}</h3><p class="card-organization">${html(t.buyer || "Órgano no indicado")} · ${html(t.province || t.buyer_city || "Lugar no indicado")} · Exp. ${html(t.folder_id || "—")}</p>
        <div class="card-meta"><span>Importe <strong>${html(amountLabel(t))}</strong></span><span>Fin de presentación <strong>${t.deadline_at ? html(fmtDateTime(t.deadline_at)) + " (Madrid)" : "No publicado"}</strong></span><span>Estado <strong>${html(STATUS[t.status_code] || t.status_code || "—")}</strong></span><span>CPV <strong>${html((t.cpv || []).join(", ") || "—")}</strong></span></div>
        <ul class="fit-reasons">${fitReasons(t, settings).map((r) => `<li>${html(r)}</li>`).join("")}</ul>
        <div class="tender-actions">${t.link ? `<a class="button button-light" href="${html(t.link)}" target="_blank" rel="noreferrer">Ficha oficial ↗</a>` : ""}${existing ? `<button class="button button-dark" data-open-opportunity="${html(existing)}" type="button">Abrir mi expediente →</button>` : cloud().can("editor") ? `<button class="button button-dark" data-tender-import="${html(t.id)}" type="button">Crear expediente</button>` : ""}<small>Fuente: PLACSP · actualizado en origen ${html(fmtDateTime(t.source_updated_at))}</small></div></article>`;
    }).join("");
    return `<section class="route-section search-panel"><form data-tender-search class="search-form">
        <label class="field field-wide"><span>Texto, objeto, órgano o nº de expediente</span><input name="q" value="${html(f.q || "")}" placeholder="Ej. mantenimiento ascensores, 3686/2026" /></label>
        <label class="field"><span>CPV (uno o varios, por prefijo)</span><input name="cpv" value="${html(f.cpv || "")}" inputmode="numeric" placeholder="Ej. 5075, 7731" /></label>
        <label class="field"><span>Provincia o municipio</span><input name="province" value="${html(f.province || "")}" placeholder="Ej. Madrid" /></label>
        <label class="field"><span>Importe mínimo (€ sin IVA)</span><input name="min" type="number" min="0" step="1000" value="${html(f.min || "")}" /></label>
        <label class="field"><span>Importe máximo (€ sin IVA)</span><input name="max" type="number" min="0" step="1000" value="${html(f.max || "")}" /></label>
        <label class="field"><span>Cierre desde</span><input name="from" type="date" value="${html(f.from || "")}" /></label>
        <label class="field"><span>Cierre hasta</span><input name="to" type="date" value="${html(f.to || "")}" /></label>
        <label class="field"><span>Estado</span><select name="status">${[["vigentes", "Vigentes (en plazo)"], ["PUB", "Publicadas"], ["EV", "Pendientes de adjudicación"], ["ADJ", "Adjudicadas"], ["RES", "Resueltas"], ["ANUL", "Anuladas"], ["todas", "Todas"]].map(([v, l]) => `<option value="${v}" ${f.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <div class="modal-actions field-wide"><button class="button button-quiet" data-search-reset type="button">Limpiar</button><button class="button button-dark" type="submit">${s.loading ? "Buscando…" : "Buscar en PLACSP"}</button></div></form>
        <p class="source-status ${last?.status === "failed" ? "is-error" : ""}" role="status">${sourceLine}</p></section>
      ${s.error ? `<p class="editor-error" role="alert">${html(s.error)}</p>` : ""}
      <section class="route-section"><div class="route-section-heading"><div><p class="eyebrow eyebrow-muted">RESULTADOS</p><h2>${s.results ? `${s.results.length}${s.results.length === 30 ? "+" : ""} licitaciones` : "Busca para empezar"}</h2></div><span class="count-label">Orden: cierre más próximo</span></div>
      <div class="tender-list">${s.results ? (cards || `<div class="empty-list"><strong>No hay licitaciones con estos filtros.</strong><span>La búsqueda solo cubre la muestra sincronizada de PLACSP (últimos días y expedientes que cambian). No se inventan resultados: si buscas uno concreto, añádelo con su enlace oficial.</span></div>`) : ""}</div>
      ${s.results?.length === 30 || s.page > 0 ? `<div class="modal-actions">${s.page > 0 ? '<button class="button button-quiet" data-search-page="-1" type="button">← Anteriores</button>' : ""}${s.results?.length === 30 ? '<button class="button button-quiet" data-search-page="1" type="button">Siguientes →</button>' : ""}</div>` : ""}</section>
      <p class="route-note">Las coincidencias con tu perfil son pistas visibles, no una puntuación: no ocultamos oportunidades. Comprueba siempre la ficha oficial.</p>`;
  }

  function bindSearch(root) {
    root.querySelector("[data-tender-search]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      state.search.filters = Object.fromEntries(new FormData(event.currentTarget));
      state.search.page = 0;
      runSearch();
    });
    root.querySelector("[data-search-reset]")?.addEventListener("click", () => { state.search.filters = { status: "vigentes" }; state.search.results = null; app().rerender(); });
    root.querySelectorAll("[data-search-page]").forEach((b) => b.addEventListener("click", () => { state.search.page = Math.max(0, state.search.page + Number(b.dataset.searchPage)); runSearch(); }));
    root.querySelectorAll("[data-tender-import]").forEach((b) => b.addEventListener("click", async () => {
      const tender = (state.search.results || []).find((t) => t.id === b.dataset.tenderImport);
      if (!tender) return;
      b.disabled = true; b.textContent = "Creando…";
      try { await app().createFromTender(tender); } catch (error) { toast(error.message); b.disabled = false; b.textContent = "Crear expediente"; }
    }));
  }

  function expedienteFromTender(tender, settings) {
    const now = new Date().toISOString();
    const historic = isHistoric(tender);
    const deadlineDate = madridDate(tender.deadline_at);
    const documents = (tender.documents || []).filter((d) => /^https:\/\//.test(d.url || "")).slice(0, 40).map((d, index) => ({ id: `oficial-${index}-${(d.hash || d.name || "").replace(/[^\w]/g, "").slice(0, 12)}`, name: d.name || d.kind, kind: ["PCAP", "PPT", "Anexo", "Aclaración"].includes(d.kind) ? d.kind : "Otro", url: d.url, version: d.hash ? `Huella PLACSP ${d.hash.slice(0, 10)}` : "Publicado en PLACSP", reviewedAt: "", registeredAt: now }));
    const qualification = (tender.qualification || []).filter((q) => q.text).slice(0, 25);
    return {
      id: `placsp-${tender.id}`,
      title: tender.title,
      organization: tender.buyer || "Órgano no indicado en la fuente",
      amount: amountLabel(tender),
      deadline: historic ? `Histórico · ${STATUS[tender.status_code] || "plazo cerrado"}` : tender.deadline_at ? `Fin de presentación ${fmtDateTime(tender.deadline_at)} (Madrid)` : "Plazo no publicado en la fuente",
      deadlineDate,
      sector: [CONTRACT[tender.contract_type], (tender.cpv || []).slice(0, 2).map((c) => `CPV ${c}`).join(", ")].filter(Boolean).join(" · ") || "Sin clasificar",
      territory: { city: tender.buyer_city || tender.province || "Por confirmar", province: tender.province || "Por confirmar", mode: "Por confirmar en el pliego", note: "Lugar de ejecución según PLACSP" },
      decision: settings.defaultDecision === "NO-GO" ? "NO-GO" : "REVISAR",
      fit: "Por comprobar",
      source: tender.link || "",
      sourceLabel: `PLACSP · oficial · consultado ${fmtDate(now)}`,
      summary: `${CONTRACT[tender.contract_type] || "Contrato"} · procedimiento ${PROCEDURE[tender.procedure_code] || "por confirmar"} · estado ${STATUS[tender.status_code] || tender.status_code || "—"}${(tender.lots || []).length ? ` · ${tender.lots.length} lotes` : ""}. Expediente ${tender.folder_id || ""}.`,
      why: (tender.criteria || []).filter((c) => c.text).slice(0, 6).map((c) => `Criterio: ${c.text}${c.weight !== null && c.weight !== undefined ? ` (${String(c.weight).replace(".", ",")} puntos)` : ""}`),
      nextStep: historic ? "Caso histórico: úsalo para aprender o como referencia; no hay plazo vigente." : "Archivar el PCAP y el PPT oficiales y revisar solvencia, medios y criterios.",
      nextDate: historic ? "Sin plazo operativo" : deadlineDate ? `Antes del ${fmtDate(tender.deadline_at)}` : "Fecha por confirmar",
      nextStepDone: false,
      requirements: qualification.length ? qualification.map((q, index) => ({ id: `oficial-req-${index}`, text: q.text.slice(0, 500), source: `PLACSP · ficha oficial · ${q.type}`, status: "pending", critical: q.type !== "Declaración" })) : [{ id: "req-pendiente", text: "Identificar solvencia económica y técnica en el PCAP", source: "La ficha oficial no detalla la solvencia", status: "unknown", critical: true }],
      documents,
      lots: (tender.lots || []).map((lot) => ({ id: lot.id, name: lot.name, amount: amountLabel(lot) })),
      official: { tenderId: tender.id, externalId: tender.external_id, folderId: tender.folder_id, statusCode: tender.status_code, deadlineAt: tender.deadline_at, consultedAt: now, historic },
      history: [{ label: "Expediente creado desde PLACSP", detail: `Datos oficiales consultados el ${fmtDateTime(now)}. Los datos ausentes en la fuente quedan pendientes, no a cero.`, at: now }]
    };
  }

  async function findOfficial(input) {
    const value = String(input || "").trim();
    if (!value) return [];
    const query = (column) => cloud().run(db().from("tenders").select("*").eq(column, value).is("deleted_at", null).limit(5), "No se pudo consultar la fuente.");
    if (!/^https?:\/\//.test(value)) return query("folder_id");
    const [byLink, byId] = await Promise.all([query("link"), query("external_id")]);
    return [...(byLink || []), ...(byId || [])];
  }

  // ================================================================ Documentos originales
  function docsFor(item) {
    const meta = metaFor(item);
    if (!meta.rowId) return { status: "none", list: [] };
    const entry = state.docs[meta.rowId];
    if (!entry) { loadDocs(item); return { status: "loading", list: [] }; }
    return entry;
  }
  async function loadDocs(item) {
    const rowId = metaFor(item).rowId;
    if (!rowId) return;
    state.docs[rowId] = { status: "loading", list: state.docs[rowId]?.list || [] };
    try {
      const list = await cloud().run(db().from("documents").select("id, name, kind, version_label, origin, source_url, storage_path, sha256, size_bytes, mime_type, supersedes_id, extraction_status, page_count, uploaded_by, created_at").eq("expediente_id", rowId).is("deleted_at", null).order("created_at", { ascending: false }), "No se pudieron cargar los originales.");
      state.docs[rowId] = { status: "ready", list };
    } catch (error) { state.docs[rowId] = { status: "error", list: [], error: error.message }; }
    app().rerenderDetail();
  }

  function originalsMarkup(item) {
    const entry = docsFor(item);
    const editable = cloud().can("editor");
    const supersededBy = Object.fromEntries(entry.list.filter((d) => d.supersedes_id).map((d) => [d.supersedes_id, d]));
    const official = (item.documents || []).filter((d) => /contrataciondel(estado|sectorpublico)/.test(d.url || ""));
    const archivedUrls = new Set(entry.list.map((d) => d.source_url).filter(Boolean));
    const extraction = { pending: "Texto sin extraer", done: "Texto extraído", partial: "Texto parcial: revisar", needs_ocr: "Escaneado: necesita OCR", failed: "Extracción fallida", not_applicable: "Sin lectura automática (formato no PDF)" };
    const rows = entry.list.map((d) => {
      const newer = supersededBy[d.id];
      const previous = entry.list.find((x) => x.id === d.supersedes_id);
      const busy = state.busy[`doc-${d.id}`];
      return `<div class="original-row ${newer ? "is-superseded" : ""}"><span class="document-icon">${html(d.kind)}</span><div><strong>${html(d.name)}</strong>
        <span>${html(d.version_label || "Versión sin etiqueta")} · ${d.origin === "official" ? "Copia oficial descargada de PLACSP" : "Subido"} por ${html(memberName(d.uploaded_by))} · ${html(fmtDateTime(d.created_at))}</span>
        <span class="mono">SHA-256 ${html(d.sha256.slice(0, 16))}… · ${html(fmtBytes(d.size_bytes))}${d.page_count ? ` · ${d.page_count} páginas` : ""}</span>
        <span class="doc-flags">${newer ? `<b class="flag flag-warn">Versión anterior · sustituida por «${html(newer.name)}»</b>` : ""}${previous ? `<b class="flag">Sustituye a «${html(previous.name)}»</b>` : ""}<b class="flag ${["needs_ocr", "failed", "partial"].includes(d.extraction_status) ? "flag-warn" : ""}">${html(busy || extraction[d.extraction_status] || d.extraction_status)}</b></span></div>
        <div class="original-actions"><button class="text-button" data-doc-open="${html(d.id)}" type="button">Abrir original</button>${d.page_count ? `<button class="text-button" data-doc-pages="${html(d.id)}" type="button">Ver texto por página</button>` : ""}${editable && d.mime_type === "application/pdf" && !busy ? `<button class="text-button" data-doc-extract="${html(d.id)}" type="button">${d.extraction_status === "pending" || d.extraction_status === "failed" ? "Extraer texto" : "Volver a extraer"}</button>${["needs_ocr", "partial"].includes(d.extraction_status) ? `<button class="text-button" data-doc-ocr="${html(d.id)}" type="button">Aplicar OCR</button>` : ""}` : ""}${editable && !(item.documents || []).some((r) => r.storedDocumentId === d.id) ? `<button class="text-button" data-doc-link="${html(d.id)}" type="button">Usar como fuente de requisitos</button>` : ""}${editable ? `<button class="text-button danger" data-doc-trash="${html(d.id)}" type="button">Papelera</button>` : ""}</div></div>`;
    }).join("");
    return `<section class="originals"><div class="view-heading"><div><p class="detail-section-title">Archivo documental</p><h3>Originales conservados</h3></div><span class="completion-label">${entry.list.length} archivados</span></div>
      <p class="view-intro">Cada original se guarda intacto con su huella SHA-256, versión y autoría. Una versión nueva no borra la anterior. Solo las personas de este espacio pueden abrirlos.</p>
      ${entry.status === "loading" ? '<p class="route-note">Cargando originales…</p>' : entry.status === "error" ? `<p class="editor-error" role="alert">${html(entry.error)}</p>` : ""}
      <div class="original-list">${rows || (entry.status === "ready" ? '<p class="route-note">Todavía no hay originales archivados. Una referencia o enlace no equivale a un documento descargado.</p>' : "")}</div>
      ${editable && official.length ? `<div class="official-docs"><h4>Documentos publicados en PLACSP</h4>${official.map((d) => `<div class="official-doc-row"><span class="document-icon">${html(d.kind)}</span><span>${html(d.name)}</span>${archivedUrls.has(d.url) ? '<b class="flag">Archivado</b>' : `<button class="button button-light" data-doc-official="${html(d.id)}" type="button" ${state.busy[`official-${d.id}`] ? "disabled" : ""}>${state.busy[`official-${d.id}`] ? "Descargando…" : "Archivar copia oficial"}</button>`}</div>`).join("")}</div>` : ""}
      ${editable ? `<form data-doc-upload class="editor-form"><h4>Subir un original</h4><div class="form-grid"><label class="field field-wide"><span>Archivo (PDF, Word, Excel, ODT, ZIP o imagen · máx. 25 MB)</span><input name="file" type="file" required accept=".pdf,.doc,.docx,.odt,.xls,.xlsx,.zip,.txt,.png,.jpg,.jpeg" /></label><label class="field"><span>Tipo</span><select name="kind">${["PCAP", "PPT", "Anexo", "Aclaración", "Otro"].map((k) => `<option>${k}</option>`).join("")}</select></label><label class="field"><span>Versión o fecha publicada</span><input name="version" maxlength="120" placeholder="Ej. v2 · rectificado 03/10" /></label><label class="field field-wide"><span>¿Sustituye a una versión anterior?</span><select name="supersedes"><option value="">No, es un documento nuevo</option>${entry.list.map((d) => `<option value="${html(d.id)}">${html(d.kind)} · ${html(d.name)}</option>`).join("")}</select></label></div><div class="modal-actions"><button class="button button-dark" type="submit">${state.busy.upload ? "Subiendo…" : "Archivar original"}</button></div><p class="editor-error" data-form-error role="alert"></p></form>` : ""}</section>`;
  }

  async function sha256File(file) {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function safeName(name) { return String(name || "documento").normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(0, 80) || "documento"; }

  async function upload(item, form) {
    const errorBox = form.querySelector("[data-form-error]");
    const file = form.elements.file.files?.[0];
    const meta = metaFor(item);
    errorBox.textContent = "";
    if (!file) throw new Error("Elige un archivo.");
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!UPLOAD_TYPES[ext]) throw new Error("Formato no admitido.");
    if (file.size === 0) throw new Error("El archivo está vacío.");
    if (file.size > MAX_UPLOAD) throw new Error("El archivo supera 25 MB.");
    setBusy("upload", true); app().rerenderDetail();
    try {
      const sha = await sha256File(file);
      if ((state.docs[meta.rowId]?.list || []).some((d) => d.sha256 === sha)) throw new Error("Ese mismo archivo ya está archivado en este expediente.");
      const path = `${cloud().state.workspaceId}/${meta.rowId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const row = await cloud().run(db().from("documents").insert({ workspace_id: cloud().state.workspaceId, expediente_id: meta.rowId, name: file.name.slice(0, 300), kind: form.elements.kind.value, version_label: form.elements.version.value.trim(), origin: "upload", storage_path: path, sha256: sha, size_bytes: file.size, mime_type: UPLOAD_TYPES[ext], supersedes_id: form.elements.supersedes.value || null, extraction_status: ext === "pdf" ? "pending" : "not_applicable" }).select("*").single(), "No se pudo registrar el documento.");
      const { error } = await db().storage.from("documents").upload(path, file, { contentType: UPLOAD_TYPES[ext], upsert: false });
      if (error) {
        await db().from("documents").update({ deleted_at: new Date().toISOString(), extraction_status: "failed" }).eq("id", row.id);
        throw new Error(`La subida falló (${error.message}). No figura como disponible.`);
      }
      toast("Original archivado con su huella.");
      await loadDocs(item);
      if (ext === "pdf") await extract(item, row);
    } finally { setBusy("upload", false); app().rerenderDetail(); }
  }

  async function archiveOfficial(item, refId) {
    const ref = (item.documents || []).find((d) => d.id === refId);
    if (!ref) return;
    setBusy(`official-${refId}`, true); app().rerenderDetail();
    try {
      const result = await invoke("official-document", { expedienteId: metaFor(item).rowId, url: ref.url, name: ref.name, kind: ref.kind, versionLabel: ref.version });
      toast(result.duplicate ? "Ese documento ya estaba archivado (misma huella)." : "Copia oficial archivada.");
      await loadDocs(item);
      const doc = state.docs[metaFor(item).rowId]?.list.find((d) => d.id === result.document.id);
      if (doc && doc.mime_type === "application/pdf" && doc.extraction_status === "pending") await extract(item, doc);
    } catch (error) { toast(error.message); }
    finally { setBusy(`official-${refId}`, false); app().rerenderDetail(); }
  }

  async function signedUrl(doc) {
    const data = await cloud().run(db().storage.from("documents").createSignedUrl(doc.storage_path, 300), "No se pudo abrir el original.");
    return data.signedUrl;
  }

  let pdfjsPromise = null;
  function pdfjs() {
    pdfjsPromise ||= import(PDFJS).then((lib) => { lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return lib; });
    return pdfjsPromise;
  }

  async function extract(item, doc) {
    const key = `doc-${doc.id}`;
    setBusy(key, "Extrayendo texto…"); app().rerenderDetail();
    try {
      const url = await signedUrl(doc);
      const response = await fetch(url);
      if (!response.ok) throw new Error("No se pudo descargar el original para leerlo.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      const lib = await pdfjs();
      const pdf = await lib.getDocument({ data: bytes, isEvalSupported: false }).promise;
      const pages = [];
      for (let number = 1; number <= pdf.numPages; number += 1) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        const text = content.items.map((entry) => `${entry.str}${entry.hasEOL ? "\n" : " "}`).join("").replace(/[ \t]+/g, " ").trim();
        pages.push({ document_id: doc.id, workspace_id: cloud().state.workspaceId, page_number: number, text, method: "text" });
        if (number % 10 === 0) { setBusy(key, `Extrayendo… ${number}/${pdf.numPages}`); app().rerenderDetail(); }
      }
      for (let index = 0; index < pages.length; index += 50) {
        await cloud().run(db().from("document_pages").upsert(pages.slice(index, index + 50), { onConflict: "document_id,page_number" }), "No se pudo guardar el texto extraído.");
      }
      const empty = pages.filter((p) => p.text.length < 40).length;
      const status = empty === pages.length ? "needs_ocr" : empty > 0 ? "partial" : "done";
      await cloud().run(db().from("documents").update({ extraction_status: status, page_count: pdf.numPages }).eq("id", doc.id), "No se pudo actualizar el estado del documento.");
      toast(status === "done" ? `Texto extraído de ${pdf.numPages} páginas.` : status === "partial" ? `${empty} páginas sin texto: revísalas o aplica OCR.` : "El PDF parece escaneado: aplica OCR o revisa manualmente.");
    } catch (error) {
      await db().from("documents").update({ extraction_status: "failed" }).eq("id", doc.id);
      toast(`No se pudo leer el PDF: ${error.message}`);
    } finally { setBusy(key, false); await loadDocs(item); }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some((s) => s.src === src)) return resolve();
      const script = document.createElement("script");
      script.src = src; script.onload = resolve; script.onerror = () => reject(new Error("No se pudo cargar el lector OCR."));
      document.head.appendChild(script);
    });
  }

  async function ocr(item, doc) {
    const limit = 40;
    if (!window.confirm(`El OCR se ejecuta en este navegador (sin enviar el documento a terceros salvo la descarga del motor de reconocimiento desde jsDelivr). Puede tardar 10–20 s por página. Se procesarán ${Math.min(doc.page_count || limit, limit)} páginas como máximo. ¿Continuar?`)) return;
    const key = `doc-${doc.id}`;
    setBusy(key, "Preparando OCR…"); app().rerenderDetail();
    let worker;
    try {
      await loadScript(TESSERACT);
      worker = await globalThis.Tesseract.createWorker("spa");
      const url = await signedUrl(doc);
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      const lib = await pdfjs();
      const pdf = await lib.getDocument({ data: bytes, isEvalSupported: false }).promise;
      const existing = await cloud().run(db().from("document_pages").select("page_number, text").eq("document_id", doc.id), "No se pudo leer el texto actual.");
      const weak = new Set((existing || []).filter((p) => p.text.length < 40).map((p) => p.page_number));
      const targets = Array.from({ length: pdf.numPages }, (_, i) => i + 1).filter((n) => weak.size === 0 || weak.has(n)).slice(0, limit);
      for (const [index, number] of targets.entries()) {
        setBusy(key, `OCR ${index + 1}/${targets.length}…`); app().rerenderDetail();
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        const { data } = await worker.recognize(canvas);
        await cloud().run(db().from("document_pages").upsert({ document_id: doc.id, workspace_id: cloud().state.workspaceId, page_number: number, text: data.text.trim(), method: "ocr" }, { onConflict: "document_id,page_number" }), "No se pudo guardar el OCR.");
      }
      const remaining = pdf.numPages > limit && weak.size > limit;
      await cloud().run(db().from("documents").update({ extraction_status: remaining ? "partial" : "done", page_count: pdf.numPages }).eq("id", doc.id), "No se pudo actualizar el documento.");
      toast(remaining ? `OCR aplicado a ${limit} páginas; el resto sigue pendiente.` : "OCR aplicado. Revisa las tablas y cifras contra el original: el reconocimiento puede fallar.");
    } catch (error) { toast(`OCR no completado: ${error.message}`); }
    finally { await worker?.terminate?.(); setBusy(key, false); await loadDocs(item); }
  }

  async function showPages(doc, focusPage) {
    const pages = await cloud().run(db().from("document_pages").select("page_number, text, method").eq("document_id", doc.id).order("page_number"), "No se pudo leer el texto.");
    const dialog = modal(`<div class="modal-head"><div><p class="eyebrow eyebrow-muted">Texto extraído · revisar contra el original</p><h2>${html(doc.name)}</h2></div><button class="close-button" data-close type="button" aria-label="Cerrar">×</button></div>
      <div class="pages-toolbar"><label class="field"><span>Buscar en el documento</span><input data-page-search type="search" /></label><button class="button button-light" data-open-original type="button">Abrir original</button></div>
      <div class="page-list">${(pages || []).map((p) => `<article class="page-text" id="pagina-${p.page_number}" data-page="${p.page_number}"><h4>Página ${p.page_number}${p.method === "ocr" ? " · OCR" : ""}</h4><pre>${html(p.text || "(sin texto: revisar el original)")}</pre></article>`).join("")}</div>`);
    dialog.querySelector("[data-open-original]").addEventListener("click", async () => window.open(`${await signedUrl(doc)}#page=${focusPage || 1}`, "_blank", "noopener"));
    dialog.querySelector("[data-page-search]").addEventListener("input", (event) => {
      const q = event.target.value.toLocaleLowerCase("es");
      dialog.querySelectorAll(".page-text").forEach((el) => { el.hidden = Boolean(q) && !el.textContent.toLocaleLowerCase("es").includes(q); });
    });
    if (focusPage) dialog.querySelector(`#pagina-${focusPage}`)?.scrollIntoView({ block: "start" });
  }

  function modal(inner) {
    const wrapper = document.createElement("div");
    wrapper.className = "modal";
    wrapper.setAttribute("role", "dialog");
    wrapper.setAttribute("aria-modal", "true");
    wrapper.innerHTML = `<div class="modal-card modal-wide">${inner}</div>`;
    const previous = document.activeElement;
    const close = () => { wrapper.remove(); previous?.focus?.(); };
    wrapper.addEventListener("click", (event) => { if (event.target === wrapper || event.target.closest("[data-close]")) close(); });
    wrapper.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    document.body.appendChild(wrapper);
    wrapper.querySelector("button, input, a")?.focus();
    wrapper.close = close;
    return wrapper;
  }

  function bindOriginals(root, item) {
    const list = () => state.docs[metaFor(item).rowId]?.list || [];
    const find = (id) => list().find((d) => d.id === id);
    root.querySelector("[data-doc-upload]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try { await upload(item, form); } catch (error) { const box = root.querySelector("[data-doc-upload] [data-form-error]"); if (box) box.textContent = error.message; else toast(error.message); }
    });
    root.querySelectorAll("[data-doc-official]").forEach((b) => b.addEventListener("click", () => archiveOfficial(item, b.dataset.docOfficial)));
    root.querySelectorAll("[data-doc-open]").forEach((b) => b.addEventListener("click", async () => {
      const win = window.open("", "_blank", "noopener");
      try { const url = await signedUrl(find(b.dataset.docOpen)); if (win) win.location = url; else window.location.assign(url); } catch (error) { win?.close(); toast(error.message); }
    }));
    root.querySelectorAll("[data-doc-pages]").forEach((b) => b.addEventListener("click", () => showPages(find(b.dataset.docPages)).catch((e) => toast(e.message))));
    root.querySelectorAll("[data-doc-extract]").forEach((b) => b.addEventListener("click", () => extract(item, find(b.dataset.docExtract))));
    root.querySelectorAll("[data-doc-ocr]").forEach((b) => b.addEventListener("click", () => ocr(item, find(b.dataset.docOcr))));
    root.querySelectorAll("[data-doc-link]").forEach((b) => b.addEventListener("click", () => linkAsReference(item, find(b.dataset.docLink))));
    root.querySelectorAll("[data-doc-trash]").forEach((b) => b.addEventListener("click", async () => {
      const doc = find(b.dataset.docTrash);
      if (!window.confirm(`«${doc.name}» irá a la papelera del espacio. El original se conserva y puedes restaurarlo desde Ajustes. Las evidencias que lo citan dejarán de contar como trazables. ¿Continuar?`)) return;
      try { await cloud().run(db().from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", doc.id), "No se pudo mover a la papelera."); toast("Documento en la papelera."); await loadDocs(item); } catch (error) { toast(error.message); }
    }));
  }

  function referenceFor(doc) {
    const appLink = `${location.origin}${location.pathname}#documento=${doc.id}`;
    return { id: `archivo-${doc.id}`, storedDocumentId: doc.id, name: doc.name, kind: doc.kind, url: doc.source_url || appLink, version: doc.version_label || `SHA-256 ${doc.sha256.slice(0, 12)}`, reviewedAt: "", registeredAt: new Date().toISOString() };
  }
  async function linkAsReference(item, doc) {
    const ref = referenceFor(doc);
    const supersededRef = doc.supersedes_id ? (item.documents || []).find((r) => r.storedDocumentId === doc.supersedes_id) : null;
    await app().commit(item.id, (draft) => {
      draft.documents = draft.documents || [];
      if (draft.documents.some((r) => r.storedDocumentId === doc.id)) return;
      draft.documents.push(ref);
      if (supersededRef) {
        // Las evidencias de la versión anterior se conservan pero dejan de ser vigentes.
        (draft.requirements || []).filter((r) => r.documentId === supersededRef.id && r.status === "confirmed").forEach((r) => { r.status = "pending"; r.verifiedAt = ""; r.source = `${r.source} · versión anterior: revisar en «${doc.name}»`; });
      }
      app().history(draft, `Original vinculado como fuente: ${doc.name}`, supersededRef ? "Sustituye a una versión anterior: sus evidencias vuelven a pendiente sin borrarse." : "Ya puede citarse por página en los requisitos.");
    }, supersededRef ? "Nueva versión vinculada. Las evidencias de la anterior requieren revisión." : "Documento disponible como fuente de requisitos.");
  }

  // ================================================================ IA
  function analysesFor(docId) {
    if (!state.analyses[docId]) {
      state.analyses[docId] = { status: "loading", list: [] };
      cloud().run(db().from("ai_analyses").select("id, status, created_at, model, cost_usd, result, error, created_by").eq("document_id", docId).order("created_at", { ascending: false }).limit(5), "")
        .then((list) => { state.analyses[docId] = { status: "ready", list: list || [] }; app().rerenderDetail(); })
        .catch(() => { state.analyses[docId] = { status: "error", list: [] }; });
    }
    return state.analyses[docId];
  }

  async function loadUsage() {
    try { state.usage = await cloud().run(db().rpc("ai_usage_summary", { p_workspace: cloud().state.workspaceId }), ""); } catch (_) { state.usage = null; }
  }

  function aiMarkup(item) {
    const docs = docsFor(item).list.filter((d) => ["done", "partial"].includes(d.extraction_status));
    const shown = state.aiResult[item.id];
    const editable = cloud().can("editor");
    const usage = state.usage;
    const limits = usage?.limits || {};
    const selected = shown?.documentId || docs[0]?.id || "";
    const previous = selected ? analysesFor(selected).list.filter((a) => a.status === "done") : [];
    const result = shown?.analysis?.result || previous[0]?.result;
    const meta = shown?.analysis || previous[0];
    const matchLabel = { consta: "Consta en tu perfil", parcial: "Consta en parte", no_consta: "No consta en tu perfil", sin_perfil: "Perfil vacío" };
    return `<section class="ai-panel"><div class="view-heading"><div><p class="detail-section-title">Lectura asistida · IA</p><h3>Proponer requisitos desde el pliego</h3></div><span class="example-label">Propuesta · revisión humana obligatoria</span></div>
      <p class="view-intro">Claude lee el texto extraído del documento que elijas y propone requisitos con página y cita literal. Pliego Claro comprueba que cada cita existe en esa página; lo que no se puede comprobar queda marcado sin soporte. Nada se confirma solo.</p>
      ${!docs.length ? '<p class="route-note">Primero archiva un PDF en Documentos y extrae su texto. Sin texto no se envía nada.</p>' : editable ? `<form data-ai-form class="ai-form"><label class="field"><span>Documento a analizar</span><select name="documentId">${docs.map((d) => `<option value="${html(d.id)}" ${d.id === selected ? "selected" : ""}>${html(d.kind)} · ${html(d.name)} (${d.page_count || "?"} pág.)</option>`).join("")}</select></label>
        <p class="editor-help">Se enviará a Anthropic (proveedor de IA, EE. UU.) solo el texto extraído de ese documento y los seis bloques de tu perfil de empresa. No se envían otros documentos, notas ni datos personales del equipo. ${usage ? `Uso del mes: ${Number(usage.globalMonthUsd).toFixed(2)} de ${limits.ai_monthly_budget_usd} USD · hoy has usado ${usage.userToday} de ${limits.ai_user_daily_requests} análisis.` : ""}</p>
        <div class="modal-actions"><button class="button button-dark" type="submit" ${state.busy.ai ? "disabled" : ""}>${state.busy.ai ? "Analizando… (hasta 2 min)" : "Analizar con IA"}</button></div><p class="editor-error" data-form-error role="alert"></p></form>` : ""}
      ${result ? `<div class="ai-result"><div class="ai-result-head"><strong>Resultado ${shown?.reused ? "reutilizado (mismo documento, sin coste nuevo)" : ""}</strong><small>${html(fmtDateTime(meta?.created_at))} · ${html(meta?.model || "")} · coste ${Number(meta?.cost_usd || 0).toFixed(3)} USD${result.coverage ? ` · páginas analizadas ${result.coverage.includedPages}/${result.coverage.totalPages}` : ""}</small></div>
        <div class="summary-grid">${Object.entries({ object: "Objeto", buyer: "Órgano", amount: "Importe", deadline: "Plazo", duration: "Duración", lots: "Lotes" }).map(([k, l]) => `<div class="summary-cell"><span>${l} · interpretación IA</span><strong>${html(result.summary?.[k] || "No encontrado en el texto")}</strong></div>`).join("")}</div>
        ${(result.warnings || []).length ? `<div class="approval-banner"><strong>Avisos</strong><span>${result.warnings.map(html).join("<br>")}</span></div>` : ""}
        <form data-ai-accept><div class="ai-reqs">${(result.requirements || []).map((r, i) => `<label class="ai-req ${r.verified ? "" : "is-unsupported"}"><input type="checkbox" name="req" value="${i}" ${r.verified ? "checked" : ""} ${editable ? "" : "disabled"} /><span><strong>${html(r.text)}</strong><small>${html(r.category.replaceAll("_", " "))} · ${r.critical ? "decisivo" : "no decisivo"} · pág. ${html(r.page)} · ${r.verified ? "✓ cita verificada en la página" : "⚠ cita no encontrada: sin soporte"}</small><q>${html(r.quote)}</q><small>Empresa: ${html(matchLabel[r.company_match] || r.company_match)} — ${html(r.company_reason)}</small></span></label>`).join("") || '<p class="route-note">No se propusieron requisitos.</p>'}</div>
        ${(result.not_found || []).length ? `<p class="editor-help"><b>No encontrado en el texto:</b> ${result.not_found.map(html).join(" · ")}</p>` : ""}
        ${editable && (result.requirements || []).length ? '<div class="modal-actions"><button class="button button-dark" type="submit">Añadir seleccionados como requisitos pendientes</button></div><p class="editor-help">Se añaden como «pendiente» con su página. Para confirmarlos sigue haciendo falta revisar el documento y registrar la evidencia de la empresa.</p>' : ""}</form></div>` : ""}</section>`;
  }

  function bindAi(root, item) {
    root.querySelector("[data-ai-form] select")?.addEventListener("change", (event) => { state.aiResult[item.id] = { documentId: event.target.value }; app().rerenderDetail(); });
    root.querySelector("[data-ai-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const documentId = form.elements.documentId.value;
      const doc = docsFor(item).list.find((d) => d.id === documentId);
      if (!window.confirm(`Se enviará el texto de «${doc?.name}» y tu perfil de empresa a Anthropic para proponer requisitos. ¿Continuar?`)) return;
      setBusy("ai", true); app().rerenderDetail();
      try {
        const data = await invoke("analyze-document", { documentId });
        state.aiResult[item.id] = { documentId, analysis: data.analysis, reused: data.reused };
        delete state.analyses[documentId];
        toast(data.reused ? "Análisis reutilizado: mismo documento y versión." : "Análisis completado. Revisa cada propuesta.");
      } catch (error) {
        state.aiResult[item.id] = { documentId };
        toast(error.message);
      } finally { setBusy("ai", false); await loadUsage(); app().rerenderDetail(); }
    });
    root.querySelector("[data-ai-accept]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const chosen = new FormData(event.currentTarget).getAll("req").map(Number);
      const documentId = state.aiResult[item.id]?.documentId || root.querySelector("[data-ai-form] select")?.value;
      const doc = docsFor(item).list.find((d) => d.id === documentId);
      const result = state.aiResult[item.id]?.analysis?.result || analysesFor(documentId).list.find((a) => a.status === "done")?.result;
      if (!chosen.length || !doc || !result) { toast("Selecciona al menos un requisito."); return; }
      const ref = (item.documents || []).find((r) => r.storedDocumentId === doc.id) || referenceFor(doc);
      await app().commit(item.id, (draft) => {
        draft.documents = draft.documents || [];
        if (!draft.documents.some((r) => r.id === ref.id)) draft.documents.push(ref);
        chosen.forEach((index) => {
          const r = result.requirements[index];
          if (!r) return;
          draft.requirements.push({ id: crypto.randomUUID(), text: r.text, status: "pending", critical: Boolean(r.critical), documentId: ref.id, citation: `pág. ${r.page}`, source: `${ref.kind} · ${ref.name} · pág. ${r.page} · propuesto por IA, pendiente de revisión`, companyEvidence: "", evidenceUrl: "", documentReviewedAt: "", sourceUrl: ref.url, sourceVersion: ref.version || "", verifiedAt: "", aiQuote: r.quote, aiVerified: Boolean(r.verified), aiCompanyMatch: r.company_match });
        });
        app().history(draft, `${chosen.length} requisitos propuestos por IA añadidos como pendientes`, `Documento ${doc.name}. Interpretación de IA: requiere revisión humana y evidencia antes de confirmar.`);
      }, "Requisitos añadidos como pendientes.");
    });
  }

  // ================================================================ Seguimiento: avisos, comentarios, actividad
  function socialFor(item) {
    const rowId = metaFor(item).rowId;
    if (!rowId) return { status: "none", comments: [], activity: [] };
    if (!state.social[rowId]) {
      state.social[rowId] = { status: "loading", comments: [], activity: [] };
      Promise.all([
        cloud().run(db().from("comments").select("id, author_id, body, created_at").eq("expediente_id", rowId).is("deleted_at", null).order("created_at"), ""),
        cloud().run(db().from("activity_log").select("actor_id, action, detail, created_at").eq("expediente_id", rowId).order("id", { ascending: false }).limit(40), "")
      ]).then(([comments, activity]) => { state.social[rowId] = { status: "ready", comments: comments || [], activity: activity || [] }; app().rerenderDetail(); })
        .catch((error) => { state.social[rowId] = { status: "error", comments: [], activity: [], error: error.message }; app().rerenderDetail(); });
    }
    return state.social[rowId];
  }
  const ACTIONS = { expediente_creado: "Creó el expediente", expediente_editado: "Editó", expediente_a_papelera: "Movió a la papelera", expediente_restaurado: "Restauró", documento_archivado: "Archivó un original", documento_a_papelera: "Envió un original a la papelera", documento_actualizado: "Actualizó un original" };

  function followMarkup(item) {
    const social = socialFor(item);
    const official = item.official;
    const changes = (item.events || []).filter((e) => e.official);
    return `<section class="follow-panel">
      ${official ? `<div class="source-box"><strong>Vigilancia de la fuente oficial</strong><span>Vinculado a PLACSP (expediente ${html(official.folderId || "—")}). Se comprueba automáticamente cada 30 minutos; un cambio de plazo, documentos o estado crea un aviso, reabre una decisión GO y deja una tarea. ${state.search.stats?.lastOk ? `Última comprobación correcta: ${html(fmtDateTime(state.search.stats.lastOk))}.` : ""}</span>${official.historic ? "<small>Caso histórico o cerrado: no generará avisos de presentación.</small>" : ""}</div>` : '<div class="source-box"><strong>Sin vigilancia automática</strong><span>Este expediente no está vinculado a una licitación de PLACSP. Créalo desde «Buscar en PLACSP» para recibir cambios oficiales.</span></div>'}
      ${changes.length ? `<div class="change-diffs">${changes.map((e) => `<details ${e.reviewed ? "" : "open"}><summary>${html(fmtDateTime(e.at))} · ${html(e.label)} ${e.reviewed ? "· revisado" : "· pendiente de revisar"}</summary><table class="diff-table"><thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead><tbody>${(e.changes || []).map((c) => `<tr><td>${html(c.label || c.field)}</td><td>${html(c.field === "deadline_at" && c.before ? fmtDateTime(c.before) : c.before ?? "—")}</td><td>${html(c.field === "deadline_at" && c.after ? fmtDateTime(c.after) : c.after ?? "—")}</td></tr>`).join("")}</tbody></table></details>`).join("")}</div>` : ""}
      <div class="comments"><h4>Comentarios del equipo</h4>${social.status === "loading" ? "<p class='route-note'>Cargando…</p>" : ""}${social.comments.map((c) => `<div class="comment"><b>${html(memberName(c.author_id))}</b><time>${html(fmtDateTime(c.created_at))}</time><p>${html(c.body)}</p></div>`).join("") || (social.status === "ready" ? "<p class='route-note'>Sin comentarios todavía.</p>" : "")}
        ${cloud().can("editor") ? `<form data-comment-form class="comment-form"><label class="field field-wide"><span>Añadir comentario (visible para el espacio)</span><textarea name="body" rows="2" maxlength="4000" required></textarea></label><button class="button button-quiet" type="submit">Comentar</button></form>` : ""}</div>
      <div class="activity"><h4>Actividad registrada en el servidor</h4>${social.activity.map((a) => `<div class="activity-row"><time>${html(fmtDateTime(a.created_at))}</time><span><b>${html(a.actor_id ? memberName(a.actor_id) : "Sistema · PLACSP")}</b> ${html(ACTIONS[a.action] || a.action)}${a.detail ? ` · ${html(a.detail)}` : ""}</span></div>`).join("") || "<p class='route-note'>Sin actividad.</p>"}</div></section>`;
  }
  function bindFollow(root, item) {
    root.querySelector("[data-comment-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = String(new FormData(event.currentTarget).get("body") || "").trim();
      if (!body) return;
      try {
        await cloud().run(db().from("comments").insert({ workspace_id: cloud().state.workspaceId, expediente_id: metaFor(item).rowId, body }), "No se pudo guardar el comentario.");
        delete state.social[metaFor(item).rowId];
        app().rerenderDetail();
      } catch (error) { toast(error.message); }
    });
    // Abrir el seguimiento marca como leídos los avisos de este expediente.
    const unread = state.alerts.filter((a) => a.expediente_id === metaFor(item).rowId && !a.read_at);
    unread.forEach((a) => { a.read_at = new Date().toISOString(); db().rpc("mark_alert_read", { p_alert: a.id }).then(() => {}); });
  }

  async function loadAlerts() {
    try {
      state.alerts = await cloud().run(db().from("alerts").select("id, expediente_id, title, detail, created_at, read_at, kind").eq("workspace_id", cloud().state.workspaceId).order("created_at", { ascending: false }).limit(30), "") || [];
    } catch (_) { state.alerts = []; }
    state.alertsLoaded = true;
  }
  function alertsMarkup(opportunities) {
    const idToClient = Object.fromEntries(Object.entries(cloud().state.meta).map(([clientId, m]) => [m.rowId, clientId]));
    const unread = state.alerts.filter((a) => !a.read_at);
    const drafts = cloud().drafts();
    return `${drafts.length ? `<section class="route-note draft-banner" role="alert"><strong>Cambios sin guardar en el servidor (${drafts.length})</strong><p>Se quedaron como borrador en este navegador por un error de conexión, sesión o conflicto. Revísalos antes de seguir.</p>${drafts.map((d) => `<div class="draft-row"><span>${html(d.item.title)} · ${html(fmtDateTime(d.at))} · ${html({ conflict: "conflicto con otra edición", network: "sin conexión", session: "sesión caducada" }[d.reason] || "error")}</span><button class="button button-dark" data-draft-retry="${html(d.item.id)}" type="button">${d.reason === "conflict" ? "Sustituir la versión del servidor por la mía" : "Reintentar guardado"}</button><button class="button button-quiet" data-draft-discard="${html(d.item.id)}" type="button">Descartar borrador</button></div>`).join("")}</section>` : ""}
      <section class="route-section"><div class="route-section-heading"><div><p class="eyebrow eyebrow-muted">AVISOS</p><h2>Cambios oficiales ${unread.length ? `· ${unread.length} sin leer` : ""}</h2></div></div>
      <div class="task-board">${state.alerts.slice(0, 6).map((a) => `<div class="task-board-row ${a.read_at ? "task-board-row-completed" : ""}"><span class="task-check-button ${a.read_at ? "task-state-completed" : "task-state-review"}">${a.read_at ? "✓" : "!"}</span><div class="task-board-copy"><strong>${html(a.title)}</strong><span>${html(opportunities.find((o) => o.id === idToClient[a.expediente_id])?.title || "Expediente")}</span><small>${html(a.detail)}</small></div><span class="task-state">${a.read_at ? "Leído" : "Nuevo"}</span>${idToClient[a.expediente_id] ? `<button class="route-row-action" data-open-opportunity="${html(idToClient[a.expediente_id])}" data-open-tab="changes" type="button">Revisar →</button>` : ""}</div>`).join("") || '<div class="empty-list"><strong>Sin avisos.</strong><span>Los cambios publicados en PLACSP de tus expedientes vinculados aparecerán aquí.</span></div>'}</div></section>`;
  }

  // ================================================================ Equipo, invitaciones y permisos
  async function loadInvitations() {
    if (!cloud().can("admin")) { state.invitations = []; return; }
    try { state.invitations = await cloud().run(db().from("invitations").select("id, email, role, created_at, expires_at, accepted_at, revoked_at").eq("workspace_id", cloud().state.workspaceId).order("created_at", { ascending: false }).limit(30), "") || []; } catch (_) { state.invitations = []; }
  }
  const ROLE = { owner: "Titular", admin: "Administración", editor: "Edición", viewer: "Lectura" };
  function membersMarkup() {
    const me = cloud().state.user?.id;
    const admin = cloud().can("admin");
    const pending = state.invitations.filter((i) => !i.accepted_at && !i.revoked_at && new Date(i.expires_at) > new Date());
    return `<section class="route-section"><div class="route-section-heading"><div><p class="eyebrow eyebrow-muted">PERSONAS CON ACCESO</p><h2>Miembros del espacio</h2></div><span class="count-label">Permisos comprobados en el servidor</span></div>
      <p class="view-intro">Lectura: ver. Edición: trabajar expedientes, documentos y tareas. Administración: además invitar y cambiar permisos. Titular: además ceder o borrar el espacio.</p>
      <div class="member-list">${cloud().state.members.map((m) => `<div class="member-row"><div class="team-avatar">${html((m.name || m.email).slice(0, 2).toUpperCase())}</div><div><strong>${html(m.name || "Sin nombre")}${m.userId === me ? " (tú)" : ""}</strong><span>${html(m.email)}</span></div>${admin && m.userId !== me ? `<select data-member-role="${html(m.userId)}" aria-label="Permiso de ${html(m.name)}">${Object.entries(ROLE).filter(([r]) => r !== "owner" || cloud().can("owner")).map(([r, l]) => `<option value="${r}" ${m.role === r ? "selected" : ""}>${l}</option>`).join("")}</select><button class="text-button danger" data-member-remove="${html(m.userId)}" type="button">Retirar acceso</button>` : `<span class="settings-badge">${ROLE[m.role]}</span>${m.userId === me && m.role !== "owner" ? '<button class="text-button danger" data-member-leave type="button">Salir del espacio</button>' : ""}`}</div>`).join("")}</div>
      ${admin ? `<form data-invite-form class="team-form"><label class="field"><span>Correo de la persona</span><input name="email" type="email" required /></label><label class="field"><span>Permiso</span><select name="role"><option value="editor">Edición</option><option value="viewer">Lectura</option><option value="admin">Administración</option></select></label><button class="button button-dark" type="submit">Crear invitación</button></form>
      ${state.lastInviteLink ? `<div class="invite-link"><strong>Invitación creada.</strong><span>Solo funciona para ese correo, una vez, durante 7 días.</span><input readonly value="${html(state.lastInviteLink)}" aria-label="Enlace de invitación" /><div class="modal-actions"><button class="button button-light" data-invite-copy type="button">Copiar enlace</button><button class="button button-dark" data-invite-send type="button">Enviar por correo</button></div></div>` : ""}
      ${pending.length ? `<div class="pending-invites"><h4>Invitaciones pendientes</h4>${pending.map((i) => `<div class="member-row"><div><strong>${html(i.email)}</strong><span>${ROLE[i.role]} · caduca ${html(fmtDate(i.expires_at))}</span></div><button class="text-button danger" data-invite-revoke="${html(i.id)}" type="button">Retirar</button></div>`).join("")}</div>` : ""}` : ""}</section>`;
  }
  function bindMembers(root) {
    const reload = async () => { await app().reloadWorkspace(); await loadInvitations(); app().rerender(); };
    root.querySelectorAll("[data-member-role]").forEach((s) => s.addEventListener("change", async () => {
      try { await cloud().run(db().rpc("set_member_role", { p_workspace: cloud().state.workspaceId, p_user: s.dataset.memberRole, p_role: s.value }), "No se pudo cambiar el permiso."); toast("Permiso actualizado."); } catch (error) { toast(error.message); }
      await reload();
    }));
    root.querySelectorAll("[data-member-remove]").forEach((b) => b.addEventListener("click", async () => {
      if (!window.confirm("Esa persona perderá el acceso a este espacio de inmediato. Sus aportaciones se conservan. ¿Retirar acceso?")) return;
      try { await cloud().run(db().rpc("remove_member", { p_workspace: cloud().state.workspaceId, p_user: b.dataset.memberRemove }), "No se pudo retirar el acceso."); toast("Acceso retirado."); } catch (error) { toast(error.message); }
      await reload();
    }));
    root.querySelector("[data-member-leave]")?.addEventListener("click", async () => {
      if (!window.confirm("Dejarás de ver este espacio. ¿Salir?")) return;
      try { await cloud().run(db().rpc("remove_member", { p_workspace: cloud().state.workspaceId, p_user: cloud().state.user.id }), "No se pudo salir."); location.hash = "hoy"; await app().boot(); } catch (error) { toast(error.message); }
    });
    root.querySelector("[data-invite-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      try {
        const token = await cloud().run(db().rpc("create_invitation", { p_workspace: cloud().state.workspaceId, p_email: data.email, p_role: data.role }), "No se pudo crear la invitación.");
        state.lastInviteToken = token;
        state.lastInviteLink = `${location.origin}${location.pathname}#invitacion=${token}`;
        await loadInvitations(); app().rerender();
      } catch (error) { toast(error.message); }
    });
    root.querySelector("[data-invite-copy]")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(state.lastInviteLink); toast("Enlace copiado."); } catch (_) { toast("Copia el enlace manualmente."); } });
    root.querySelector("[data-invite-send]")?.addEventListener("click", async (event) => {
      event.currentTarget.disabled = true;
      try { await invoke("invite-email", { token: state.lastInviteToken }); toast("Invitación enviada por correo. El proveedor la ha aceptado; la entrega final depende del servidor de destino."); } catch (error) { toast(error.message); event.currentTarget.disabled = false; }
    });
    root.querySelectorAll("[data-invite-revoke]").forEach((b) => b.addEventListener("click", async () => {
      try { await cloud().run(db().rpc("revoke_invitation", { p_invitation: b.dataset.inviteRevoke }), "No se pudo retirar."); toast("Invitación retirada."); } catch (error) { toast(error.message); }
      await reload();
    }));
  }

  async function acceptInvitationFromUrl() {
    const match = String(globalThis.PLIEGO_INITIAL_HASH || location.hash).match(/invitacion=([0-9a-f]{64})/);
    if (!match) return false;
    try {
      const workspaceId = await cloud().run(db().rpc("accept_invitation", { p_token: match[1] }), "No se pudo aceptar la invitación.");
      cloud().safeSet(`pliego-claro-espacio:${cloud().state.user.id}`, workspaceId);
      toast("Invitación aceptada. Ya tienes acceso al espacio.");
    } catch (error) { toast(error.message); }
    globalThis.PLIEGO_INITIAL_HASH = "";
    history.replaceState(null, "", `${location.pathname}${location.search}#hoy`);
    return true;
  }

  // ================================================================ Cuenta, espacio, papelera, privacidad
  function accountMarkup(settings) {
    const user = cloud().state.user;
    const me = cloud().state.members.find((m) => m.userId === user?.id);
    const usage = state.usage;
    const trash = state.trash;
    return `<section class="settings-section" id="ajuste-cuenta"><div class="settings-section-heading"><div><span class="settings-kicker">00 · CUENTA</span><h2>Tu cuenta y tu espacio</h2><p>Sesión iniciada como ${html(user?.email)}. Permiso en este espacio: ${ROLE[cloud().state.role]}.</p></div><span class="settings-section-icon">◎</span></div>
      <div class="settings-field-grid">
        <form data-profile-form class="settings-field"><span>Tu nombre visible</span><input name="name" value="${html(me?.name || "")}" maxlength="120" required /><button class="button button-quiet" type="submit">Guardar nombre</button></form>
        <label class="settings-toggle settings-toggle-card"><span><strong>Recibir avisos por correo</strong><small>Cambios oficiales y cierres de este espacio, si el espacio los tiene activados.</small></span><input data-email-alerts type="checkbox" ${state.profileAlerts !== false ? "checked" : ""} /></label>
        <form data-password-form class="settings-field"><span>Cambiar contraseña</span><input name="password" type="password" autocomplete="new-password" minlength="10" placeholder="Nueva contraseña" required /><button class="button button-quiet" type="submit">Cambiar</button></form>
        <div class="settings-field"><span>Espacio de trabajo</span><select data-workspace-switch>${cloud().state.workspaces.map((w) => `<option value="${html(w.id)}" ${w.id === cloud().state.workspaceId ? "selected" : ""}>${html(w.name)} · ${ROLE[w.role]}</option>`).join("")}</select><button class="button button-quiet" data-workspace-new type="button">Crear otro espacio</button></div>
      </div>
      <div class="settings-action-grid"><button class="settings-action" data-sign-out type="button"><strong>Cerrar sesión</strong><span>En este navegador</span></button><button class="settings-action" data-export-ics type="button"><strong>Exportar calendario (.ics)</strong><span>Cierres y fechas de tareas con zona Europe/Madrid</span></button><a class="settings-action" href="#privacidad"><strong>Privacidad y proveedores</strong><span>Qué datos se tratan y dónde</span></a></div>
      ${usage ? `<div class="settings-inline-note"><strong>IA este mes:</strong> ${Number(usage.globalMonthUsd).toFixed(2)} USD de un límite de ${usage.limits?.ai_monthly_budget_usd} USD para todo el servicio (este espacio: ${Number(usage.workspaceMonthUsd).toFixed(2)} USD). Al llegar al límite se detienen nuevos análisis; el trabajo manual sigue disponible.</div>` : ""}
      <div class="trash-box"><div class="route-section-heading"><div><h3>Papelera del espacio</h3><p class="editor-help">Los elementos borrados se conservan aquí y pueden restaurarse.</p></div><button class="button button-quiet" data-trash-load type="button">${trash ? "Actualizar" : "Ver papelera"}</button></div>
      ${trash ? `${[...trash.expedientes.map((e) => ["expediente", e.id, e.title, e.deleted_at, e.version]), ...trash.documents.map((d) => ["documento", d.id, d.name, d.deleted_at]), ...trash.notes.map((n) => ["nota", n.id, n.text, n.deleted_at])].map(([kind, id, label, at, version]) => `<div class="member-row"><div><strong>${html(String(label).slice(0, 120))}</strong><span>${kind} · borrado ${html(fmtDateTime(at))}</span></div>${cloud().can("editor") ? `<button class="text-button" data-restore="${kind}|${id}|${version ?? ""}" type="button">Restaurar</button>` : ""}</div>`).join("") || "<p class='route-note'>La papelera está vacía.</p>"}` : ""}</div>
      <div class="settings-danger-row"><div><strong>Borrar mi cuenta</strong><small>Elimina tu cuenta y los espacios donde eres la única persona. Exporta antes una copia. No se puede deshacer.</small></div><button class="button button-danger" data-delete-account type="button">Borrar cuenta…</button></div></section>`;
  }
  function bindAccount(root, opportunities, settings) {
    root.querySelector("[data-profile-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = String(new FormData(event.currentTarget).get("name") || "").trim();
      try { await cloud().run(db().from("profiles").update({ display_name: name }).eq("user_id", cloud().state.user.id), "No se pudo guardar."); await app().reloadWorkspace(); toast("Nombre actualizado."); app().rerender(); } catch (error) { toast(error.message); }
    });
    root.querySelector("[data-email-alerts]")?.addEventListener("change", async (event) => {
      try { await cloud().run(db().from("profiles").update({ email_alerts: event.target.checked }).eq("user_id", cloud().state.user.id), "No se pudo guardar."); state.profileAlerts = event.target.checked; toast("Preferencia guardada."); } catch (error) { event.target.checked = !event.target.checked; toast(error.message); }
    });
    root.querySelector("[data-password-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try { await cloud().updatePassword(String(new FormData(event.currentTarget).get("password"))); event.currentTarget.reset(); toast("Contraseña cambiada."); } catch (error) { toast(error.message); }
    });
    root.querySelector("[data-workspace-switch]")?.addEventListener("change", async (event) => { cloud().safeSet(`pliego-claro-espacio:${cloud().state.user.id}`, event.target.value); await app().boot(event.target.value); });
    root.querySelector("[data-workspace-new]")?.addEventListener("click", async () => {
      const name = window.prompt("Nombre del nuevo espacio (por ejemplo, el nombre de la empresa):");
      if (!name) return;
      try { const id = await cloud().createWorkspace(name); await app().boot(id); toast("Espacio creado."); } catch (error) { toast(error.message); }
    });
    root.querySelector("[data-sign-out]")?.addEventListener("click", () => app().signOut());
    root.querySelector("[data-export-ics]")?.addEventListener("click", () => exportIcs(opportunities));
    root.querySelector("[data-trash-load]")?.addEventListener("click", async () => { try { state.trash = await cloud().listTrash(); app().rerender(); } catch (error) { toast(error.message); } });
    root.querySelectorAll("[data-restore]").forEach((b) => b.addEventListener("click", async () => {
      const [kind, id, version] = b.dataset.restore.split("|");
      try { await cloud().restoreFromTrash(kind, id, Number(version || 0)); state.trash = await cloud().listTrash(); await app().reloadWorkspace(); toast("Restaurado."); app().rerender(); } catch (error) { toast(error.message); }
    }));
    root.querySelector("[data-delete-account]")?.addEventListener("click", async () => {
      const typed = window.prompt("Esto borra tu cuenta y los espacios donde eres la única persona, con sus documentos. Exporta antes una copia.\nEscribe BORRAR MI CUENTA para confirmar:");
      if (typed !== "BORRAR MI CUENTA") { toast("No se ha borrado nada."); return; }
      try { await invoke("delete-account", { confirm: typed }); toast("Cuenta eliminada."); await app().signOut(); } catch (error) { toast(error.message); }
    });
  }
  async function loadProfilePrefs() {
    try { const row = await cloud().run(db().from("profiles").select("email_alerts").eq("user_id", cloud().state.user.id).single(), ""); state.profileAlerts = row.email_alerts; } catch (_) { state.profileAlerts = true; }
  }

  // Calendario: fechas exactas con zona horaria, UID estable para no duplicar eventos al reimportar.
  function icsEscape(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`); }
  function buildIcs(opportunities, now = new Date()) {
    const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const events = [];
    opportunities.forEach((item) => {
      if (item.decision === "NO-GO") return;
      if (item.deadlineDate) {
        const official = item.official?.deadlineAt && madridDate(item.official.deadlineAt) === item.deadlineDate ? new Date(item.official.deadlineAt) : null;
        const local = official ? new Intl.DateTimeFormat("en-GB", { timeZone: MADRID, hour: "2-digit", minute: "2-digit", hour12: false }).format(official).replace(":", "") + "00" : "235900";
        events.push(["cierre", item, `${item.deadlineDate.replace(/-/g, "")}T${local}`, `Cierre: ${item.title}`]);
      }
      Object.entries(item.taskPlans || {}).forEach(([taskId, plan]) => { if (plan.dueDate) events.push([`tarea-${taskId}`, item, `${plan.dueDate.replace(/-/g, "")}T090000`, `Tarea: ${plan.note || "tarea asignada"} · ${item.title}`]); });
    });
    const body = events.map(([kind, item, start, summary]) => ["BEGIN:VEVENT", `UID:${icsEscape(`${item.id}-${kind}`)}@pliego-claro`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Europe/Madrid:${start}`, `SUMMARY:${icsEscape(summary)}`, `DESCRIPTION:${icsEscape(`${item.organization}\nContrasta la fecha con la fuente oficial.`)}`, "END:VEVENT"].join("\r\n"));
    const tz = ["BEGIN:VTIMEZONE", "TZID:Europe/Madrid", "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT", "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD", "END:VTIMEZONE"].join("\r\n");
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pliego Claro//ES", "CALSCALE:GREGORIAN", tz, ...body, "END:VCALENDAR"].join("\r\n") + "\r\n";
  }
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportIcs(opportunities) { download("pliego-claro-fechas.ics", buildIcs(opportunities), "text/calendar"); toast("Calendario exportado. Al reimportarlo se actualizan los mismos eventos."); }

  // Informe revisable del expediente (imprimible a PDF).
  function exportReport(item, team) {
    const confirmedFn = globalThis.PliegoClaroWorkflow.confirmed;
    const docs = state.docs[metaFor(item).rowId]?.list || [];
    const reqRows = (item.requirements || []).map((r) => { const ok = confirmedFn(r, item.documents); const doc = (item.documents || []).find((d) => d.id === r.documentId); return `<tr><td>${html(r.text)}</td><td>${r.critical === false ? "No" : "Sí"}</td><td>${html(doc ? `${doc.kind} · ${doc.name} · ${doc.version || "versión s/d"}` : "Fuente pendiente")}${r.citation ? ` · ${html(r.citation)}` : ""}</td><td>${html(r.companyEvidence || "Pendiente")}</td><td>${ok ? "Confirmado (revisión manual)" : r.status === "unknown" ? "No localizado" : r.aiQuote && !ok ? "Propuesto por IA · pendiente" : "Pendiente"}</td></tr>`; }).join("");
    const tasks = app().tasksFor(item).map((t) => `<tr><td>${html(t.title)}</td><td>${html(t.status)}</td><td>${html(t.ownerId ? team.find((m) => m.id === t.ownerId)?.name || "—" : "Sin responsable")}</td><td>${html(t.dueDate || "—")}</td></tr>`).join("");
    const missing = (item.requirements || []).filter((r) => !confirmedFn(r, item.documents) && r.critical !== false).length;
    const page = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Revisión · ${html(item.title)}</title><style>body{font:13px/1.45 system-ui,sans-serif;color:#142523;max-width:960px;margin:24px auto;padding:0 16px}h1{font-size:22px}h2{font-size:15px;margin-top:22px;border-bottom:1px solid #ccc}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:5px;vertical-align:top;text-align:left}.warn{background:#fef6e7;padding:8px;border:1px solid #e2c27a}.muted{color:#666}</style></head><body>
      <p class="muted">Pliego Claro · informe generado ${html(fmtDateTime(new Date().toISOString()))} · versión del expediente ${metaFor(item).version || "—"}</p><h1>${html(item.title)}</h1>
      ${missing ? `<p class="warn"><b>Borrador no final:</b> ${missing} requisitos decisivos sin evidencia trazable. No es una oferta ni un dictamen de cumplimiento.</p>` : ""}
      <h2>Resumen</h2><p><b>Órgano:</b> ${html(item.organization)}<br><b>Importe:</b> ${html(item.amount)}<br><b>Plazo:</b> ${html(item.deadline || item.deadlineDate || "—")}<br><b>Fuente:</b> ${html(item.sourceLabel || "")} ${item.source ? `<a href="${html(item.source)}">${html(item.source)}</a>` : ""}<br><b>Objeto:</b> ${html(item.summary)}</p>
      <h2>Decisión</h2><p><b>${html(item.decision)}</b> ${item.decisionConfirmedAt ? `· confirmada ${html(fmtDateTime(item.decisionConfirmedAt))}` : "· sin confirmación razonada"}<br>${html(item.decisionReason || "Motivo pendiente.")}</p>
      <h2>Documentos analizados</h2><ul>${(item.documents || []).map((d) => `<li>${html(d.kind)} · ${html(d.name)} · ${html(d.version || "versión s/d")} · ${d.reviewedAt ? `revisado ${html(fmtDateTime(d.reviewedAt))}` : "sin revisión registrada"}</li>`).join("")}${docs.map((d) => `<li>Original archivado: ${html(d.name)} · SHA-256 ${html(d.sha256)}</li>`).join("")}</ul>
      <h2>Matriz de cumplimiento</h2><table><thead><tr><th>Requisito</th><th>Decisivo</th><th>Documento y cita</th><th>Evidencia de la empresa</th><th>Estado</th></tr></thead><tbody>${reqRows}</tbody></table>
      <h2>Riesgos y costes</h2><p>${html(app().economicStatus(item))}</p>
      <h2>Tareas</h2><table><thead><tr><th>Tarea</th><th>Estado</th><th>Responsable</th><th>Fecha</th></tr></thead><tbody>${tasks}</tbody></table>
      <h2>Historial</h2><ul>${(item.history || []).slice(0, 30).map((h) => `<li>${html(fmtDateTime(h.at))} · ${html(h.label)}</li>`).join("")}</ul>
      <p class="muted">La firma y presentación de la oferta se realizan por una persona responsable en el portal oficial. Este informe no sustituye la revisión del expediente oficial.</p></body></html>`;
    const win = window.open("", "_blank");
    if (!win) { download(`revision-${item.id}.html`, page, "text/html"); return; }
    win.document.write(page); win.document.close();
  }

  function csvMatrix(item) {
    const rows = [["Requisito", "Decisivo", "Documento", "Cita", "Evidencia empresa", "Estado"], ...(item.requirements || []).map((r) => { const d = (item.documents || []).find((x) => x.id === r.documentId); return [r.text, r.critical === false ? "No" : "Sí", d ? `${d.kind} ${d.name}` : "", r.citation || "", r.companyEvidence || "", globalThis.PliegoClaroWorkflow.confirmed(r, item.documents) ? "Confirmado" : r.status]; })];
    download(`matriz-${item.id}.csv`, "\ufeff" + rows.map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n"), "text/csv");
  }

  function privacyMarkup() {
    return `<div class="privacy"><p class="eyebrow">PRIVACIDAD Y OPERACIÓN · versión piloto 08/10/2026 · pendiente de revisión legal</p>
      <h2>Qué datos tratamos y para qué</h2><p>Pliego Claro trata los datos necesarios para que tu equipo revise licitaciones: cuenta (nombre, correo y contraseña cifrada por el proveedor de autenticación), perfil de empresa que tú declaras, expedientes, notas, tareas, comentarios, documentos que archivas y registro de actividad (quién cambió qué y cuándo).</p>
      <h2>Proveedores que reciben datos</h2><ul><li><b>Supabase</b> (base de datos, autenticación y archivos; región UE indicada al crear el proyecto): todos los datos del espacio.</li><li><b>GitHub Pages</b>: sirve la aplicación; no recibe tus expedientes.</li><li><b>Anthropic</b> (IA, EE. UU.): solo cuando pulsas «Analizar con IA», el texto del documento elegido y el perfil de empresa. Consulta su política de retención de datos de la API.</li><li><b>Resend</b> (correo): tu dirección y el texto del aviso cuando activas avisos o envías invitaciones.</li><li><b>jsDelivr y cdnjs</b>: sirven bibliotecas de código (lectura de PDF y OCR); no reciben documentos.</li></ul>
      <h2>Fuente oficial</h2><p>Las licitaciones proceden de la sindicación pública de la Plataforma de Contratación del Sector Público. Contrástalas siempre con el expediente oficial.</p>
      <h2>Acceso, conservación, exportación y borrado</h2><p>Solo las personas invitadas a un espacio ven sus datos; los permisos se comprueban en el servidor. Los elementos borrados pasan a una papelera recuperable. Puedes exportar el espacio completo en JSON desde Ajustes y borrar tu cuenta y tus espacios. Se hace una copia de seguridad cifrada diaria con retención de 14 días.</p>
      <h2>Responsable de incidencias</h2><p>El titular del servicio piloto (nestor@ncompany.es) atiende incidencias y solicitudes. No se afirma cumplimiento legal: este texto debe revisarlo una persona cualificada antes de abrir el servicio a terceros.</p></div>`;
  }
  function showPrivacy() { modal(`<div class="modal-head"><div><h2>Privacidad y proveedores</h2></div><button class="close-button" data-close type="button" aria-label="Cerrar">×</button></div>${privacyMarkup()}`); }

  // Cargas al entrar en un espacio
  async function onWorkspaceLoaded() {
    state.docs = {}; state.analyses = {}; state.social = {}; state.aiResult = {}; state.trash = null; state.lastInviteLink = "";
    await Promise.all([loadAlerts(), loadUsage(), loadInvitations(), loadProfilePrefs(), cloud().run(db().rpc("tender_stats"), "").then((s) => { state.search.stats = s; }).catch(() => {})]);
  }

  globalThis.PliegoFeatures = Object.freeze({
    state, searchMarkup, bindSearch, expedienteFromTender, findOfficial, isHistoric,
    originalsMarkup, bindOriginals, aiMarkup, bindAi, followMarkup, bindFollow, alertsMarkup, loadAlerts,
    membersMarkup, bindMembers, acceptInvitationFromUrl, accountMarkup, bindAccount,
    exportReport, csvMatrix, buildIcs, privacyMarkup, showPrivacy, showPages, onWorkspaceLoaded, loadDocs, fitReasons, amountLabel
  });
})();
