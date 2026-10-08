/* Modo demostración: solo se activa si la web NO está conectada a su servidor y la persona lo pide.
   Guarda los datos únicamente en este navegador y usa una muestra fija de licitaciones reales de PLACSP.
   No simula cuentas, documentos, IA, avisos ni equipo: esas funciones indican que requieren el servidor. */
(() => {
  const base = globalThis.PliegoCloud;
  const FLAG = "pliego-claro-demo";
  const STORE = "pliego-claro-demo-v1";
  const DATASET = "demo-licitaciones.json";
  const NEEDS_SERVER = "No disponible en la demostración: requiere el servidor (cuentas, documentos, IA, avisos y equipo).";
  const params = new URLSearchParams(location.search);
  const flagged = (() => { try { return localStorage.getItem(FLAG) === "1"; } catch (_) { return false; } })();
  const active = !base.configured && (flagged || params.has("demo"));

  function enter() { try { localStorage.setItem(FLAG, "1"); } catch (_) { /* sin almacenamiento */ } location.replace(`${location.pathname}#hoy`); location.reload(); }
  function leave() { try { localStorage.removeItem(FLAG); } catch (_) { /* sin almacenamiento */ } location.replace(location.pathname); }

  if (!active) { globalThis.PliegoDemo = Object.freeze({ active: false, enter, leave }); return; }

  const { CloudError, state } = base;
  const fail = (message = NEEDS_SERVER) => new CloudError("server", message);

  // ------------------------------------------------------------ almacén local con versiones
  function read() {
    try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch (_) { return null; }
  }
  function load() {
    return read() || { expedientes: {}, settings: { data: { workspaceName: "Espacio de demostración" }, version: 1 }, notes: [], roles: [], seeded: false };
  }
  function write(store) {
    try { localStorage.setItem(STORE, JSON.stringify(store)); }
    catch (_) { throw new CloudError("network", "No se pudo guardar en este navegador (almacenamiento lleno o bloqueado). No se ha guardado nada."); }
  }

  // ------------------------------------------------------------ muestra de licitaciones reales
  let datasetPromise = null;
  const dataset = () => (datasetPromise ||= fetch(DATASET).then((r) => { if (!r.ok) throw new Error(); return r.json(); }).catch(() => { datasetPromise = null; throw fail("No se pudo cargar la muestra de licitaciones."); }));
  const madrid = (iso) => iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) : null;
  async function searchTenders(p) {
    const { tenders } = await dataset();
    const q = String(p.p_q || "").trim().toLocaleLowerCase("es");
    const words = q.split(/\s+/).filter(Boolean);
    const cpvs = String(p.p_cpv || "").replace(/[^0-9,]/g, "").split(",").filter(Boolean);
    const place = String(p.p_province || "").trim().toLocaleLowerCase("es");
    const status = p.p_status || "vigentes";
    const now = Date.now();
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
      if (status === "vigentes") return t.status_code === "PUB" && t.deadline_at && new Date(t.deadline_at).getTime() >= now;
      return status === "todas" || t.status_code === status;
    }).sort((a, b) => (a.deadline_at ? Date.parse(a.deadline_at) : Infinity) - (b.deadline_at ? Date.parse(b.deadline_at) : Infinity) || a.id.localeCompare(b.id));
    const limit = Math.min(Math.max(p.p_limit || 30, 1), 100);
    return rows.slice(p.p_offset || 0, (p.p_offset || 0) + limit);
  }
  async function tenderStats() {
    const { meta, tenders } = await dataset();
    const now = Date.now();
    return { total: tenders.length, vigentes: tenders.filter((t) => t.status_code === "PUB" && t.deadline_at && Date.parse(t.deadline_at) >= now).length, lastRun: { status: "ok", finished_at: meta.generadoEl }, lastOk: meta.generadoEl, demo: true };
  }

  // ------------------------------------------------------------ cliente de solo lectura para las funciones de servidor
  function fakeQuery() {
    const query = { writes: false, single: false };
    const chain = new Proxy(query, {
      get(target, prop) {
        if (prop === "then") return (resolve, reject) => Promise.resolve(target.writes ? { data: null, error: { message: NEEDS_SERVER } } : { data: target.single ? null : [], error: null, count: 0 }).then(resolve, reject);
        if (["insert", "update", "upsert", "delete"].includes(prop)) return () => { target.writes = true; return chain; };
        if (prop === "single" || prop === "maybeSingle") return () => { target.single = true; return chain; };
        return () => chain;
      }
    });
    return chain;
  }
  const fakeClient = {
    from: () => fakeQuery(),
    async rpc(name, params) {
      try {
        if (name === "search_tenders") return { data: await searchTenders(params || {}), error: null };
        if (name === "tender_stats") return { data: await tenderStats(), error: null };
        if (name === "mark_alert_read") return { data: null, error: null };
        if (name === "ai_usage_summary") return { data: null, error: null };
      } catch (error) { return { data: null, error }; }
      return { data: null, error: { message: NEEDS_SERVER } };
    },
    storage: { from: () => ({ upload: async () => ({ error: { message: NEEDS_SERVER } }), download: async () => ({ error: { message: NEEDS_SERVER } }), createSignedUrl: async () => ({ data: null, error: { message: NEEDS_SERVER } }) }) },
    functions: { invoke: async () => ({ data: null, error: { context: { status: 503, json: async () => ({ error: NEEDS_SERVER }) } } }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {}
  };

  // ------------------------------------------------------------ API equivalente a la del servidor
  const user = { id: "demo", email: "demostracion@pliego-claro.local" };
  const member = { userId: "demo", role: "owner", name: "Persona de demostración", email: user.email };
  const metaFrom = (store) => {
    state.meta = {};
    Object.entries(store.expedientes).filter(([, row]) => !row.deletedAt).forEach(([clientId, row]) => { state.meta[clientId] = { rowId: `demo-${clientId}`, version: row.version, tenderId: row.tenderId || null, updatedAt: row.updatedAt }; });
  };
  const nowIso = () => new Date().toISOString();

  const overrides = {
    demo: true,
    configured: true,
    client: fakeClient,
    can: () => true,
    async currentSession() { state.user = user; return { user }; },
    onAuthChange: () => () => {},
    async signOut() { leave(); },
    async signUp() { throw fail(); }, async signIn() { throw fail(); }, async requestPasswordReset() { throw fail(); },
    async resendConfirmation() { throw fail(); }, async updatePassword() { throw fail(); }, async requestReauthentication() { throw fail(); },
    async loadWorkspaces() { state.workspaces = [{ id: "demo", name: "Espacio de demostración", role: "owner" }]; return state.workspaces; },
    chooseWorkspace() { state.workspaceId = "demo"; state.role = "owner"; return state.workspaces[0]; },
    async createWorkspace() { throw fail(); }, async renameWorkspace() { throw fail(); },
    async loadWorkspaceData() {
      const store = load();
      metaFrom(store);
      state.settingsVersion = store.settings.version;
      state.members = [member];
      return {
        opportunities: Object.entries(store.expedientes).filter(([, row]) => !row.deletedAt).sort(([, a], [, b]) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(([clientId, row]) => ({ ...row.data, id: clientId })),
        settings: store.settings.data, notes: store.notes.filter((n) => !n.deletedAt), team: store.roles.filter((r) => !r.deletedAt), members: [member]
      };
    },
    async createExpediente(item, tenderId = null) {
      const store = load();
      if (store.expedientes[item.id] && !store.expedientes[item.id].deletedAt) throw new CloudError("duplicate", "Ya existe un registro con ese identificador.");
      if (tenderId && Object.values(store.expedientes).some((row) => row.tenderId === tenderId && !row.deletedAt)) throw new CloudError("duplicate", "Ya existe un expediente para esta licitación.");
      store.expedientes[item.id] = { data: structuredClone(item), version: 1, tenderId, updatedAt: nowIso() };
      write(store);
      state.meta[item.id] = { rowId: `demo-${item.id}`, version: 1, tenderId, updatedAt: nowIso() };
      return item;
    },
    async saveExpediente(item, { force = false } = {}) {
      const store = load();
      const row = store.expedientes[item.id];
      const meta = state.meta[item.id];
      if (!row || row.deletedAt || !meta) throw new CloudError("validation", "Este expediente ya no existe.");
      // Misma regla que el servidor: si otra pestaña guardó antes, conflicto recuperable.
      if (!force && row.version !== meta.version) {
        try { localStorage.setItem(`pliego-claro-borrador:demo:demo:${item.id}`, JSON.stringify({ item, baseVersion: meta.version, reason: "conflict", at: nowIso() })); } catch (_) { /* sin espacio */ }
        throw new CloudError("conflict", "Otra pestaña guardó antes un cambio en este expediente. Tu versión no se ha perdido: está en Inicio para reaplicarla o descartarla.");
      }
      try { localStorage.removeItem(`pliego-claro-borrador:demo:demo:${item.id}`); } catch (_) { /* nada */ }
      row.data = structuredClone(item); row.version += 1; row.updatedAt = nowIso();
      write(store);
      meta.version = row.version;
      return item;
    },
    async fetchExpediente(clientId) {
      const row = load().expedientes[clientId];
      if (!row || row.deletedAt) return null;
      state.meta[clientId] = { ...(state.meta[clientId] || {}), rowId: `demo-${clientId}`, version: row.version, tenderId: row.tenderId };
      return { ...row.data, id: clientId };
    },
    async trashExpediente(clientId, trashed = true) {
      const store = load();
      if (!store.expedientes[clientId]) return;
      store.expedientes[clientId].deletedAt = trashed ? nowIso() : null;
      store.expedientes[clientId].version += 1;
      write(store);
    },
    async listTrash() {
      const store = load();
      return {
        expedientes: Object.entries(store.expedientes).filter(([, row]) => row.deletedAt).map(([clientId, row]) => ({ id: clientId, client_id: clientId, title: row.data.title, deleted_at: row.deletedAt, version: row.version })),
        notes: store.notes.filter((n) => n.deletedAt).map((n) => ({ id: n.rowId, text: n.text, deleted_at: n.deletedAt })),
        documents: []
      };
    },
    async restoreFromTrash(kind, rowId) {
      const store = load();
      if (kind === "expediente" && store.expedientes[rowId]) { store.expedientes[rowId].deletedAt = null; store.expedientes[rowId].version += 1; }
      if (kind === "nota") store.notes.filter((n) => n.rowId === rowId).forEach((n) => { n.deletedAt = null; });
      write(store);
    },
    async saveSettings(data) {
      const store = load();
      if (store.settings.version !== state.settingsVersion) throw new CloudError("conflict", "Otra pestaña cambió los ajustes. Recarga antes de guardar.");
      store.settings = { data, version: store.settings.version + 1 };
      write(store);
      state.settingsVersion = store.settings.version;
    },
    async addNote(note) { const store = load(); const saved = { ...note, rowId: crypto.randomUUID(), createdAt: nowIso(), authorId: "demo" }; store.notes.unshift(saved); write(store); return saved; },
    async trashNote(note) { const store = load(); store.notes.filter((n) => n.rowId === note.rowId).forEach((n) => { n.deletedAt = nowIso(); }); write(store); },
    async addRole(role) { const store = load(); const saved = { ...role, rowId: crypto.randomUUID() }; store.roles.push(saved); write(store); return saved; },
    async trashRole(role) { const store = load(); store.roles.filter((r) => r.rowId === role.rowId).forEach((r) => { r.deletedAt = nowIso(); }); write(store); },
    async importBackup(payload, mode, applySettings) {
      // Misma semántica que la función SQL: todo o nada, omitir o copiar duplicados con remapeo.
      const store = load();
      const mapping = {};
      let expedientes = 0; let omitted = 0; let notesCount = 0; let roles = 0;
      for (const original of payload.opportunities || []) {
        const item = structuredClone(original);
        const oldId = item.id;
        if (!String(item.title || "").trim() || !["GO", "REVISAR", "NO-GO"].includes(item.decision)) throw new CloudError("validation", "La copia contiene un expediente no válido. No se ha importado nada.");
        if (store.expedientes[oldId] && !store.expedientes[oldId].deletedAt) {
          if (mode === "skip") { mapping[oldId] = { id: oldId, imported: false }; omitted += 1; continue; }
          item.id = `${oldId}-copia-${crypto.randomUUID().slice(0, 8)}`;
          item.title = `${item.title} (copia importada)`;
          if (item.taskPlans) item.taskPlans = Object.fromEntries(Object.entries(item.taskPlans).map(([key, value]) => [key.replace(`-${oldId}`, `-${item.id}`), value]));
          delete item.official;
        }
        store.expedientes[item.id] = { data: item, version: 1, tenderId: null, updatedAt: nowIso() };
        mapping[oldId] = { id: item.id, imported: true };
        expedientes += 1;
      }
      for (const note of payload.notes || []) {
        if (store.notes.some((n) => n.id === note.id && !n.deletedAt) && mode === "skip") continue;
        store.notes.unshift({ ...note, id: store.notes.some((n) => n.id === note.id) ? `${note.id}-copia-${crypto.randomUUID().slice(0, 8)}` : note.id, opportunityId: mapping[note.opportunityId]?.id || note.opportunityId || "", rowId: crypto.randomUUID(), createdAt: note.createdAt || nowIso() });
        notesCount += 1;
      }
      for (const role of payload.team || []) {
        if (store.roles.some((r) => r.id === role.id && !r.deletedAt)) continue;
        store.roles.push({ ...role, rowId: crypto.randomUUID() }); roles += 1;
      }
      if (applySettings && payload.settings) store.settings = { data: { ...store.settings.data, ...payload.settings }, version: store.settings.version + 1 };
      write(store);
      return { expedientes, expedientesOmitidos: omitted, notas: notesCount, roles, otrosOmitidos: 0, mapping };
    },
    async exportExtras() { return { workspace: { id: "demo", name: "Espacio de demostración" }, documents: [], pages: [], analyses: [], comments: [], alerts: [], activity: [], members: [{ name: member.name, email: member.email, role: "owner" }] }; },
    subscribe() {},
    async reportClientError() {}
  };

  globalThis.PliegoCloud = Object.freeze({ ...base, ...overrides });
  globalThis.PliegoDemo = Object.freeze({ active: true, enter, leave, NEEDS_SERVER, dataset });
})();
