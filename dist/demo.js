/* Entorno de demostración. Solo se activa cuando la web NO está conectada a su servidor.
   Reproduce en el navegador las operaciones del servidor (tablas, archivos, funciones) para enseñar
   la herramienta completa. Cualquier correo y contraseña dan acceso; la contraseña no se guarda ni se envía.
   Los datos viven solo en este navegador. Las licitaciones son reales (muestra fija de PLACSP). */
(() => {
  const base = globalThis.PliegoCloud;
  const STORE = "pliego-claro-demo-v2";
  const SESSION = "pliego-claro-demo-sesion";
  const DATASET = "demo/licitaciones.json";
  const active = !base.configured;
  if (!active) { globalThis.PliegoDemo = Object.freeze({ active: false }); return; }

  const { CloudError, state } = base;
  const WS = "00000000-0000-4000-8000-000000000001";
  const ME = "00000000-0000-4000-8000-0000000000a1";
  const uuid = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

  // ------------------------------------------------------------ almacén
  let db = null;
  let memorySession = null;
  let persistent = true;
  function load() {
    if (db) return db;
    try { db = JSON.parse(localStorage.getItem(STORE)); } catch (_) { db = null; }
    db ||= { seeded: false, expedientes: {}, settings: { data: {}, version: 1 }, notes: [], roles: [], members: [], tables: {} };
    return db;
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(db)); }
    catch (_) { throw new CloudError("network", "No se pudo guardar en este navegador (almacenamiento lleno o bloqueado). No se ha guardado nada."); }
  }
  const table = (name) => { const store = load(); store.tables[name] ||= []; return store.tables[name]; };

  // ------------------------------------------------------------ archivos (IndexedDB)
  let idb = null;
  function files() {
    idb ||= new Promise((resolve, reject) => {
      const req = indexedDB.open("pliego-claro-demo-archivos", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("files");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return idb;
  }
  async function putFile(path, blob) {
    const handle = await files();
    await new Promise((resolve, reject) => { const tx = handle.transaction("files", "readwrite"); tx.objectStore("files").put(blob, path); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }
  async function getFile(path) {
    const doc = table("documents").find((row) => row.storage_path === path);
    const bundled = doc?.bundled_source || (doc?.id === "00000000-0000-4000-8000-00000000d0c1" ? "demo/noia-pcap.pdf" : null);
    if (bundled) {
      const response = await fetch(bundled);
      if (!response.ok) throw new CloudError("network", "No se pudo abrir el PDF de ejemplo. Vuelve a intentarlo.");
      return response.blob();
    }
    const handle = await files();
    return new Promise((resolve, reject) => { const req = handle.transaction("files").objectStore("files").get(path); req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error); });
  }
  async function sha256(buffer) {
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // ------------------------------------------------------------ licitaciones reales
  let datasetPromise = null;
  const dataset = () => globalThis.PliegoDemoData?.dataset ? Promise.resolve(globalThis.PliegoDemoData.dataset) : (datasetPromise ||= fetch(DATASET).then((r) => { if (!r.ok) throw new Error(); return r.json(); }).catch(() => { datasetPromise = null; throw new CloudError("network", "No se pudo cargar la fuente de licitaciones."); }));
  const madrid = (iso) => iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) : null;
  async function searchTenders(p) {
    const { tenders } = await dataset();
    const words = String(p.p_q || "").trim().toLocaleLowerCase("es").split(/\s+/).filter(Boolean);
    const cpvs = String(p.p_cpv || "").replace(/[^0-9,]/g, "").split(",").filter(Boolean);
    const place = String(p.p_province || "").trim().toLocaleLowerCase("es");
    const status = p.p_status || "vigentes";
    const rows = tenders.filter((t) => {
      const text = `${t.title} ${t.buyer || ""} ${t.folder_id || ""} ${t.province || ""}`.toLocaleLowerCase("es");
      const amount = t.amount_without_tax ?? t.amount_with_tax;
      const day = madrid(t.deadline_at);
      if (words.length && !words.every((w) => text.includes(w))) return false;
      if (cpvs.length && !(t.cpv || []).some((c) => cpvs.some((w) => c.startsWith(w)))) return false;
      if (place && !`${t.province || ""} ${t.buyer_city || ""}`.toLocaleLowerCase("es").includes(place)) return false;
      if (p.p_min != null && !(amount >= p.p_min)) return false;
      if (p.p_max != null && !(amount <= p.p_max)) return false;
      if (p.p_from && !(day && day >= p.p_from)) return false;
      if (p.p_to && !(day && day <= p.p_to)) return false;
      if (status === "vigentes") return t.status_code === "PUB" && t.deadline_at && Date.parse(t.deadline_at) >= Date.now();
      return status === "todas" || t.status_code === status;
    }).sort((a, b) => (a.deadline_at ? Date.parse(a.deadline_at) : Infinity) - (b.deadline_at ? Date.parse(b.deadline_at) : Infinity) || a.id.localeCompare(b.id));
    const limit = Math.min(Math.max(p.p_limit || 30, 1), 100);
    return rows.slice(p.p_offset || 0, (p.p_offset || 0) + limit);
  }
  async function tenderStats() {
    const { meta, tenders } = await dataset();
    const lastOk = meta.generadoEl || null;
    return { demo: true, total: tenders.length, vigentes: tenders.filter((t) => t.status_code === "PUB" && t.deadline_at && Date.parse(t.deadline_at) >= Date.now()).length, lastRun: null, lastOk };
  }

  // ------------------------------------------------------------ consultas tipo PostgREST sobre tablas locales
  const DEFAULTS = {
    documents: () => ({ id: uuid(), created_at: now(), deleted_at: null, uploaded_by: ME, extraction_status: "pending", supersedes_id: null }),
    comments: () => ({ id: uuid(), created_at: now(), deleted_at: null, author_id: ME }),
    invitations: () => ({ id: uuid(), created_at: now(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), accepted_at: null, revoked_at: null, invited_by: ME }),
    alerts: () => ({ id: uuid(), created_at: now(), read_at: null }),
    activity_log: () => ({ id: Date.now() + Math.random(), created_at: now(), actor_id: ME }),
    ai_analyses: () => ({ id: uuid(), created_at: now(), created_by: ME }),
    document_pages: () => ({ created_at: now(), method: "text" })
  };
  const onInsert = {
    documents(row) { log(row.expediente_id, "documento_archivado", `${row.name} · sha256 ${row.sha256.slice(0, 12)}`); },
    comments(row) { row.author_id = ME; }
  };
  function log(expedienteId, action, detail, actor = ME, at = now()) {
    table("activity_log").push({ ...DEFAULTS.activity_log(), expediente_id: expedienteId, actor_id: actor, action, detail, created_at: at });
  }
  function query(name) {
    const ops = { filters: [], order: [], limit: null, range: null, single: false, maybe: false, write: null, payload: null, head: false, onConflict: null };
    const value = (row, column) => {
      const m = column.match(/^(\w+)->>(\w+)$/);
      return m ? row[m[1]]?.[m[2]] : row[column];
    };
    const cmp = (a, b) => (a > b) - (a < b);
    const matches = (row) => ops.filters.every(([op, column, arg]) => {
      const v = value(row, column);
      if (op === "eq") return String(v) === String(arg);
      if (op === "neq") return String(v) !== String(arg);
      if (op === "is") return arg === null ? v === null || v === undefined : v === arg;
      if (op === "not_is") return !(v === null || v === undefined);
      if (op === "in") return arg.map(String).includes(String(v));
      if (op === "gte") return v >= arg;
      return true;
    });
    function finish(out, total = out.length) {
      if (ops.head) return { data: null, error: null, count: total };
      if (ops.single || ops.maybe) {
        if (!out.length) return ops.maybe ? { data: null, error: null } : { data: null, error: { message: "Registro no encontrado." } };
        return { data: clone(out[0]), error: null };
      }
      return { data: clone(out), error: null, count: total };
    }
    function run() {
      const rows = table(name);
      if (ops.write === "insert" || ops.write === "upsert") {
        const list = (Array.isArray(ops.payload) ? ops.payload : [ops.payload]).map((input) => ({ ...(DEFAULTS[name]?.() || {}), ...clone(input) }));
        const keys = ops.onConflict ? ops.onConflict.split(",") : null;
        const out = [];
        for (const row of list) {
          const existing = keys && rows.find((r) => keys.every((k) => String(r[k]) === String(row[k])));
          if (existing) { Object.assign(existing, row); out.push(existing); }
          else { rows.push(row); onInsert[name]?.(row); out.push(row); }
        }
        save();
        return finish(out);
      }
      const selected = rows.filter(matches);
      if (ops.write === "update") { selected.forEach((r) => Object.assign(r, clone(ops.payload))); save(); return finish(selected); }
      if (ops.write === "delete") { load().tables[name] = rows.filter((r) => !selected.includes(r)); save(); return finish(selected); }
      let out = selected.slice();
      if (ops.order.length) out.sort((a, b) => { for (const [column, asc] of ops.order) { const c = cmp(value(a, column), value(b, column)); if (c) return asc ? c : -c; } return 0; });
      const total = out.length;
      if (ops.range) out = out.slice(ops.range[0], ops.range[1] + 1);
      if (ops.limit != null) out = out.slice(0, ops.limit);
      return finish(out, total);
    }
    const chain = {
      select(_columns, options = {}) { ops.head = Boolean(options.head); return chain; },
      eq(c, v) { ops.filters.push(["eq", c, v]); return chain; },
      neq(c, v) { ops.filters.push(["neq", c, v]); return chain; },
      is(c, v) { ops.filters.push(["is", c, v]); return chain; },
      not(c, op, v) { if (op === "is" && v === null) ops.filters.push(["not_is", c]); return chain; },
      in(c, v) { ops.filters.push(["in", c, v]); return chain; },
      gte(c, v) { ops.filters.push(["gte", c, v]); return chain; },
      or() { return chain; },
      order(c, options = {}) { ops.order.push([c, options.ascending !== false]); return chain; },
      limit(n) { ops.limit = n; return chain; },
      range(a, b) { ops.range = [a, b]; return chain; },
      single() { ops.single = true; return chain; },
      maybeSingle() { ops.maybe = true; return chain; },
      insert(payload) { ops.write = "insert"; ops.payload = payload; return chain; },
      upsert(payload, options = {}) { ops.write = "upsert"; ops.payload = payload; ops.onConflict = options.onConflict || null; return chain; },
      update(payload) { ops.write = "update"; ops.payload = payload; return chain; },
      delete() { ops.write = "delete"; return chain; },
      then(resolve, reject) { try { return Promise.resolve(run()).then(resolve, reject); } catch (error) { return Promise.reject(error).then(resolve, reject); } }
    };
    return chain;
  }

  // ------------------------------------------------------------ análisis de demostración: extracción del texto real con citas literales
  const RULES = [
    ["plazo", /prazo de presentaci|plazo de presentaci|presentaci[oó]n de (ofertas|proposiciones)|presentaci[oó]n das (ofertas|proposici)/i, true],
    ["importe", /orzamento base|presupuesto base|valor estimado/i, true],
    ["solvencia_economica", /solvencia econ[oó]mica|volume anual|volumen anual|seguro de responsabilidade|seguro de responsabilidad/i, true],
    ["solvencia_tecnica", /solvencia t[eé]cnica|clasificaci[oó]n do contratista|clasificaci[oó]n del contratista|obras (similares|executadas|ejecutadas)|traballos (similares|realizados)/i, true],
    ["medios", /medios (persoais|personales|materiais|materiales)|adscrici[oó]n de medios|adscripci[oó]n de medios|persoal t[eé]cnico|personal t[eé]cnico/i, true],
    ["garantia", /garant[ií]a definitiva|garant[ií]a provisional/i, true],
    ["criterio_adjudicacion", /criterios de adxudicaci[oó]n|criterios de adjudicaci[oó]n|ponderaci[oó]n/i, false],
    ["condicion_ejecucion", /condici[oó]ns especiais|condiciones especiales/i, false],
    ["documentacion", /declaraci[oó]n responsable|\bDEUC\b/i, true]
  ];
  const LABELS = { plazo: "Presentar la oferta dentro del plazo", importe: "Ajustar la oferta al presupuesto base de licitación", solvencia_economica: "Acreditar solvencia económica y financiera", solvencia_tecnica: "Acreditar solvencia técnica o profesional", medios: "Adscribir los medios personales y materiales exigidos", garantia: "Constituir la garantía exigida", criterio_adjudicacion: "Preparar la oferta según los criterios de adjudicación", condicion_ejecucion: "Cumplir las condiciones especiales de ejecución", documentacion: "Presentar declaración responsable / DEUC" };
  function analyzePages(pages, profile) {
    const requirements = [];
    const missing = [];
    const profileText = Object.values(profile || {}).join(" ").toLocaleLowerCase("es");
    for (const [category, pattern, critical] of RULES) {
      let found = null;
      for (const page of pages) {
        const sentences = page.text.replace(/\s+/g, " ").split(/(?<=[.;])\s+/);
        const hit = sentences.find((s) => pattern.test(s) && s.length > 40);
        if (hit) { found = { page: page.page_number, quote: hit.split(" ").slice(0, 34).join(" ").trim() }; break; }
      }
      if (!found) { missing.push(LABELS[category]); continue; }
      const match = !profileText.trim() ? "sin_perfil" : category === "solvencia_economica" && /volumen|facturaci|seguro/.test(profileText) ? "consta" : category === "solvencia_tecnica" && /obras|clasificaci|certificad/.test(profileText) ? "parcial" : category === "medios" && /plantilla|personal|maquinaria/.test(profileText) ? "consta" : "no_consta";
      requirements.push({ text: LABELS[category], category, critical, page: found.page, quote: found.quote, company_match: match, company_reason: match === "consta" ? "El perfil declara datos que cubren este punto; aporta el documento acreditativo." : match === "parcial" ? "El perfil cubre una parte: comprueba importes, años y tipología exigidos." : match === "sin_perfil" ? "Perfil de empresa vacío." : "No consta en el perfil de empresa." });
    }
    const first = (pages[0]?.text || "").replace(/\s+/g, " ");
    return { summary: { object: first.slice(0, 240) || null, buyer: null, amount: null, deadline: null, duration: null, lots: null }, requirements, not_found: missing, warnings: pages.some((p) => p.text.trim().length < 40) ? ["Hay páginas sin texto: revisa el original o aplica OCR."] : [] };
  }

  // ------------------------------------------------------------ funciones de servidor
  const memberName = (id) => load().members.find((m) => m.userId === id)?.name || "Persona";
  async function invoke(name, body = {}) {
    if (name === "service-status") return { ai: true, aiConfigured: true, email: true };
    if (name === "invite-email") return { sent: true, providerId: uuid() };
    if (name === "delete-account") { if (body.dryRun) return { workspacesToDelete: 1, workspacesKept: 0 }; throw new Error("La cuenta de este entorno no se puede borrar."); }
    if (name === "official-document") {
      const exp = Object.values(load().expedientes).find((row) => `demo-${row.clientId}` === body.expedienteId);
      const bundled = exp?.data?.demoBundled?.[body.url];
      if (!bundled) throw new Error("La Plataforma no ha permitido la descarga automática de este documento. Ábrelo desde la ficha oficial y súbelo con «Subir un original».");
      const blob = await (await fetch(bundled)).blob();
      const sha = await sha256(await blob.arrayBuffer());
      const existing = table("documents").find((d) => d.expediente_id === body.expedienteId && d.sha256 === sha && !d.deleted_at);
      if (existing) return { document: clone(existing), duplicate: true };
      const path = `${WS}/${body.expedienteId}/${uuid()}-${String(body.name).replace(/[^\w.]+/g, "_")}`;
      await putFile(path, blob);
      const { data } = await query("documents").insert({ workspace_id: WS, expediente_id: body.expedienteId, name: body.name, kind: body.kind, version_label: body.versionLabel || "", origin: "official", source_url: body.url, storage_path: path, sha256: sha, size_bytes: blob.size, mime_type: "application/pdf", extraction_status: "pending" }).select().single();
      return { document: data, duplicate: false };
    }
    if (name === "analyze-document") {
      const doc = table("documents").find((d) => d.id === body.documentId);
      if (!doc) throw new Error("Documento no disponible.");
      const pages = table("document_pages").filter((p) => p.document_id === body.documentId).sort((a, b) => a.page_number - b.page_number);
      if (!pages.length) throw new Error("Primero hay que extraer el texto del documento.");
      const settings = load().settings.data;
      const cached = table("ai_analyses").find((a) => a.document_id === body.documentId && a.status === "done");
      if (cached && !body.force) return { analysis: clone(cached), reused: true };
      const chars = pages.reduce((n, p) => n + p.text.length, 0);
      const row = { ...DEFAULTS.ai_analyses(), workspace_id: WS, expediente_id: doc.expediente_id, document_id: doc.id, status: "running", model: "claude-opus-5-5", cost_usd: 0, request_id: body.requestId };
      table("ai_analyses").push(row); save();
      setTimeout(() => {
        const result = analyzePages(pages, { a: settings.sectors, b: settings.technicalSolvency, c: settings.economicSolvency, d: settings.collaborationNotes });
        result.requirements = result.requirements.map((r) => ({ ...r, verified: true, support: "cita_verificada" }));
        result.coverage = { includedPages: pages.length, totalPages: pages.length, lastPage: pages.at(-1)?.page_number ?? null };
        Object.assign(row, { status: "done", result, input_tokens: Math.round(chars / 3.6), output_tokens: 3100, cost_usd: Math.round((((chars / 3.6) * 4 + 3100 * 20) / 1e6) * 10000) / 10000, finished_at: now() });
        save();
      }, 6000);
      return { analysisId: row.id, status: "running" };
    }
    throw new Error("Operación no disponible.");
  }
  async function rpc(name, p = {}) {
    if (name === "search_tenders") return searchTenders(p);
    if (name === "tender_stats") return tenderStats();
    if (name === "mark_alert_read") { const a = table("alerts").find((x) => x.id === p.p_alert); if (a && !a.read_at) { a.read_at = now(); a.read_by = ME; save(); } return null; }
    if (name === "ai_usage_summary") {
      const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const month = table("ai_analyses").filter((a) => a.created_at >= start.toISOString());
      const spent = month.reduce((n, a) => n + Number(a.cost_usd || 0), 0);
      const daily = month.filter((a) => a.created_at >= today.toISOString());
      return { globalMonthUsd: spent, workspaceMonthUsd: spent, workspaceToday: daily.length, userToday: daily.filter((a) => a.created_by === ME).length, limits: { ai_monthly_budget_usd: 15, ai_user_daily_requests: 10, ai_workspace_daily_requests: 25, ai_max_cost_per_analysis_usd: 1, ai_enabled: 1 } };
    }
    if (name === "create_invitation") {
      const email = String(p.p_email || "").trim().toLowerCase();
      if (base.validateEmail(email)) throw new Error("Correo no válido.");
      if (load().members.some((m) => m.email === email)) throw new Error("Esa persona ya es miembro del espacio.");
      table("invitations").filter((i) => i.email === email && !i.accepted_at && !i.revoked_at).forEach((i) => { i.revoked_at = now(); });
      const token = (uuid() + uuid()).replace(/-/g, "");
      table("invitations").push({ ...DEFAULTS.invitations(), workspace_id: WS, email, role: p.p_role });
      save();
      return token;
    }
    if (name === "revoke_invitation") { const i = table("invitations").find((x) => x.id === p.p_invitation); if (i) { i.revoked_at = now(); save(); } return null; }
    if (name === "set_member_role") { const m = load().members.find((x) => x.userId === p.p_user); if (m) { m.role = p.p_role; save(); } return null; }
    if (name === "remove_member") {
      if (p.p_user === ME) throw new Error("El espacio necesita al menos una persona titular.");
      load().members = load().members.filter((m) => m.userId !== p.p_user); save(); return null;
    }
    if (name === "create_workspace") throw new Error("Este plan incluye un único espacio de empresa.");
    throw new Error("Operación no disponible.");
  }

  // Perfil propio (nombre y avisos), guardado junto a los miembros.
  function profileQuery() {
    let payload = null;
    const chain = {
      select() { return chain; }, eq() { return chain; }, single() { return chain; },
      update(value) { payload = value; return chain; },
      then(resolve) {
        const m = load().members.find((x) => x.userId === ME);
        if (payload && m) { if ("display_name" in payload) m.name = payload.display_name; if ("email_alerts" in payload) m.emailAlerts = payload.email_alerts; save(); }
        return Promise.resolve({ data: { email_alerts: m?.emailAlerts !== false, display_name: m?.name }, error: null }).then(resolve);
      }
    };
    return chain;
  }
  const client = {
    from: (name) => (name === "profiles" ? profileQuery() : query(name)),
    async rpc(name, params) { try { return { data: await rpc(name, params), error: null }; } catch (error) { return { data: null, error: { message: error.message } }; } },
    storage: {
      from: () => ({
        async upload(path, file) { try { await putFile(path, file); return { data: { path }, error: null }; } catch (_) { return { data: null, error: { message: "No se pudo guardar el archivo." } }; } },
        async download(path) { const blob = await getFile(path); return blob ? { data: blob, error: null } : { data: null, error: { message: "Archivo no disponible." } }; },
        async createSignedUrl(path) { const blob = await getFile(path); return blob ? { data: { signedUrl: URL.createObjectURL(blob) }, error: null } : { data: null, error: { message: "Archivo no disponible." } }; }
      })
    },
    functions: { async invoke(name, { body } = {}) { try { return { data: await invoke(name, body), error: null }; } catch (error) { return { data: null, error: { context: { status: 400, json: async () => ({ error: error.message }) } } }; } } },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {}
  };

  // ------------------------------------------------------------ sesión
  function session() { if (memorySession) return memorySession; try { return JSON.parse(localStorage.getItem(SESSION)); } catch (_) { return null; } }
  const nameFromEmail = (email) => String(email).split("@")[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") || "Usuario";
  async function startSession(email, password, name) {
    const issue = base.validateEmail(email);
    if (issue) throw new CloudError("validation", issue);
    if (!String(password || "").length) throw new CloudError("auth", "Escribe tu contraseña.");
    // La contraseña no se guarda ni se compara.
    const user = { email: email.trim().toLowerCase(), name: String(name || "").trim() || nameFromEmail(email) };
    activateSession(user);
    return { user: state.user };
  }
  function activateSession(user) {
    seedWorkspace(user);
    memorySession = user;
    try { localStorage.setItem(SESSION, JSON.stringify(user)); } catch (_) { persistent = false; }
    const me = load().members.find((m) => m.userId === ME);
    if (me && (me.email !== user.email || me.name !== user.name)) {
      me.email = user.email; me.name = user.name;
      try { save(); } catch (_) { persistent = false; }
    }
    state.user = { id: ME, email: user.email };
  }

  // ------------------------------------------------------------ API con el mismo contrato que el servidor
  const metaFrom = (store) => {
    state.meta = {};
    Object.values(store.expedientes).filter((row) => !row.deletedAt).forEach((row) => { state.meta[row.clientId] = { rowId: `demo-${row.clientId}`, version: row.version, tenderId: row.tenderId || null, updatedAt: row.updatedAt }; });
  };
  function workspaceData() {
    const store = load();
    metaFrom(store);
    state.settingsVersion = store.settings.version;
    state.members = store.members.map(({ userId, role, name, email }) => ({ userId, role, name, email }));
    return {
      opportunities: Object.values(store.expedientes).filter((row) => !row.deletedAt).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map((row) => ({ ...clone(row.data), id: row.clientId })),
      settings: store.settings.data, notes: store.notes.filter((n) => !n.deletedAt), team: store.roles.filter((r) => !r.deletedAt), members: state.members
    };
  }
  const overrides = {
    demo: true,
    configured: true,
    client,
    can: (min) => ({ viewer: 1, editor: 2, admin: 3, owner: 4 }[state.role] || 0) >= ({ viewer: 1, editor: 2, admin: 3, owner: 4 }[min] || 9),
    async currentSession() {
      const s = session();
      if (!s) return null;
      seedWorkspace(s);
      state.user = { id: ME, email: s.email };
      return { user: state.user };
    },
    onAuthChange: () => () => {},
    signIn: (email, password) => startSession(email, password),
    async signUp({ name, email, password }) {
      if (!String(name || "").trim()) throw new CloudError("validation", "Escribe tu nombre.");
      const issue = base.validatePassword(password);
      if (issue) throw new CloudError("validation", issue);
      await startSession(email, password, name);
      return { needsConfirmation: false };
    },
    async signOut() { memorySession = null; try { localStorage.removeItem(SESSION); } catch (_) { /* nada */ } state.user = null; },
    async requestPasswordReset(email) { const issue = base.validateEmail(email); if (issue) throw new CloudError("validation", issue); },
    async resendConfirmation() {},
    async updatePassword(password) { const issue = base.validatePassword(password); if (issue) throw new CloudError("validation", issue); },
    async requestReauthentication() {},
    async loadWorkspaces() { state.workspaces = [{ id: WS, name: load().settings.data.workspaceName || "Mi empresa", role: load().members.find((m) => m.userId === ME)?.role || "owner" }]; return state.workspaces; },
    chooseWorkspace() { state.workspaceId = WS; state.role = state.workspaces[0].role; return state.workspaces[0]; },
    async createWorkspace() { throw new CloudError("server", "Este plan incluye un único espacio de empresa."); },
    async renameWorkspace(name) { load().settings.data.workspaceName = name; save(); },
    async loadWorkspaceData() { return workspaceData(); },
    async createExpediente(item, tenderId = null) {
      const store = load();
      if (store.expedientes[item.id] && !store.expedientes[item.id].deletedAt) throw new CloudError("duplicate", "Ya existe un registro con ese identificador.");
      if (tenderId && Object.values(store.expedientes).some((row) => row.tenderId === tenderId && !row.deletedAt)) throw new CloudError("duplicate", "Ya existe un expediente para esta licitación.");
      store.expedientes[item.id] = { clientId: item.id, data: clone(item), version: 1, tenderId, updatedAt: now() };
      log(`demo-${item.id}`, "expediente_creado", item.title);
      save();
      state.meta[item.id] = { rowId: `demo-${item.id}`, version: 1, tenderId, updatedAt: now() };
      return item;
    },
    async saveExpediente(item, { force = false } = {}) {
      const store = load();
      const row = store.expedientes[item.id];
      const meta = state.meta[item.id];
      if (!row || row.deletedAt || !meta) throw new CloudError("validation", "Este expediente ya no existe.");
      if (!force && row.version !== meta.version) {
        try { localStorage.setItem(`pliego-claro-borrador:${ME}:${WS}:${item.id}`, JSON.stringify({ item, baseVersion: meta.version, reason: "conflict", at: now() })); } catch (_) { /* sin espacio */ }
        throw new CloudError("conflict", "Otra pestaña o persona guardó antes un cambio en este expediente. Tu versión está en Inicio para reaplicarla o descartarla.");
      }
      const previous = row.data.history?.[0]?.label;
      row.data = clone(item); row.version += 1; row.updatedAt = now();
      if (item.history?.[0]?.label && item.history[0].label !== previous) log(`demo-${item.id}`, "expediente_editado", item.history[0].label);
      save();
      meta.version = row.version;
      try { localStorage.removeItem(`pliego-claro-borrador:${ME}:${WS}:${item.id}`); } catch (_) { /* nada */ }
      return item;
    },
    async fetchExpediente(clientId) {
      const row = load().expedientes[clientId];
      if (!row || row.deletedAt) return null;
      state.meta[clientId] = { ...(state.meta[clientId] || {}), rowId: `demo-${clientId}`, version: row.version, tenderId: row.tenderId };
      return { ...clone(row.data), id: clientId };
    },
    async trashExpediente(clientId, trashed = true) {
      const row = load().expedientes[clientId];
      if (!row) return;
      row.deletedAt = trashed ? now() : null; row.version += 1;
      log(`demo-${clientId}`, trashed ? "expediente_a_papelera" : "expediente_restaurado", row.data.title);
      save();
    },
    async listTrash() {
      const store = load();
      return {
        expedientes: Object.values(store.expedientes).filter((row) => row.deletedAt).map((row) => ({ id: row.clientId, client_id: row.clientId, title: row.data.title, deleted_at: row.deletedAt, version: row.version })),
        notes: store.notes.filter((n) => n.deletedAt).map((n) => ({ id: n.rowId, text: n.text, deleted_at: n.deletedAt })),
        documents: table("documents").filter((d) => d.deleted_at).map((d) => ({ id: d.id, name: d.name, deleted_at: d.deleted_at }))
      };
    },
    async restoreFromTrash(kind, rowId) {
      const store = load();
      if (kind === "expediente" && store.expedientes[rowId]) { store.expedientes[rowId].deletedAt = null; store.expedientes[rowId].version += 1; }
      if (kind === "nota") store.notes.filter((n) => n.rowId === rowId).forEach((n) => { n.deletedAt = null; });
      if (kind === "documento") table("documents").filter((d) => d.id === rowId).forEach((d) => { d.deleted_at = null; });
      save();
    },
    async saveSettings(data) {
      const store = load();
      if (store.settings.version !== state.settingsVersion) throw new CloudError("conflict", "Otra persona cambió los ajustes. Recarga antes de guardar.");
      store.settings = { data, version: store.settings.version + 1 }; save();
      state.settingsVersion = store.settings.version;
    },
    async addNote(note) { const saved = { ...note, rowId: uuid(), createdAt: now(), authorId: ME }; load().notes.unshift(saved); save(); return saved; },
    async trashNote(note) { load().notes.filter((n) => n.rowId === note.rowId).forEach((n) => { n.deletedAt = now(); }); save(); },
    async addRole(role) { const saved = { ...role, rowId: uuid() }; load().roles.push(saved); save(); return saved; },
    async trashRole(role) { load().roles.filter((r) => r.rowId === role.rowId).forEach((r) => { r.deletedAt = now(); }); save(); },
    async importBackup(payload, mode, applySettings) {
      const store = load();
      const mapping = {};
      let omitted = 0; let notesCount = 0; let roles = 0;
      const staged = [];
      for (const original of payload.opportunities || []) {
        const item = clone(original);
        const oldId = item.id;
        if (!String(item.title || "").trim() || !["GO", "REVISAR", "NO-GO"].includes(item.decision)) throw new CloudError("validation", "La copia contiene un expediente no válido. No se ha importado nada.");
        if (store.expedientes[oldId] && !store.expedientes[oldId].deletedAt) {
          if (mode === "skip") { mapping[oldId] = { id: oldId, imported: false }; omitted += 1; continue; }
          item.id = `${oldId}-copia-${uuid().slice(0, 8)}`;
          item.title = `${item.title} (copia importada)`;
          if (item.taskPlans) item.taskPlans = Object.fromEntries(Object.entries(item.taskPlans).map(([key, value]) => [key.replace(`-${oldId}`, `-${item.id}`), value]));
          delete item.official;
        }
        staged.push(item);
        mapping[oldId] = { id: item.id, imported: true };
      }
      staged.forEach((item) => { store.expedientes[item.id] = { clientId: item.id, data: item, version: 1, tenderId: null, updatedAt: now() }; });
      for (const note of payload.notes || []) {
        if (store.notes.some((n) => n.id === note.id && !n.deletedAt) && mode === "skip") continue;
        store.notes.unshift({ ...note, id: store.notes.some((n) => n.id === note.id) ? `${note.id}-copia-${uuid().slice(0, 8)}` : note.id, opportunityId: mapping[note.opportunityId]?.id || note.opportunityId || "", rowId: uuid(), createdAt: note.createdAt || now() });
        notesCount += 1;
      }
      for (const role of payload.team || []) { if (!store.roles.some((r) => r.id === role.id && !r.deletedAt)) { store.roles.push({ ...role, rowId: uuid() }); roles += 1; } }
      if (applySettings && payload.settings) store.settings = { data: { ...store.settings.data, ...payload.settings }, version: store.settings.version + 1 };
      save();
      return { expedientes: staged.length, expedientesOmitidos: omitted, notas: notesCount, roles, otrosOmitidos: 0, mapping };
    },
    async exportExtras() {
      const idToClient = Object.fromEntries(Object.values(load().expedientes).map((row) => [`demo-${row.clientId}`, row.clientId]));
      const mapExp = (rows) => rows.map(({ expediente_id, ...row }) => ({ ...row, expediente: idToClient[expediente_id] || null }));
      return {
        workspace: { id: WS, name: load().settings.data.workspaceName || "Mi empresa" },
        documents: mapExp(clone(table("documents"))), pages: clone(table("document_pages")), analyses: mapExp(clone(table("ai_analyses").filter((a) => a.status === "done"))),
        comments: mapExp(clone(table("comments"))).map(({ author_id, ...row }) => ({ ...row, author: memberName(author_id) })),
        alerts: mapExp(clone(table("alerts"))), activity: mapExp(clone(table("activity_log"))).map(({ actor_id, ...row }) => ({ ...row, actor: memberName(actor_id) })),
        members: load().members.map(({ name, email, role }) => ({ name, email, role }))
      };
    },
    subscribe() {},
    async reportClientError() {}
  };

  // ------------------------------------------------------------ datos iniciales del espacio
  function seedWorkspace(user) {
    if (load().seeded) return;
    if (!globalThis.PliegoDemoData?.workspace) throw new CloudError("config", "No se han cargado los ejemplos de la demo. Recarga la página.");
    db = clone(globalThis.PliegoDemoData.workspace);
    const me = db.members.find((member) => member.userId === ME);
    if (me) { me.name = user.name; me.email = user.email; }
    try { save(); } catch (_) { persistent = false; }
  }
  function enter() {
    activateSession({ name: "Demo", email: "demo@licitia.invalid" });
    const workspace = { id: WS, name: load().settings.data.workspaceName || "Mi empresa", role: load().members.find((member) => member.userId === ME)?.role || "owner" };
    state.workspaces = [workspace]; state.workspaceId = WS; state.role = workspace.role;
    return { ...workspaceData(), workspace };
  }

  globalThis.PliegoCloud = Object.freeze({ ...base, ...overrides });
  globalThis.PliegoDemo = Object.freeze({
    active: true, analyzePages, WS, ME, enter, get persistent() { return persistent; },
    reset() { try { localStorage.removeItem(STORE); localStorage.removeItem(SESSION); indexedDB.deleteDatabase("pliego-claro-demo-archivos"); } catch (_) { /* nada */ } }
  });
})();
