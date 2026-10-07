/* Capa de datos con cuentas: Supabase (Auth + Postgres con RLS + Storage).
   La autorización la decide el servidor; aquí solo se traduce el resultado a la interfaz. */
(() => {
  const cfg = globalThis.PLIEGO_CONFIG || {};
  const configured = Boolean(cfg.supabaseUrl && cfg.supabaseKey && globalThis.supabase?.createClient);
  const client = configured ? globalThis.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" }
  }) : null;

  const state = { user: null, workspaceId: "", role: "viewer", workspaces: [], meta: {}, settingsVersion: 1, members: [] };
  const DRAFT_PREFIX = "pliego-claro-borrador:";

  class CloudError extends Error {
    constructor(kind, message, cause) { super(message); this.kind = kind; this.cause = cause; }
  }

  // Traduce errores de red, sesión, permisos y conflictos a mensajes accionables.
  function classify(error, fallback = "No se pudo completar la operación.") {
    if (!error) return new CloudError("unknown", fallback);
    if (error instanceof CloudError) return error;
    const code = String(error.code || "");
    const message = String(error.message || error.error_description || "");
    const status = Number(error.status || 0);
    if (error.name === "TypeError" || /Failed to fetch|NetworkError|network|Load failed/i.test(message)) return new CloudError("network", "Sin conexión con el servidor. No se ha guardado; tu cambio queda como borrador en este navegador.", error);
    if (status === 401 || code === "PGRST301" || /JWT|session|token.*expired|not authenticated/i.test(message)) return new CloudError("session", "Tu sesión ha caducado. Vuelve a entrar: tu cambio queda como borrador en este navegador, todavía no está en el servidor.", error);
    if (code === "40001" || /conflicto de versión/i.test(message)) return new CloudError("conflict", "Otra pestaña o persona guardó antes un cambio en este expediente.", error);
    if (code === "42501" || /row-level security|permission denied|Sin permiso|Solo /i.test(message)) return new CloudError("permission", message && !/row-level security|permission denied/i.test(message) ? message : "No tienes permiso para esta acción en este espacio.", error);
    if (code === "23505") return new CloudError("duplicate", "Ya existe un registro con ese identificador.", error);
    if (code === "23514" || code === "22P02") return new CloudError("validation", "El servidor ha rechazado datos no válidos. No se ha guardado nada.", error);
    return new CloudError("unknown", message || fallback, error);
  }

  async function run(promise, fallback) {
    let result;
    try { result = await promise; } catch (error) { throw classify(error, fallback); }
    if (result?.error) throw classify(result.error, fallback);
    return result?.data;
  }

  function requireClient() {
    if (!client) throw new CloudError("config", "La aplicación no está conectada a su servidor (falta config.js).");
    return client;
  }

  // ---------------------------------------------------------------- sesión
  async function currentSession() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    state.user = data.session?.user || null;
    return data.session;
  }
  function onAuthChange(handler) {
    if (!client) return () => {};
    const { data } = client.auth.onAuthStateChange((event, session) => { state.user = session?.user || null; handler(event, session); });
    return () => data.subscription.unsubscribe();
  }
  function redirectUrl() { return cfg.siteUrl || `${location.origin}${location.pathname}`; }
  function validatePassword(password) {
    const value = String(password || "");
    if (value.length < 10) return "La contraseña debe tener al menos 10 caracteres.";
    if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) return "Usa letras y números en la contraseña.";
    return "";
  }
  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || "").trim()) ? "" : "Escribe un correo válido.";
  }
  async function signUp({ name, company, email, password }) {
    const issue = (!String(name || "").trim() && "Escribe tu nombre.") || validateEmail(email) || validatePassword(password);
    if (issue) throw new CloudError("validation", issue);
    const data = await run(requireClient().auth.signUp({ email: email.trim().toLowerCase(), password, options: { emailRedirectTo: redirectUrl(), data: { name: name.trim(), company: String(company || "").trim() } } }), "No se pudo crear la cuenta.");
    // Con confirmación de correo activa, un correo ya registrado devuelve un usuario sin identidades.
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new CloudError("duplicate", "Ese correo ya tiene una cuenta. Entra o recupera la contraseña.");
    }
    return { needsConfirmation: !data?.session };
  }
  async function signIn(email, password) {
    if (validateEmail(email)) throw new CloudError("validation", validateEmail(email));
    try {
      return await run(requireClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password }), "No se pudo entrar.");
    } catch (error) {
      if (/Invalid login credentials/i.test(error.message)) throw new CloudError("auth", "Correo o contraseña incorrectos.");
      if (/Email not confirmed/i.test(error.message)) throw new CloudError("auth", "Confirma tu correo con el enlace que te enviamos antes de entrar.");
      if (/rate limit|too many/i.test(error.message)) throw new CloudError("auth", "Demasiados intentos. Espera unos minutos antes de volver a probar.");
      throw error;
    }
  }
  async function signOut() {
    if (!client) return;
    await client.auth.signOut({ scope: "local" });
    state.user = null; state.workspaceId = ""; state.meta = {};
  }
  async function requestPasswordReset(email) {
    if (validateEmail(email)) throw new CloudError("validation", validateEmail(email));
    await run(requireClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: redirectUrl() }), "No se pudo enviar el enlace.");
  }
  async function resendConfirmation(email) {
    await run(requireClient().auth.resend({ type: "signup", email: email.trim().toLowerCase(), options: { emailRedirectTo: redirectUrl() } }), "No se pudo reenviar el correo.");
  }
  async function updatePassword(password) {
    const issue = validatePassword(password);
    if (issue) throw new CloudError("validation", issue);
    await run(requireClient().auth.updateUser({ password }), "No se pudo cambiar la contraseña.");
  }

  // ---------------------------------------------------------------- espacios
  async function loadWorkspaces() {
    const rows = await run(requireClient().from("workspace_members").select("role, workspace:workspaces(id, name, created_at)").eq("user_id", state.user.id), "No se pudieron cargar tus espacios.");
    state.workspaces = (rows || []).filter((row) => row.workspace).map((row) => ({ id: row.workspace.id, name: row.workspace.name, role: row.role }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    return state.workspaces;
  }
  function chooseWorkspace(preferred) {
    const remembered = preferred || safeGet(`pliego-claro-espacio:${state.user?.id}`);
    const found = state.workspaces.find((ws) => ws.id === remembered) || state.workspaces[0];
    if (!found) throw new CloudError("permission", "Tu cuenta no pertenece a ningún espacio.");
    state.workspaceId = found.id;
    state.role = found.role;
    safeSet(`pliego-claro-espacio:${state.user.id}`, found.id);
    return found;
  }
  async function createWorkspace(name) {
    if (!String(name || "").trim()) throw new CloudError("validation", "Escribe un nombre para el espacio.");
    return run(requireClient().rpc("create_workspace", { p_name: name.trim() }), "No se pudo crear el espacio.");
  }
  async function renameWorkspace(name) {
    await run(requireClient().from("workspaces").update({ name: name.trim() }).eq("id", state.workspaceId), "No se pudo renombrar el espacio.");
  }
  const can = (min) => ({ viewer: 1, editor: 2, admin: 3, owner: 4 }[state.role] || 0) >= ({ viewer: 1, editor: 2, admin: 3, owner: 4 }[min] || 9);

  async function loadWorkspaceData() {
    const db = requireClient();
    const ws = state.workspaceId;
    const [expedientes, settings, notes, roles, members] = await Promise.all([
      run(db.from("expedientes").select("id, client_id, tender_id, data, version, updated_at, updated_by, created_by").eq("workspace_id", ws).is("deleted_at", null).order("updated_at", { ascending: false }), "No se pudieron cargar los expedientes."),
      run(db.from("workspace_settings").select("data, version").eq("workspace_id", ws).maybeSingle(), "No se pudieron cargar los ajustes."),
      run(db.from("notes").select("id, client_id, expediente_client_id, kind, text, created_at, author_id").eq("workspace_id", ws).is("deleted_at", null).order("created_at", { ascending: false }), "No se pudieron cargar las notas."),
      run(db.from("team_roles").select("id, client_id, name, role, note, user_id").eq("workspace_id", ws).is("deleted_at", null).order("created_at"), "No se pudo cargar el equipo."),
      run(db.from("workspace_members").select("user_id, role, created_at, profile:profiles(display_name, email)").eq("workspace_id", ws), "No se pudieron cargar los miembros.")
    ]);
    state.meta = {};
    (expedientes || []).forEach((row) => { state.meta[row.client_id] = { rowId: row.id, version: row.version, tenderId: row.tender_id, updatedAt: row.updated_at, updatedBy: row.updated_by }; });
    state.settingsVersion = settings?.version || 1;
    state.members = (members || []).map((row) => ({ userId: row.user_id, role: row.role, name: row.profile?.display_name || "", email: row.profile?.email || "" }));
    return {
      opportunities: (expedientes || []).map((row) => ({ ...row.data, id: row.client_id })),
      settings: settings?.data || {},
      notes: (notes || []).map((row) => ({ id: row.client_id, rowId: row.id, kind: row.kind, text: row.text, opportunityId: row.expediente_client_id, createdAt: row.created_at, authorId: row.author_id })),
      team: (roles || []).map((row) => ({ id: row.client_id, rowId: row.id, name: row.name, role: row.role, note: row.note, userId: row.user_id })),
      members: state.members
    };
  }

  // ---------------------------------------------------------------- expedientes
  const stripLocal = (item) => { const copy = structuredClone(item); delete copy.id; return { ...copy, id: item.id }; };
  async function createExpediente(item, tenderId = null) {
    const row = await run(requireClient().from("expedientes").insert({ workspace_id: state.workspaceId, client_id: item.id, tender_id: tenderId, data: stripLocal(item) }).select("id, version, tender_id, updated_at").single(), "No se pudo crear el expediente.");
    state.meta[item.id] = { rowId: row.id, version: row.version, tenderId: row.tender_id, updatedAt: row.updated_at };
    clearDraft(item.id);
    return item;
  }
  async function saveExpediente(item, { force = false } = {}) {
    const meta = state.meta[item.id];
    if (!meta) throw new CloudError("validation", "Este expediente no está en el servidor.");
    const db = requireClient();
    let base = meta.version;
    if (force) {
      const latest = await run(db.from("expedientes").select("version").eq("id", meta.rowId).single(), "No se pudo leer la versión actual.");
      base = latest.version;
    }
    let rows;
    try {
      rows = await run(db.from("expedientes").update({ data: stripLocal(item), version: base + 1 }).eq("id", meta.rowId).eq("version", base).select("version, updated_at"), "No se pudo guardar el expediente.");
    } catch (error) {
      if (error.kind !== "conflict") saveDraft(item, base, error.kind);
      throw error;
    }
    if (!rows || rows.length === 0) {
      saveDraft(item, base, "conflict");
      throw new CloudError("conflict", "Otra pestaña o persona guardó antes un cambio en este expediente. Tu versión se conserva como borrador.");
    }
    meta.version = rows[0].version;
    meta.updatedAt = rows[0].updated_at;
    clearDraft(item.id);
    return item;
  }
  async function fetchExpediente(clientId) {
    const row = await run(requireClient().from("expedientes").select("id, data, version, updated_at, tender_id").eq("workspace_id", state.workspaceId).eq("client_id", clientId).maybeSingle(), "No se pudo leer el expediente.");
    if (!row) return null;
    state.meta[clientId] = { ...(state.meta[clientId] || {}), rowId: row.id, version: row.version, updatedAt: row.updated_at, tenderId: row.tender_id };
    return { ...row.data, id: clientId };
  }
  async function trashExpediente(clientId, trashed = true) {
    const meta = state.meta[clientId];
    if (!meta) return;
    const rows = await run(requireClient().from("expedientes").update({ deleted_at: trashed ? new Date().toISOString() : null, version: meta.version + 1 }).eq("id", meta.rowId).eq("version", meta.version).select("version"), "No se pudo mover a la papelera.");
    if (!rows?.length) throw new CloudError("conflict", "El expediente cambió mientras tanto. Recarga y vuelve a intentarlo.");
    meta.version = rows[0].version;
  }
  async function listTrash() {
    const db = requireClient();
    const [expedientes, notes, documents] = await Promise.all([
      run(db.from("expedientes").select("id, client_id, data->>title, deleted_at, version").eq("workspace_id", state.workspaceId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }), "No se pudo leer la papelera."),
      run(db.from("notes").select("id, text, deleted_at").eq("workspace_id", state.workspaceId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(50), "No se pudo leer la papelera."),
      run(db.from("documents").select("id, name, deleted_at").eq("workspace_id", state.workspaceId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(50), "No se pudo leer la papelera.")
    ]);
    return { expedientes: expedientes || [], notes: notes || [], documents: documents || [] };
  }
  async function restoreFromTrash(kind, rowId, version) {
    const db = requireClient();
    if (kind === "expediente") {
      const rows = await run(db.from("expedientes").update({ deleted_at: null, version: version + 1 }).eq("id", rowId).eq("version", version).select("id"), "No se pudo restaurar.");
      if (!rows?.length) throw new CloudError("conflict", "No se pudo restaurar: el expediente cambió. Recarga la papelera.");
      return;
    }
    const table = kind === "nota" ? "notes" : "documents";
    await run(db.from(table).update({ deleted_at: null }).eq("id", rowId).eq("workspace_id", state.workspaceId), "No se pudo restaurar.");
  }

  // ---------------------------------------------------------------- ajustes, notas y roles
  async function saveSettings(data) {
    const rows = await run(requireClient().from("workspace_settings").update({ data, version: state.settingsVersion + 1 }).eq("workspace_id", state.workspaceId).eq("version", state.settingsVersion).select("version"), "No se pudieron guardar los ajustes.");
    if (!rows?.length) throw new CloudError("conflict", "Otra persona cambió los ajustes. Recarga para ver la última versión antes de guardar.");
    state.settingsVersion = rows[0].version;
  }
  async function addNote(note) {
    const row = await run(requireClient().from("notes").insert({ workspace_id: state.workspaceId, client_id: note.id, expediente_client_id: note.opportunityId || "", kind: note.kind, text: note.text }).select("id, created_at").single(), "No se pudo guardar la nota.");
    return { ...note, rowId: row.id, createdAt: row.created_at, authorId: state.user.id };
  }
  async function trashNote(note) {
    await run(requireClient().from("notes").update({ deleted_at: new Date().toISOString() }).eq("id", note.rowId).eq("workspace_id", state.workspaceId), "No se pudo eliminar la nota.");
  }
  async function addRole(role) {
    const row = await run(requireClient().from("team_roles").insert({ workspace_id: state.workspaceId, client_id: role.id, name: role.name, role: role.role, note: role.note || "", user_id: role.userId || null }).select("id").single(), "No se pudo añadir el rol.");
    return { ...role, rowId: row.id };
  }
  async function trashRole(role) {
    await run(requireClient().from("team_roles").update({ deleted_at: new Date().toISOString() }).eq("id", role.rowId).eq("workspace_id", state.workspaceId), "No se pudo quitar el rol.");
  }

  // ---------------------------------------------------------------- importación y exportación
  async function importBackup(payload, mode, applySettings) {
    return run(requireClient().rpc("import_workspace_backup", { p_workspace: state.workspaceId, p_payload: { ...payload, applySettings: Boolean(applySettings) }, p_mode: mode }), "No se pudo importar la copia. No se ha cambiado nada.");
  }
  async function exportExtras() {
    const db = requireClient();
    const ws = state.workspaceId;
    const [documents, comments, alerts, activity] = await Promise.all([
      run(db.from("documents").select("id, expediente_id, name, kind, version_label, origin, source_url, sha256, size_bytes, mime_type, supersedes_id, extraction_status, page_count, created_at, deleted_at").eq("workspace_id", ws), "No se pudieron exportar los documentos."),
      run(db.from("comments").select("expediente_id, author_id, body, created_at, deleted_at").eq("workspace_id", ws), "No se pudieron exportar los comentarios."),
      run(db.from("alerts").select("expediente_id, kind, title, detail, changes, created_at, read_at").eq("workspace_id", ws), "No se pudieron exportar los avisos."),
      run(db.from("activity_log").select("expediente_id, actor_id, action, detail, created_at").eq("workspace_id", ws).order("id", { ascending: false }).limit(5000), "No se pudo exportar la actividad.")
    ]);
    const idToClient = Object.fromEntries(Object.entries(state.meta).map(([clientId, meta]) => [meta.rowId, clientId]));
    const mapExp = (rows) => (rows || []).map((row) => ({ ...row, expediente: idToClient[row.expediente_id] || row.expediente_id }));
    return { workspace: { id: ws, name: state.workspaces.find((entry) => entry.id === ws)?.name || "" }, documents: mapExp(documents), comments: mapExp(comments), alerts: mapExp(alerts), activity: mapExp(activity), members: state.members.map(({ name, email, role }) => ({ name, email, role })) };
  }

  // ---------------------------------------------------------------- borradores locales
  function safeGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function safeSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } }
  function draftKey(clientId) { return `${DRAFT_PREFIX}${state.user?.id || "anon"}:${state.workspaceId}:${clientId}`; }
  function saveDraft(item, baseVersion, reason) {
    return safeSet(draftKey(item.id), JSON.stringify({ item, baseVersion, reason, at: new Date().toISOString() }));
  }
  function clearDraft(clientId) { try { localStorage.removeItem(draftKey(clientId)); } catch (_) { /* sin almacenamiento local */ } }
  function drafts() {
    const prefix = `${DRAFT_PREFIX}${state.user?.id || "anon"}:${state.workspaceId}:`;
    const found = [];
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        try { found.push(JSON.parse(localStorage.getItem(key))); } catch (_) { localStorage.removeItem(key); }
      }
    } catch (_) { /* almacenamiento bloqueado */ }
    return found.filter((entry) => entry?.item?.id);
  }

  // ---------------------------------------------------------------- tiempo real (otra pestaña o persona)
  let channel = null;
  function subscribe(onChange) {
    if (!client || !state.workspaceId) return;
    if (channel) client.removeChannel(channel);
    channel = client.channel(`ws-${state.workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expedientes", filter: `workspace_id=eq.${state.workspaceId}` }, (payload) => onChange("expedientes", payload))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts", filter: `workspace_id=eq.${state.workspaceId}` }, (payload) => onChange("alerts", payload))
      .subscribe();
  }
  function remoteVersionIsNewer(clientId, version) {
    const meta = state.meta[clientId];
    return !meta || version > meta.version;
  }

  async function reportClientError(message, context = "") {
    if (!client || !state.user) return;
    try { await client.from("client_errors").insert({ user_id: state.user.id, message: String(message).slice(0, 500), context: String(context).slice(0, 500) }); } catch (_) { /* no bloquear */ }
  }

  globalThis.PliegoCloud = Object.freeze({
    configured, client, state, CloudError, classify, run, can,
    currentSession, onAuthChange, signUp, signIn, signOut, requestPasswordReset, resendConfirmation, updatePassword, validatePassword, validateEmail,
    loadWorkspaces, chooseWorkspace, createWorkspace, renameWorkspace, loadWorkspaceData,
    createExpediente, saveExpediente, fetchExpediente, trashExpediente, listTrash, restoreFromTrash,
    saveSettings, addNote, trashNote, addRole, trashRole, importBackup, exportExtras,
    drafts, clearDraft, subscribe, remoteVersionIsNewer, reportClientError, safeGet, safeSet
  });
})();
