// Versión con cuentas: los datos se guardan por espacio en el servidor (cloud.js).
// Las copias JSON de la beta local (formato pliego-claro-mvp v1/v2) se importan desde Ajustes.

const defaultTeam = [
  { id: "role-owner", name: "Responsable del proyecto", role: "Decisión y coordinación", note: "Rol local · sin invitaciones externas" }
];

const defaultSettings = {
  workspaceName: "Mi empresa (ejemplo)",
  timezone: "Europe/Madrid",
  sectors: "",
  locations: "",
  technicalSolvency: "",
  economicSolvency: "",
  collaborationNotes: "",
  documentsAvailable: "",
  includeProximity: true,
  strictLCSP: true,
  defaultDecision: "REVISAR",
  deadlineReminders: true,
  reminderDays: "7, 2, 1",
  changeReminders: true,
  emailChangeAlerts: false,
  density: "compact",
  showExampleLabels: true
};

const seedOpportunities = [
  {
    id: "ejemplo-digitalizacion",
    title: "Digitalización y catalogación de un archivo municipal",
    organization: "Administración pública · ejemplo editable",
    amount: "80.000 € aprox.",
    deadline: "Cierre en 12 días",
    deadlineDate: "2026-10-12",
    sector: "Servicios digitales",
    territory: { city: "Madrid", province: "Madrid", mode: "Presencial + remoto", mapX: 232, mapY: 145, note: "Ubicación de prueba" },
    decision: "REVISAR",
    fit: "Por comprobar",
    source: "https://contrataciondelestado.es/",
    sourceLabel: "Plataforma oficial",
    summary: "Ejemplo neutro para comprobar si una empresa puede traducir requisitos de solvencia, medios y colaboración en una decisión explicable.",
    why: ["El objeto se puede entender de un vistazo.", "Permite separar solvencia económica y técnica.", "Sirve para probar la relación entre requisito y evidencia."],
    nextStep: "Comprobar qué trabajos similares puede demostrar la empresa y asociar cada uno a su documento.",
    nextDate: "Primera revisión · 25 min",
    nextStepDone: false,
    requirements: [
      { text: "Experiencia en trabajos similares", source: "Solvencia técnica · por comprobar", status: "pending" },
      { text: "Volumen anual de negocio suficiente", source: "Solvencia económica · por comprobar", status: "pending" },
      { text: "Medios personales y materiales adecuados", source: "Medios de ejecución · por comprobar", status: "unknown" },
      { text: "Condiciones de colaboración y subcontratación", source: "Condiciones administrativas · por comprobar", status: "confirmed" }
    ]
  },
  {
    id: "ejemplo-ciberseguridad",
    title: "Formación en ciberseguridad para personal público",
    organization: "Organismo público · ejemplo editable",
    amount: "41.180 € aprox.",
    deadline: "Cierre en 18 días",
    deadlineDate: "2026-10-18",
    sector: "Formación",
    territory: { city: "Valladolid", province: "Valladolid", mode: "Remoto + desplazamiento puntual", mapX: 190, mapY: 91, note: "Ubicación de prueba" },
    decision: "REVISAR",
    fit: "Por comprobar",
    source: "https://contrataciondelestado.es/",
    sourceLabel: "Plataforma oficial",
    summary: "Ejemplo para comprobar si la ficha distingue entre afirmar que una empresa sabe hacerlo y demostrarlo con la evidencia que pide el expediente.",
    why: ["Permite trabajar con certificados y referencias.", "Pide separar personas, experiencia y medios.", "Ayuda a probar la revisión requisito por requisito."],
    nextStep: "Separar cada requisito de solvencia de la evidencia concreta que tendría que aportar la empresa.",
    nextDate: "Segunda prueba · después del primer ejemplo",
    nextStepDone: false,
    requirements: [
      { text: "Trabajos similares y certificados de buena ejecución", source: "Solvencia técnica · por comprobar", status: "unknown" },
      { text: "Personal técnico y currículos", source: "Medios personales · por comprobar", status: "unknown" },
      { text: "Medios técnicos disponibles", source: "Prescripciones · por comprobar", status: "pending" },
      { text: "Integración de solvencia o colaboración", source: "Documentación administrativa · por comprobar", status: "confirmed" }
    ]
  },
  {
    id: "ejemplo-mantenimiento",
    title: "Mantenimiento de instalaciones de protección contra incendios",
    organization: "EMTSAM · expediente 035/2025",
    amount: "30.065,11 € IVA incluido / año",
    deadline: "Expediente histórico · sin plazo operativo",
    deadlineDate: null,
    sector: "Mantenimiento técnico",
    territory: { city: "Ubicación por comprobar", province: "Por confirmar", mode: "Presencial · varias instalaciones", note: "No usar como dato territorial confirmado" },
    decision: "REVISAR",
    fit: "Por comprobar",
    source: "https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?DocumentIdParam=cgJUEi9e2OOL2pvttws4cWzRpnYPmu9aTvoXMM0eufDfKfrD2DFWcB4duhTti4VZhzP%2Bc7cmc%2BCNKg3C11Ub68cUOFwlHxku8e4PI2PbvMlJOVDbGCDM%2BMigrvuVS7Rv&cifrado=QUC6dDpnV0pNaWk2Z3hKc0JvU2t0ZzR6Q0k4V0VYQkQ%3D%3D",
    sourceLabel: "Documento oficial en PLACSP",
    summary: "Caso de aprendizaje para comprobar cómo se leen requisitos técnicos, personal cualificado, medios, desplazamientos y colaboración en un servicio de mantenimiento.",
    why: ["Permite probar una ejecución presencial con varias instalaciones.", "Obliga a separar habilitación, experiencia, personal y medios.", "Sirve para probar que un cambio posterior puede reabrir una tarea y la estimación económica."],
    nextStep: "Leer el objeto, los medios exigidos, la experiencia, los tiempos de respuesta y las reglas de colaboración antes de valorar el encaje.",
    nextDate: "Primera revisión guiada · expediente histórico",
    nextStepDone: false,
    requirements: [
      { text: "Objeto, instalaciones y cobertura real del servicio", source: "Objeto y prescripciones · por comprobar", status: "unknown" },
      { text: "Experiencia técnica y certificados de trabajos similares", source: "Solvencia técnica · por comprobar", status: "unknown" },
      { text: "Personal cualificado y habilitaciones exigidas", source: "Requisito técnico · por comprobar", status: "unknown" },
      { text: "Materiales, equipos y medios para varias instalaciones", source: "Medios de ejecución · por comprobar", status: "unknown" },
      { text: "Tiempos de respuesta y posibles revisiones fuera de horario", source: "Condiciones de ejecución · por comprobar", status: "pending" },
      { text: "UTE, medios externos y subcontratación", source: "Documentación administrativa · por comprobar", status: "unknown" },
      { text: "Coste de desplazamientos, personal, materiales y riesgos", source: "Análisis económico · datos de la empresa pendientes", status: "unknown" }
    ],
    events: [
      { id: "mantenimiento-cambio-a", kind: "Aclaración técnica", label: "Revisar medios y tiempos de respuesta", detail: "Evento SIMULADO para comprobar que una aclaración reabre requisitos y tareas relacionadas.", at: "2026-10-06T10:00:00.000Z", sourceLabel: "SIMULADO · sin conexión oficial", requiresReview: true, reviewed: false },
      { id: "mantenimiento-cambio-b", kind: "Rectificación de plazo", label: "Comprobar si cambia el calendario", detail: "Evento SIMULADO para validar el antes y el después sin presentar una fecha como oficial.", at: "2026-10-06T10:05:00.000Z", sourceLabel: "SIMULADO · sin conexión oficial", requiresReview: true, reviewed: false }
    ],
    economicInputs: { price: 30065.11, labor: "", materials: "", travel: "", subcontracting: "", indirects: "", risk: "", minMargin: 10 },
    offerChecklist: [
      { id: "source-current", label: "Confirmar que se trabaja con la última versión del expediente", status: "pending", approvalRequired: false },
      { id: "admin-evidence", label: "Reunir solvencia, certificados y documentación administrativa", status: "pending", approvalRequired: false },
      { id: "technical-draft", label: "Preparar el borrador de memoria técnica", status: "pending", approvalRequired: true },
      { id: "economic-draft", label: "Preparar la oferta económica con hipótesis visibles", status: "pending", approvalRequired: true },
      { id: "human-review", label: "Revisión final por una persona responsable", status: "pending", approvalRequired: true },
      { id: "signature", label: "Firma y presentación en el portal correspondiente", status: "blocked", approvalRequired: true }
    ]
  },
  {
    id: "prueba-pliego-mixto-laboratorio",
    title: "Reactivos, equipamiento y mantenimiento para el laboratorio de bioquímica",
    organization: "Departamento de Salud de Orihuela · Hospital Vega Baja · PA 152/2025",
    amount: "1.942.994,34 € IVA incluido / 3 años",
    deadline: "Expediente histórico · plazo cerrado 30/06/2025",
    deadlineDate: null,
    sector: "Suministros y servicios sanitarios",
    territory: { city: "San Bartolomé", province: "Alicante", mode: "Presencial · Hospital Vega Baja", mapX: 325, mapY: 188, note: "Ubicación indicada en la ficha oficial" },
    decision: "REVISAR",
    fit: "Por comprobar",
    source: "https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?DocumentIdParam=58QQFXvvOrJlasNy9j3FF2UK08TbuxGkEuCo4kiwADQbZHTPeqvUPKEs57LD3Qy%2BF%2Fiv3c9UyEjCojx3wv1vlEgqCCJLI6a3O0MpazcVIvzfdyQgZAdTm3EfcUAC7CJ6&cifrado=QUC1GjXXSiLkydRHJBmbpw%3D%3D",
    sourceLabel: "Documento oficial de pliegos · PLACSP",
    summary: "Contrato mixto para suministrar reactivos y material, dotar y mantener equipamiento de laboratorio, desarrollar la trazabilidad y formar al personal del Servicio de Bioquímica del Hospital Vega Baja.",
    why: ["Obliga a revisar siete lotes y decidir a cuáles tendría sentido concurrir.", "Permite separar suministro, instalación, mantenimiento, trazabilidad y formación.", "Incluye criterios técnicos y económicos que sirven para probar la lectura de la adjudicación."],
    nextStep: "Identificar los lotes posibles y contrastar solvencia, medios, experiencia, servicio técnico y capacidad real de suministro.",
    nextDate: "Primera revisión guiada · expediente histórico",
    nextStepDone: false,
    requirements: [
      { text: "Elegir uno o varios de los siete lotes y delimitar su alcance", source: "Detalle de la licitación · confirmado en PLACSP", status: "pending" },
      { text: "Acreditar solvencia económica y técnica según el Anexo I", source: "PCAP y Anexo I · por comprobar en los documentos", status: "unknown" },
      { text: "Aportar reactivos, material y equipamiento compatible con el servicio", source: "Objeto y PPT · por comprobar", status: "pending" },
      { text: "Cubrir montaje, instalación, puesta en funcionamiento y mantenimiento", source: "Características del procedimiento · confirmado en PLACSP", status: "confirmed" },
      { text: "Ofrecer formación al personal y un sistema de gestión y trazabilidad", source: "Objeto y descripción del procedimiento · por detallar", status: "pending" },
      { text: "Revisar criterios de precio, logística, asistencia técnica y características del lote", source: "Criterios de adjudicación · por comprobar por lote", status: "unknown" },
      { text: "Comprobar condiciones medioambientales, garantías, riesgos y costes de ejecución", source: "Condiciones especiales y documentación del expediente · por comprobar", status: "unknown" },
      { text: "Presentar la oferta electrónicamente a través de PLACSP", source: "Proceso de licitación · confirmado en PLACSP", status: "confirmed" }
    ],
    economicInputs: { price: 1605780.45, labor: "", materials: "", travel: "", subcontracting: "", indirects: "", risk: "", minMargin: 10 },
    offerChecklist: [
      { id: "lab-source-current", label: "Confirmar la última versión del expediente y el lote elegido", status: "pending", approvalRequired: false },
      { id: "lab-admin-evidence", label: "Reunir solvencia, certificados y documentación administrativa", status: "pending", approvalRequired: false },
      { id: "lab-technical-draft", label: "Preparar la memoria técnica del lote o lotes elegidos", status: "pending", approvalRequired: true },
      { id: "lab-economic-draft", label: "Construir la oferta económica y sus costes de suministro y servicio", status: "pending", approvalRequired: true },
      { id: "lab-human-review", label: "Revisión final por una persona responsable", status: "pending", approvalRequired: true },
      { id: "lab-signature", label: "Firma y presentación en PLACSP", status: "blocked", approvalRequired: true }
    ]
  }
];

const seedNotes = [
  {
    id: "nota-regla-evidencia",
    kind: "Regla",
    text: "Separar siempre el hecho del pliego, la evidencia de la empresa y la duda pendiente.",
    opportunityId: "",
    createdAt: "2026-09-30T09:00:00.000Z"
  },
  {
    id: "nota-conectar-casos",
    kind: "Pendiente",
    text: "Conectar casos reales y registrar falsos positivos, falsos negativos y requisitos que el primer MVP no encuentra.",
    opportunityId: "",
    createdAt: "2026-09-30T09:05:00.000Z"
  }
];

// Los datos viven en el servidor por espacio de trabajo; se cargan tras iniciar sesión.
let opportunities = [];
let settings = { ...defaultSettings };
let notes = [];
let team = [];
let selectedId = "";
let activeFilter = "all";
let activeExpedientFilter = "all";
let activeExpedientView = "board";
let activeTaskFilter = "open";
let activeDetailTab = "summary";
let searchQuery = "";
let editingDocumentId = "";
let editingRequirementIndex = null;

// Guarda en el servidor partiendo de la versión cargada. Solo actualiza la interfaz si el
// servidor confirma; un fallo deja el cambio como borrador recuperable, nunca como «guardado».
const savingIds = new Set();
async function commitExpediente(id, mutate, message) {
  if (!PliegoCloud.can("editor")) { showToast("Tu permiso en este espacio es de lectura."); return false; }
  if (savingIds.has(id)) { showToast("Espera: se está guardando el cambio anterior."); return false; }
  const current = opportunities.find((entry) => entry.id === id);
  if (!current) { showToast("El expediente ya no está disponible."); return false; }
  const item = structuredClone(current);
  try {
    mutate(item);
    if (PliegoClaroWorkflow.reopenDecision(item)) recordHistory(item, "Decisión reabierta: REVISAR", "Ha cambiado una evidencia o su documento. La decisión anterior se conserva en el historial.");
  } catch (error) { showToast(error.message); return false; }
  savingIds.add(id);
  setSaveStatus("saving");
  try {
    await PliegoCloud.saveExpediente(item);
    opportunities = opportunities.map((entry) => entry.id === id ? item : entry);
    setSaveStatus("saved");
    render();
    showToast(message);
    return true;
  } catch (error) {
    setSaveStatus("error", error.message);
    await handleSaveFailure(error, id);
    return false;
  } finally { savingIds.delete(id); }
}

async function handleSaveFailure(error, id) {
  if (error.kind === "session") { PliegoAuthUI.show("expired"); return; }
  if (error.kind === "conflict") {
    try {
      const latest = await PliegoCloud.fetchExpediente(id);
      if (latest) opportunities = opportunities.map((entry) => entry.id === id ? normalizeExpediente(latest) : entry);
      render();
    } catch (_) { /* se mantiene la vista anterior */ }
    showToast("Otra pestaña o persona guardó antes. Se muestra la versión del servidor; tu cambio está en Inicio como borrador para reaplicarlo o descartarlo.");
    return;
  }
  showToast(error.message || "No se pudo guardar. Tu cambio queda como borrador en este navegador.");
}

function setSaveStatus(kind, detail = "") {
  const status = document.querySelector("#saveStatus");
  if (!status) return;
  window.clearTimeout(setSaveStatus.timer);
  status.dataset.state = kind;
  status.textContent = kind === "saving" ? "Guardando…" : kind === "saved" ? `${PliegoCloud.demo ? "Guardado en este navegador" : "Guardado en el servidor"} · ${new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date())}` : kind === "error" ? "Error: no guardado" : kind === "offline" ? "Sin conexión" : (PliegoCloud.demo ? "Guardado local" : "Conectado");
  status.title = detail;
}

function normalizeExpediente(item) {
  const seed = seedOpportunities.find((entry) => entry.id === item.id);
  const merged = { ...item, source: safeHttpUrl(item.source), requirements: Array.isArray(item.requirements) ? item.requirements : structuredClone(seed?.requirements || []), deadlineDate: item.deadlineDate ?? null, nextStepDone: item.nextStepDone ?? false, why: Array.isArray(item.why) ? item.why : [], amount: item.amount || "Por confirmar", sector: item.sector || "Sin clasificar", organization: item.organization || "Sin organismo", summary: item.summary || "", nextStep: item.nextStep || "Definir el siguiente paso", nextDate: item.nextDate || "Fecha por confirmar", fit: item.fit || "Por comprobar" };
  if (PliegoClaroWorkflow.reopenDecision(merged)) recordHistory(merged, "Decisión anterior pendiente de nueva revisión", "Se conserva el trabajo, pero falta trazabilidad completa para mantener GO.");
  return merged;
}

const listElement = document.querySelector("#opportunityList");
const detailElement = document.querySelector("#detailPanel");
const toastElement = document.querySelector("#toast");
const routeElement = document.querySelector("#routeView");
const dashboardSections = document.querySelectorAll(".dashboard-section");
const breadcrumbElement = document.querySelector(".breadcrumbs strong");

// Ajustes, notas y equipo se guardan en el servidor con resultado comprobado (sin escrituras directas a localStorage).
async function persistSettings(next, message = "Ajustes guardados") {
  if (!PliegoCloud.can("editor")) { showToast("Tu permiso en este espacio es de lectura."); return false; }
  setSaveStatus("saving");
  try {
    await PliegoCloud.saveSettings(next);
    settings = { ...defaultSettings, ...next };
    setSaveStatus("saved");
    showToast(message);
    return true;
  } catch (error) {
    setSaveStatus("error", error.message);
    if (error.kind === "session") PliegoAuthUI.show("expired");
    else showToast(error.message);
    return false;
  }
}

async function guarded(action, failureMessage) {
  try { return await action(); }
  catch (error) {
    if (error.kind === "session") PliegoAuthUI.show("expired");
    showToast(error.message || failureMessage);
    return null;
  }
}

function showToast(message) {
  toastElement.textContent = message;
  toastElement.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toastElement.classList.remove("show"), 2800);
}

function recordHistory(item, label, detail) {
  item.history = Array.isArray(item.history) ? item.history : [];
  item.history.unshift({ label, detail, at: new Date().toISOString() });
  // Keep the audit trail: later edits must not silently discard older decisions.
}

function getDeadlineDate(item) {
  if (!item.deadlineDate) return null;
  const date = new Date(`${item.deadlineDate}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  if (!date) return "Fecha por confirmar";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(date).replace(".", "");
}

function daysUntil(date) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
}

function deadlineLabel(item) {
  const date = getDeadlineDate(item);
  const days = daysUntil(date);
  if (!date) return item.deadline || "Fecha por confirmar";
  if (days < 0) return `Cerró el ${formatDate(date)}`;
  if (days === 0) return `Cierra hoy · ${formatDate(date)}`;
  return `Cierra el ${formatDate(date)} · ${days} días`;
}

function deadlineCompactLabel(item) {
  const date = getDeadlineDate(item);
  const days = daysUntil(date);
  if (!date) return item.deadline || "Fecha por confirmar";
  if (days < 0) return `Cerró · ${formatDate(date)}`;
  return `${formatDate(date)} · ${days} días`;
}

function upcomingOpportunities() {
  return opportunities
    .filter((item) => getDeadlineDate(item) && daysUntil(getDeadlineDate(item)) >= 0)
    .sort((a, b) => getDeadlineDate(a) - getDeadlineDate(b));
}

function numberValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatEuros(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function defaultOfferChecklist() {
  return [
    { id: "source-current", label: "Confirmar que se trabaja con la última versión del expediente", status: "pending", approvalRequired: false },
    { id: "admin-evidence", label: "Reunir solvencia y documentación administrativa", status: "pending", approvalRequired: false },
    { id: "technical-draft", label: "Preparar el borrador de memoria técnica", status: "pending", approvalRequired: true },
    { id: "economic-draft", label: "Preparar la oferta económica con hipótesis visibles", status: "pending", approvalRequired: true },
    { id: "human-review", label: "Revisión final por una persona responsable", status: "pending", approvalRequired: true },
    { id: "signature", label: "Firma y presentación en el portal correspondiente", status: "blocked", approvalRequired: true }
  ];
}

function offerChecklistFor(item) {
  if (!Array.isArray(item.offerChecklist)) item.offerChecklist = structuredClone(defaultOfferChecklist());
  return item.offerChecklist;
}

function economicAnalysis(item) {
  const inputs = item.economicInputs || {};
  const costKeys = ["labor", "materials", "travel", "subcontracting", "indirects", "risk"];
  const price = numberValue(inputs.price);
  const missing = costKeys.filter((key) => numberValue(inputs[key]) === null);
  const entered = costKeys.filter((key) => numberValue(inputs[key]) !== null);
  const baseCosts = entered.reduce((total, key) => total + numberValue(inputs[key]), 0);
  const minMargin = numberValue(inputs.minMargin) ?? 10;
  const complete = price !== null && missing.length === 0;
  const buildScenario = (label, factor) => {
    if (!complete) return { label, result: null, margin: null, factor };
    const costs = baseCosts * factor;
    const result = price - costs;
    return { label, result, margin: price ? (result / price) * 100 : null, factor };
  };
  return {
    inputs,
    price,
    entered,
    missing,
    baseCosts,
    minMargin,
    complete,
    status: price === null ? "Falta el precio de referencia" : entered.length === 0 ? "Faltan costes de ejecución" : complete ? "Borrador calculable" : "Borrador parcial · faltan datos",
    scenarios: [buildScenario("Conservador", 1.2), buildScenario("Probable", 1), buildScenario("Favorable", 0.9)]
  };
}

function taskItems(item) {
  const tasks = [{
    id: `next-${item.id}`,
    opportunityId: item.id,
    title: item.nextStep || "Definir el siguiente paso",
    detail: item.nextDate || "Fecha por confirmar",
    status: item.nextStepDone ? "completed" : item.decision === "NO-GO" ? "blocked" : "in_progress",
    kind: "next",
    taskType: "decision",
    priority: item.nextStepDone ? "normal" : "high",
    dueDate: item.deadlineDate || ""
  }];
  (item.requirements || []).forEach((requirement, requirementIndex) => {
    const isCollaboration = /colaboraci[oó]n|subcontrat|medios externos|UTE|asociaci[oó]n/i.test(requirement.text);
    tasks.push({
      id: `requirement-${item.id}-${requirement.id || requirementIndex}`,
      opportunityId: item.id,
      title: `Comprobar: ${requirement.text}`,
      detail: requirement.source || "Fuente por asociar",
      status: PliegoClaroWorkflow.confirmed(requirement, item.documents) ? "completed" : "pending",
      kind: "requirement",
      taskType: isCollaboration ? "collaboration" : "evidence",
      priority: requirement.status === "unknown" ? "high" : "normal",
      dueDate: item.deadlineDate || "",
      requirementIndex
    });
  });
  if (item.decision === "GO" || item.offerStarted) offerChecklistFor(item).forEach((entry) => {
    tasks.push({
      id: `offer-${item.id}-${entry.id}`,
      opportunityId: item.id,
      title: `Preparar: ${entry.label}`,
      detail: entry.approvalRequired ? "Requiere aprobación humana" : "Checklist de preparación",
      status: entry.status === "completed" ? "completed" : entry.status === "blocked" ? "blocked" : "pending",
      kind: "offer",
      taskType: "offer",
      priority: entry.approvalRequired ? "high" : "normal",
      dueDate: item.deadlineDate || "",
      offerId: entry.id
    });
  });
  (item.events || []).filter((event) => event.requiresReview).forEach((event) => {
    tasks.push({
      id: `change-${item.id}-${event.id}`,
      opportunityId: item.id,
      title: `Revisar cambio: ${event.label}`,
      detail: `${event.kind} · ${event.sourceLabel || "Fuente pendiente"}`,
      status: event.reviewed ? "completed" : "pending",
      kind: "change",
      taskType: "change",
      priority: "high",
      dueDate: "",
      eventId: event.id
    });
  });
  return tasks.map((task) => {
    const plan = item.taskPlans?.[task.id];
    return plan ? { ...task, dueDate: plan.dueDate || task.dueDate, ownerId: plan.ownerId, workNote: plan.note } : task;
  });
}

function allTasks() {
  return opportunities.flatMap((item) => taskItems(item));
}

function visibleTasks() {
  const tasks = allTasks();
  if (activeTaskFilter === "open") return tasks.filter((task) => ["pending", "in_progress"].includes(task.status));
  if (activeTaskFilter === "urgent") return tasks.filter((task) => task.status !== "completed" && task.priority === "high");
  if (activeTaskFilter === "evidence") return tasks.filter((task) => task.taskType === "evidence");
  if (activeTaskFilter === "collaboration") return tasks.filter((task) => task.taskType === "collaboration");
  if (activeTaskFilter === "offer") return tasks.filter((task) => task.taskType === "offer");
  if (activeTaskFilter === "change") return tasks.filter((task) => task.taskType === "change");
  if (activeTaskFilter === "completed") return tasks.filter((task) => task.status === "completed");
  return tasks;
}

function taskStatusLabel(status) {
  return { completed: "Completada", in_progress: "En curso", pending: "Pendiente", blocked: "Aparcada" }[status] || "Pendiente";
}

function taskTypeLabel(type) {
  return { decision: "Decisión", evidence: "Evidencia", collaboration: "Colaboración", change: "Cambio", offer: "Oferta" }[type] || "Trabajo";
}

function taskPriorityLabel(priority) {
  return priority === "high" ? "Prioridad alta" : "Prioridad normal";
}

function taskDueLabel(task) {
  return task.dueDate ? `Antes del ${formatDate(getDeadlineDate({ deadlineDate: task.dueDate }))}` : "Fecha por confirmar";
}

function compactCount(value) {
  return value > 9 ? "9+" : String(value);
}

function taskStateClass(status) {
  return { completed: "task-state-completed", in_progress: "task-state-review", pending: "task-state-pending", blocked: "task-state-blocked" }[status] || "task-state-pending";
}

function profileBlocks() {
  return [
    ["Servicios y sectores", settings.sectors],
    ["Zonas de ejecución", settings.locations],
    ["Solvencia técnica", settings.technicalSolvency],
    ["Solvencia económica", settings.economicSolvency],
    ["Medios propios, externos o asociación", settings.collaborationNotes],
    ["Documentación disponible", settings.documentsAvailable]
  ];
}

function profileCompletion() {
  const blocks = profileBlocks();
  const completed = blocks.filter(([, value]) => String(value || "").trim()).length;
  return { blocks, completed, total: blocks.length, percentage: Math.round((completed / blocks.length) * 100) };
}

function taskRowMarkup(task, showOpportunity = true) {
  const item = opportunities.find((entry) => entry.id === task.opportunityId);
  const completed = task.status === "completed";
  return `<div class="task-board-row ${completed ? "task-board-row-completed" : ""}">
    <button class="task-check-button ${taskStateClass(task.status)}" data-task-complete="${escapeAttribute(task.id)}" type="button" aria-label="${completed ? "Reabrir" : "Completar"} tarea">${completed ? "✓" : "○"}</button>
    <div class="task-board-copy"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.detail)}${showOpportunity && item ? ` · ${escapeHtml(item.title)}` : ""}</span><small><b>${escapeHtml(taskTypeLabel(task.taskType))}</b> · ${escapeHtml(taskPriorityLabel(task.priority))} · ${escapeHtml(taskDueLabel(task))} · ${escapeHtml(task.ownerId ? team.find((member) => member.id === task.ownerId)?.name || "Responsable retirado · reasignar" : "Sin responsable")}</small>${task.workNote ? `<span>${escapeHtml(task.workNote)}</span>` : ""}</div>
    <span class="task-state ${taskStateClass(task.status)}">${taskStatusLabel(task.status)}</span>
    ${item ? `<button class="route-row-action" data-open-opportunity="${escapeAttribute(item.id)}" type="button">Abrir →</button>` : ""}
  </div>`;
}

function completeTask(taskId) {
  const task = allTasks().find((entry) => entry.id === taskId);
  const item = task && opportunities.find((entry) => entry.id === task.opportunityId);
  if (!task || !item) return;
  if (task.kind === "requirement") {
    const requirement = item.requirements[task.requirementIndex];
    if (task.status !== "completed") {
      selectedId = item.id;
      editingRequirementIndex = task.requirementIndex;
      activeDetailTab = "requirements";
      window.location.hash = "oportunidades";
      render();
      showToast("Registra la fuente y la evidencia antes de confirmar el requisito.");
      return;
    }
    commitExpediente(item.id, (draft) => {
      draft.requirements[task.requirementIndex].status = "pending";
      draft.requirements[task.requirementIndex].verifiedAt = "";
      recordHistory(draft, `Tarea reabierta: ${requirement.text}`, "Requiere una nueva comprobación de evidencia.");
    }, "Requisito reabierto");
    return;
  } else if (task.kind === "offer") {
    const entry = offerChecklistFor(item).find((candidate) => candidate.id === task.offerId);
    if (!entry) return;
    if (entry.status === "blocked") {
      showToast("Esta acción requiere aprobación humana y firma en el portal correspondiente.");
      return;
    }
    commitExpediente(item.id, (draft) => {
      const entry = offerChecklistFor(draft).find((candidate) => candidate.id === task.offerId);
      entry.status = entry.status === "completed" ? "pending" : "completed";
      recordHistory(draft, entry.status === "completed" ? `Checklist completado: ${entry.label}` : `Checklist reabierto: ${entry.label}`, entry.approvalRequired ? "El borrador sigue requiriendo aprobación humana." : "Tarea de preparación.");
    }, "Checklist actualizado");
  } else if (task.kind === "change") {
    const event = (item.events || []).find((entry) => entry.id === task.eventId);
    if (!event) return;
    commitExpediente(item.id, (draft) => {
      const event = draft.events.find((entry) => entry.id === task.eventId);
      event.reviewed = !event.reviewed;
      recordHistory(draft, event.reviewed ? `Cambio revisado: ${event.label}` : `Cambio reabierto: ${event.label}`, event.detail);
    }, "Cambio actualizado");
  } else {
    commitExpediente(item.id, (draft) => {
      draft.nextStepDone = !draft.nextStepDone;
      recordHistory(draft, draft.nextStepDone ? "Siguiente acción completada" : "Siguiente acción reabierta", draft.nextStep);
    }, "Tarea actualizada");
  }
}

function decisionClass(decision) {
  return decision.toLowerCase().replace("-", "-");
}

function visibleOpportunities() {
  let visible = opportunities;
  if (activeFilter === "review") visible = visible.filter((item) => item.decision === "REVISAR");
  if (activeFilter === "go") visible = visible.filter((item) => item.decision === "GO");
  if (activeFilter === "soon") visible = visible.filter((item) => getDeadlineDate(item) && daysUntil(getDeadlineDate(item)) >= 0).sort((a, b) => getDeadlineDate(a) - getDeadlineDate(b));
  if (searchQuery) {
    const query = searchQuery.toLocaleLowerCase();
    visible = visible.filter((item) => [item.title, item.organization, item.sector, item.amount, item.summary, item.nextStep, ...(item.requirements || []).map((requirement) => requirement.text)].join(" ").toLocaleLowerCase().includes(query));
  }
  return visible;
}

function renderMetrics() {
  const openTasks = PliegoClaroWorkspaceUI.attention(allTasks().filter((task) => task.status === "pending" || task.status === "in_progress"));
  const upcoming = upcomingOpportunities();
  const profile = profileCompletion();
  document.querySelector("#metricReview").textContent = opportunities.filter((item) => item.decision === "REVISAR").length;
  document.querySelector("#metricGo").textContent = opportunities.filter((item) => item.decision === "GO").length;
  document.querySelector("#metricNoGo").textContent = opportunities.filter((item) => item.decision === "NO-GO").length;
  document.querySelector("#metricNext").textContent = upcoming.length ? `${upcoming.length} · ${formatDate(getDeadlineDate(upcoming[0]))}` : "—";
  document.querySelector("#opportunityCount").textContent = `${opportunities.length} ${opportunities.length === 1 ? "caso" : "casos"}`;
  document.querySelector('[data-route-count="hoy"]')?.replaceChildren(document.createTextNode(compactCount(openTasks.length)));
  document.querySelector('[data-route-count="tareas"]')?.replaceChildren(document.createTextNode(compactCount(openTasks.length)));
  document.querySelector("[data-workspace-name]")?.replaceChildren(document.createTextNode(settings.workspaceName || "Mi empresa"));
  const profileProgress = document.querySelector("[data-profile-progress]");
  if (profileProgress) profileProgress.style.width = `${profile.percentage}%`;
  document.documentElement.dataset.density = settings.density;
}

function renderList() {
  const visible = visibleOpportunities();
  const countLabel = document.querySelector("#opportunityCount");
  if (countLabel) countLabel.textContent = visible.length === opportunities.length ? `${opportunities.length} ${opportunities.length === 1 ? "caso" : "casos"}` : `${visible.length} de ${opportunities.length}`;
  listElement.innerHTML = visible.length ? visible.map((item) => `
    <article class="opportunity-card decision-${decisionClass(item.decision)} ${item.id === selectedId ? "selected" : ""}" data-id="${escapeAttribute(item.id)}" tabindex="0" role="button" aria-label="Abrir ${escapeHtml(item.title)}">
      <div class="card-topline"><span class="card-sector">${escapeHtml(item.sector)}</span><span class="decision-pill ${decisionClass(item.decision)}">${escapeHtml(item.decision)}</span></div>
      <h3>${escapeHtml(item.title)}</h3>
      <p class="card-organization">${escapeHtml(item.organization)}</p>
      <div class="card-meta"><span>Importe <strong>${escapeHtml(item.amount)}</strong></span><span>Cierre <strong>${escapeHtml(deadlineCompactLabel(item))}</strong></span></div>
    </article>
  `).join("") : opportunities.length ? `<div class="empty-list"><strong>No hay casos con este filtro.</strong><span>Prueba otra vista o añade una oportunidad.</span></div>` : `<div class="empty-list"><strong>Tu espacio está vacío.</strong><span>Empieza por <a href="#buscar">buscar una licitación real en PLACSP</a>, añade una con «+ Añadir oportunidad», trae tu copia de la beta desde <a href="#ajuste-datos">Ajustes</a> o añade <a href="#ajuste-riesgo">casos de práctica</a>.</span></div>`;

  listElement.querySelectorAll(".opportunity-card").forEach((card) => {
    card.addEventListener("click", () => selectOpportunity(card.dataset.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectOpportunity(card.dataset.id); }
    });
  });
}

function renderDetail() {
  activeDetailTab = PliegoClaroWorkspaceUI.detail(activeDetailTab);
  const item = opportunities.find((entry) => entry.id === selectedId);
  if (!item) {
    detailElement.innerHTML = `<div class="detail-empty"><span class="empty-mark">◈</span><h2>Elige una oportunidad</h2><p>Aquí veremos sus requisitos, evidencias y la decisión que toca tomar.</p></div>`;
    return;
  }
  const confirmedCount = item.requirements.filter((req) => PliegoClaroWorkflow.confirmed(req, item.documents)).length;
  const exampleBadge = settings.showExampleLabels ? `<span class="example-label">Datos de ejemplo · editable</span>` : "";
  const requirementsView = PliegoFeatures.aiMarkup(item) + PliegoClaroWorkflowUI.requirements(item, editingRequirementIndex);
  const summaryView = `
    <div class="summary-view">
      <div class="view-heading"><div><p class="detail-section-title">Lectura rápida</p><h3>Resumen del expediente</h3></div>${exampleBadge}</div>
      <div class="summary-grid">
        <div class="summary-cell summary-wide"><span>Qué se compra</span><strong>${escapeHtml(item.summary)}</strong></div>
        <div class="summary-cell"><span>Quién lo compra</span><strong>${escapeHtml(item.organization)}</strong></div>
        <div class="summary-cell"><span>Importe orientativo</span><strong>${escapeHtml(item.amount)}</strong></div>
        <div class="summary-cell"><span>Fecha límite</span><strong>${escapeHtml(deadlineLabel(item))}</strong></div>
        <div class="summary-cell"><span>Sector</span><strong>${escapeHtml(item.sector)}</strong></div>
        <div class="summary-cell summary-wide"><span>Qué falta comprobar</span><strong>${escapeHtml(item.nextStep)}</strong></div>
      </div>
      <div class="next-step"><p class="detail-section-title">Siguiente paso inmediato</p><p>${escapeHtml(item.nextStep)}</p><span>${escapeHtml(item.nextDate)}</span></div>
      ${PliegoClaroWorkflowUI.expediente(item)}
    </div>`;
  const documentsView = PliegoFeatures.originalsMarkup(item) + PliegoClaroWorkflowUI.documents(item, editingDocumentId);
  const decisionView = `
    <div class="decision-view"><div class="view-heading"><div><p class="detail-section-title">Matriz de decisión</p><h3>¿Merece invertir tiempo?</h3></div><span class="decision-pill ${decisionClass(item.decision)}">${escapeHtml(item.decision)}</span></div>
      <div class="decision-buttons decision-buttons-large">${["GO", "REVISAR", "NO-GO"].map((decision) => `<button class="decision-button ${item.decision === decision ? "active" : ""}" data-decision="${decision}" type="button">${decision}</button>`).join("")}</div>
      <div class="decision-columns"><div><p class="detail-section-title">Por qué sube</p><ul class="why-list">${item.why.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></div><div><p class="detail-section-title">Qué falta para decidir</p><p class="decision-copy">${escapeHtml(item.nextStep)}</p></div></div>
      <form data-decision-form class="editor-form"><label class="field"><span>Motivo de la decisión y condiciones pendientes</span><textarea name="reason" rows="3" required>${escapeHtml(item.decisionReason || "")}</textarea></label><div class="modal-actions"><button class="button button-dark" type="submit">Registrar decisión razonada</button></div><p class="editor-help">Decisión humana, no dictamen automático. ${item.decisionConfirmedAt ? "Última confirmación manual registrada en el historial." : "Todavía sin confirmación razonada."}</p><p class="editor-error" data-form-error role="alert"></p></form>
    </div>`;
  const analysis = economicAnalysis(item);
  const economicInputs = analysis.inputs;
  const economicView = `
    <div class="economic-view"><div class="view-heading"><div><p class="detail-section-title">Viabilidad económica</p><h3>¿Merece los recursos de la empresa?</h3></div><span class="example-label">Estimación de la empresa</span></div>
      <p class="view-intro">Introduce hipótesis de ejecución para comparar escenarios. El resultado es una ayuda de decisión: no demuestra rentabilidad ni sustituye una oferta calculada por la empresa.</p>
      <form class="economic-form" data-economic-form>
        <div class="economic-grid">
          <label class="settings-field"><span>Importe de referencia (€)</span><input name="price" type="number" step="0.01" min="0" value="${escapeAttribute(economicInputs.price ?? "")}" /></label>
          <label class="settings-field"><span>Margen mínimo deseado (%)</span><input name="minMargin" type="number" step="0.1" min="0" value="${escapeAttribute(economicInputs.minMargin ?? 10)}" /></label>
          <label class="settings-field"><span>Personal y horas (€)</span><input name="labor" type="number" step="0.01" min="0" value="${escapeAttribute(economicInputs.labor ?? "")}" placeholder="Pendiente" /></label>
          <label class="settings-field"><span>Materiales y equipos (€)</span><input name="materials" type="number" step="0.01" min="0" value="${escapeAttribute(economicInputs.materials ?? "")}" placeholder="Pendiente" /></label>
          <label class="settings-field"><span>Desplazamientos (€)</span><input name="travel" type="number" step="0.01" min="0" value="${escapeAttribute(economicInputs.travel ?? "")}" placeholder="Pendiente" /></label>
          <label class="settings-field"><span>Subcontratación o colaboradores (€)</span><input name="subcontracting" type="number" step="0.01" min="0" value="${escapeAttribute(economicInputs.subcontracting ?? "")}" placeholder="Pendiente" /></label>
          <label class="settings-field"><span>Costes indirectos (€)</span><input name="indirects" type="number" step="0.01" min="0" value="${escapeAttribute(economicInputs.indirects ?? "")}" placeholder="Pendiente" /></label>
          <label class="settings-field"><span>Riesgo e imprevistos (€)</span><input name="risk" type="number" step="0.01" min="0" value="${escapeAttribute(economicInputs.risk ?? "")}" placeholder="Pendiente" /></label>
        </div>
        <div class="economic-actions"><button class="button button-dark" type="submit">Guardar hipótesis</button><span class="example-label">${escapeHtml(analysis.status)}</span></div>
      </form>
      <div class="scenario-grid">${analysis.scenarios.map((scenario) => `<article class="scenario-card"><span>${escapeHtml(scenario.label)}</span><strong>${scenario.result === null ? "—" : escapeHtml(formatEuros(scenario.result))}</strong><small>${scenario.margin === null ? "Completa todos los costes para calcular" : `Margen estimado: ${scenario.margin.toFixed(1).replace(".", ",")} %`}</small></article>`).join("")}</div>
      <div class="economic-note"><strong>Cómo leerlo</strong><span>${analysis.complete ? `El modelo aplica un margen de incertidumbre del ${Math.round((analysis.scenarios[0].factor - 1) * 100)} % al escenario conservador y del 10 % de ahorro al favorable.` : `Faltan ${analysis.missing.length} bloques de coste para comparar los tres escenarios.`}</span></div>
    </div>`;
  const checklist = offerChecklistFor(item);
  const completedChecklist = checklist.filter((entry) => entry.status === "completed").length;
  const offerView = `
    <div class="offer-view"><div class="view-heading"><div><p class="detail-section-title">Preparación de oferta</p><h3>Checklist antes de presentar</h3></div><span class="completion-label">${completedChecklist}/${checklist.length} listos</span></div>
      <p class="view-intro">LicitIA puede ordenar el trabajo y preparar borradores. La revisión final, firma y presentación necesitan una persona responsable en el portal correspondiente.</p>
      <div class="approval-banner"><strong>Acciones protegidas</strong><span>La app no firma, no envía y no presenta ofertas automáticamente.</span></div>
      <div class="offer-checklist">${checklist.map((entry) => `<div class="offer-check-row ${entry.status === "completed" ? "is-completed" : ""} ${entry.status === "blocked" ? "is-blocked" : ""}"><button class="requirement-check ${entry.status === "completed" ? "confirmed" : entry.status === "blocked" ? "unknown" : "pending"}" data-offer-toggle="${escapeAttribute(entry.id)}" type="button" aria-label="${entry.status === "completed" ? "Reabrir" : "Completar"} ${escapeHtml(entry.label)}">${entry.status === "completed" ? "✓" : entry.status === "blocked" ? "🔒" : "○"}</button><div><strong>${escapeHtml(entry.label)}</strong><small>${entry.approvalRequired ? "Requiere aprobación humana" : "Preparación"}</small></div><span class="task-state ${entry.status === "completed" ? "task-state-completed" : entry.status === "blocked" ? "task-state-blocked" : "task-state-pending"}">${entry.status === "completed" ? "Listo" : entry.status === "blocked" ? "Bloqueado" : "Pendiente"}</span></div>`).join("")}</div>
    </div>`;
  const tasksView = `
    <div class="tasks-view"><div class="view-heading"><div><p class="detail-section-title">Acciones vinculadas</p><h3>Tareas del expediente</h3></div><span class="example-label">Derivadas de la revisión</span></div>
      <p class="view-intro">Cada duda pendiente se convierte en una tarea. Para confirmar un requisito hay que registrar su fuente y la evidencia, no solo pulsar “completar”.</p>
      <div class="task-list">${taskItems(item).map((task) => taskRowMarkup(task, false)).join("")}</div>
      ${PliegoClaroWorkflowUI.tasks(item, taskItems(item), team)}
    </div>`;
  const changes = Array.isArray(item.events) ? item.events : [];
  const changesView = `
    <div class="history-view"><div class="view-heading"><div><p class="detail-section-title">Seguimiento vivo</p><h3>Cambios y avisos</h3></div><span class="example-label">${changes.some((event) => event.official) ? "Cambios oficiales de PLACSP" : changes.length ? "Incluye eventos de prueba" : "Sin eventos"}</span></div>
      <p class="view-intro">Un expediente no termina con la primera decisión. Aquí se separa lo que ha cambiado, su posible impacto y la tarea que debe revisar una persona.</p>
      <div class="timeline">${changes.length ? changes.map((event) => `<div class="timeline-item"><span>${escapeHtml(formatDate(new Date(event.at)))}</span><div><strong>${escapeHtml(event.kind)} · ${escapeHtml(event.label)}</strong><p>${escapeHtml(event.detail)}</p><small>${escapeHtml(event.sourceLabel || "Fuente pendiente")} · ${event.reviewed ? "Revisado" : "Pendiente de revisión"}</small></div></div>`).join("") : `<div class="empty-list"><strong>Aún no hay cambios registrados.</strong><span>Los expedientes creados desde PLACSP se vigilan automáticamente y cada cambio queda aquí con su antes y después.</span></div>`}</div>
      ${PliegoFeatures.followMarkup(item)}
    </div>`;
  const historyView = `
    <div class="history-view"><div class="view-heading"><div><p class="detail-section-title">Trazabilidad</p><h3>Historial del expediente</h3></div><span class="example-label">${PliegoCloud.demo ? "Guardado local" : "Guardado en el servidor"}</span></div>
      <div class="timeline">${(item.history || [{ label: "Oportunidad añadida como ejemplo", detail: "La fuente oficial todavía debe contrastarse.", at: new Date().toISOString() }]).map((event) => `<div class="timeline-item"><span>${escapeHtml(formatDate(new Date(event.at)))}</span><div><strong>${escapeHtml(event.label)}</strong><p>${escapeHtml(event.detail)}</p></div></div>`).join("")}</div>
    </div>`;
  const tabViews = { summary: summaryView, requirements: requirementsView, documents: documentsView, decision: decisionView, economic: economicView, offer: offerView, tasks: tasksView, changes: changesView, history: historyView };
  detailElement.innerHTML = `
    <div class="detail-content">
      <div class="detail-topline"><div><span class="detail-eyebrow">Ficha de decisión · ${escapeHtml(item.fit)} encaje</span><h2>${escapeHtml(item.title)}</h2><p class="detail-organization">${escapeHtml(item.organization)} · ${escapeHtml(item.sector)} · <span class="mono">${escapeHtml(item.amount)}</span></p></div><span class="decision-pill ${decisionClass(item.decision)}">${escapeHtml(item.decision)}</span></div>
      <div class="detail-actions"><button class="button button-light" data-export-report type="button">Exportar revisión</button><button class="button button-light" data-export-csv type="button">Matriz CSV</button>${PliegoCloud.can("editor") ? `<button class="button button-quiet" data-trash-expediente type="button">Papelera</button>` : ""}<small>${item.official ? `PLACSP · ${escapeHtml(item.official.historic ? "histórico" : "vigilado")}` : "Sin vigilancia oficial"}</small></div>
      <div class="detail-summary"><div><span>Presupuesto</span><strong>${escapeHtml(item.amount)}</strong></div><div><span>Plazo / estado</span><strong>${escapeHtml(deadlineLabel(item))}</strong></div><div><span>Evidencias</span><strong>${confirmedCount}/${item.requirements.length} claras</strong></div></div>
      ${PliegoClaroWorkspaceUI.journey(item, activeDetailTab)}
      <div class="detail-tab-panel">${tabViews[activeDetailTab]}${activeDetailTab === "decision" ? `<section class="combined-work-section">${economicView}</section>` : activeDetailTab === "offer" ? `<section class="combined-work-section">${tasksView}</section>` : activeDetailTab === "changes" ? `<section class="combined-work-section">${historyView}</section>` : ""}</div>
      <p class="detail-note">La información de esta ficha debe contrastarse siempre con el expediente oficial. Las propuestas de IA son interpretaciones pendientes de revisión humana.</p>
    </div>`;

  detailElement.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
    activeDetailTab = button.dataset.tab;
    renderDetail();
  }));
  detailElement.querySelectorAll("[data-decision]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.decision === "GO" && !PliegoClaroWorkflow.canGo(item)) {
      showToast(PliegoClaroWorkflow.deadlinePassed(item) ? "El plazo de presentación ya ha pasado: no se puede marcar GO." : "Faltan requisitos decisivos con documento revisado y evidencia vigente de la empresa.");
      return;
    }
    commitExpediente(item.id, (draft) => {
      draft.decision = button.dataset.decision;
      delete draft.decisionConfirmedAt;
      recordHistory(draft, `Decisión provisional: ${draft.decision}`, "Selección humana. Falta registrar el motivo de la decisión.");
    }, `Decisión actualizada: ${button.dataset.decision}`);
  }));
  detailElement.querySelector("[data-economic-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    commitExpediente(item.id, (draft) => {
      draft.economicInputs = Object.fromEntries(["price", "minMargin", "labor", "materials", "travel", "subcontracting", "indirects", "risk"].map((key) => [key, String(formData.get(key) || "").trim()]));
      recordHistory(draft, "Hipótesis económica actualizada", "Estimación guardada para comparar escenarios; no es una rentabilidad confirmada.");
    }, "Hipótesis económica guardada");
  });
  detailElement.querySelectorAll("[data-offer-toggle]").forEach((button) => button.addEventListener("click", () => {
    const entry = offerChecklistFor(item).find((candidate) => candidate.id === button.dataset.offerToggle);
    if (!entry) return;
    if (entry.status === "blocked") {
      showToast("La firma y presentación requieren aprobación humana en el portal.");
      return;
    }
    commitExpediente(item.id, (draft) => {
      draft.offerStarted = true;
      const entry = offerChecklistFor(draft).find((candidate) => candidate.id === button.dataset.offerToggle);
      entry.status = entry.status === "completed" ? "pending" : "completed";
      recordHistory(draft, entry.status === "completed" ? `Checklist completado: ${entry.label}` : `Checklist reabierto: ${entry.label}`, entry.approvalRequired ? "El borrador sigue requiriendo aprobación humana." : "Tarea de preparación.");
    }, "Checklist actualizado");
  }));
  detailElement.querySelectorAll("[data-task-complete]").forEach((button) => button.addEventListener("click", () => completeTask(button.dataset.taskComplete)));
  detailElement.querySelector("[data-export-report]")?.addEventListener("click", () => PliegoFeatures.exportReport(item, team));
  detailElement.querySelector("[data-export-csv]")?.addEventListener("click", () => PliegoFeatures.csvMatrix(item));
  detailElement.querySelector("[data-trash-expediente]")?.addEventListener("click", async () => {
    if (!window.confirm(`«${item.title}» irá a la papelera del espacio con sus documentos y tareas. Puedes restaurarlo desde Ajustes. ¿Continuar?`)) return;
    if (await guarded(() => PliegoCloud.trashExpediente(item.id).then(() => true), "No se pudo mover a la papelera.")) {
      opportunities = opportunities.filter((entry) => entry.id !== item.id);
      selectedId = opportunities[0]?.id || "";
      render();
      showToast("Expediente en la papelera. Restaurable desde Ajustes.");
    }
  });
  if (activeDetailTab === "documents") PliegoFeatures.bindOriginals(detailElement, item);
  if (activeDetailTab === "requirements") PliegoFeatures.bindAi(detailElement, item);
  if (activeDetailTab === "changes") PliegoFeatures.bindFollow(detailElement, item);
  bindWorkflowForms(item);
}

function bindWorkflowForms(item) {
  const bind = (selector, action) => detailElement.querySelectorAll(selector).forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    if (button) button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      await action(data, form);
    } catch (error) { const box = form.querySelector("[data-form-error]"); if (box) box.textContent = error.message; else showToast(error.message); }
    finally { if (button?.isConnected) button.disabled = false; }
  }));
  detailElement.querySelectorAll("[data-document-edit]").forEach((button) => button.addEventListener("click", () => { editingDocumentId = button.dataset.documentEdit; renderDetail(); }));
  detailElement.querySelector("[data-document-new]")?.addEventListener("click", () => { editingDocumentId = ""; renderDetail(); });
  detailElement.querySelectorAll("[data-requirement-edit]").forEach((button) => button.addEventListener("click", () => { editingRequirementIndex = Number(button.dataset.requirementEdit); renderDetail(); }));
  detailElement.querySelector("[data-requirement-new]")?.addEventListener("click", () => { editingRequirementIndex = null; renderDetail(); });
  bind("[data-document-form]", async (data, form) => {
    const doc = PliegoClaroWorkflow.document({ ...data, reviewed: form.elements.reviewed.checked }, data.id || crypto.randomUUID(), new Date().toISOString());
    if (await commitExpediente(item.id, (draft) => {
      draft.documents = draft.documents || [];
      const index = draft.documents.findIndex((entry) => entry.id === doc.id);
      if (data.id && index < 0) throw new Error("Documento no encontrado.");
      if (index >= 0) draft.documents[index] = doc; else draft.documents.push(doc);
      recordHistory(draft, `${data.id ? "Documento actualizado" : "Documento registrado"}: ${doc.name}`, "Referencia y revisión manual. No se ha descargado ni analizado con IA.");
    }, "Documento guardado. Revisa las evidencias vinculadas si cambió la versión.")) { editingDocumentId = ""; renderDetail(); }
  });
  bind("[data-requirement-form]", async (data, form) => {
    const index = data.index === "" ? null : Number(data.index);
    if (index !== null && (!Number.isInteger(index) || !item.requirements[index])) throw new Error("Requisito no encontrado.");
    const me = PliegoCloud.state.members.find((member) => member.userId === PliegoCloud.state.user?.id);
    const req = PliegoClaroWorkflow.requirement({ ...data, critical: form.elements.critical.checked, verifiedBy: me?.name || PliegoCloud.state.user?.email || "" }, index === null ? crypto.randomUUID() : item.requirements[index].id || String(index), item.documents || [], new Date().toISOString());
    if (await commitExpediente(item.id, (draft) => {
      if (index === null) draft.requirements.push(req); else draft.requirements[index] = req;
      recordHistory(draft, `Requisito ${index === null ? "añadido" : "actualizado"}: ${req.text}`, `${req.source} · Estado: ${req.status} · Comprobación manual.`);
    }, "Requisito y evidencia guardados")) { editingRequirementIndex = null; renderDetail(); }
  });
  bind("[data-expediente-form]", async (data) => {
    const updated = PliegoClaroWorkflow.editExpediente(item, data);
    await commitExpediente(item.id, (draft) => { Object.assign(draft, updated); recordHistory(draft, "Datos del expediente editados", "Se conservan documentos, requisitos y trabajo anterior. Fechas aportadas por una persona."); }, "Expediente actualizado");
  });
  bind("[data-task-plan]", async (data, form) => {
    const plan = PliegoClaroWorkflow.plan(data, team, item.deadlineDate);
    const taskId = form.dataset.taskPlan;
    if (!taskItems(item).some((task) => task.id === taskId)) throw new Error("Tarea no encontrada.");
    await commitExpediente(item.id, (draft) => { draft.taskPlans = draft.taskPlans || {}; draft.taskPlans[taskId] = plan; recordHistory(draft, "Asignación actualizada", `${team.find((entry) => entry.id === plan.ownerId)?.name || "Sin responsable"} · ${plan.dueDate || "Sin fecha"}`); }, "Asignación guardada. Asignar no concede acceso: para eso, invita a la persona.");
  });
  bind("[data-decision-form]", async (data) => {
    if (!data.reason?.trim()) throw new Error("Explica el motivo de la decisión.");
    if (item.decision === "GO" && !PliegoClaroWorkflow.canGo(item)) throw new Error("Faltan evidencias decisivas. Revisa los requisitos.");
    await commitExpediente(item.id, (draft) => { draft.decisionReason = data.reason.trim(); draft.decisionConfirmedAt = new Date().toISOString(); recordHistory(draft, `Decisión humana confirmada: ${draft.decision}`, draft.decisionReason); }, "Decisión razonada guardada");
  });
}

function render() {
  renderMetrics();
  renderList();
  renderDetail();
  document.querySelectorAll(".filter").forEach((button) => button.classList.toggle("active", button.dataset.filter === activeFilter));
  renderRoute();
}

function currentRoute() {
  return PliegoClaroWorkspaceUI.route(window.location.hash);
}

function assistanceItems(item) {
  const requirements = item?.requirements || [];
  const unresolved = requirements.filter((requirement) => !PliegoClaroWorkflow.confirmed(requirement, item?.documents));
  const needsTechnical = unresolved.some((requirement) => /experiencia|personal|medios|certificad/i.test(requirement.text));
  const needsEconomic = unresolved.some((requirement) => /volumen|econ[oó]mic|seguro|patrimonio/i.test(requirement.text));
  const needsCollaboration = unresolved.some((requirement) => /colaboraci[oó]n|subcontrat|medios externos|UTE|asociaci[oó]n/i.test(requirement.text));
  return [
    {
      label: "EXPERIENCIA ESPECÍFICA",
      title: needsTechnical ? "¿Puedes demostrar que sabes hacerlo?" : "¿Qué experiencia pide exactamente?",
      text: "No basta con pertenecer a un sector parecido: hay que identificar trabajos similares, periodo, importe y documento que los acredite.",
      action: needsTechnical ? "Revisar evidencia" : "Ver perfil de empresa",
      href: needsTechnical ? "#tareas" : "#ajustes",
      tone: needsTechnical ? "review" : "go"
    },
    {
      label: "SOLVENCIA Y MEDIOS",
      title: needsEconomic ? "¿Qué solvencia económica te exige?" : "¿Qué puedes acreditar hoy?",
      text: "Separamos solvencia económica, solvencia técnica, personas, titulaciones y medios materiales. Cada afirmación necesita una evidencia.",
      action: "Revisar requisitos",
      href: "#tareas",
      tone: needsEconomic ? "review" : "neutral"
    },
    {
      label: "VÍAS DE PARTICIPACIÓN",
      title: needsCollaboration ? "¿Puedes cubrir la carencia con otra empresa?" : "¿Cuándo tendría sentido colaborar?",
      text: "Hay que distinguir UTE, medios externos y subcontratación. No son intercambiables y el pliego determina qué se admite y quién debe ejecutar.",
      action: "Ver tareas de colaboración",
      href: "#tareas",
      tone: needsCollaboration ? "review" : "neutral"
    },
    {
      label: "COBERTURA TERRITORIAL",
      title: "¿Puedes ejecutar desde tu capacidad real?",
      text: "La proximidad sirve para estimar desplazamientos, logística y cobertura. No demuestra por sí sola solvencia ni preferencia legal.",
      action: "Abrir Radar territorial",
      href: "#radar",
      tone: item?.territory ? "go" : "neutral"
    }
  ];
}

function assistanceMarkup(item) {
  const cards = assistanceItems(item);
  const unresolved = (item?.requirements || []).filter((requirement) => !PliegoClaroWorkflow.confirmed(requirement, item?.documents)).length;
  return `<div class="assistance-shell"><section class="route-card route-card-assistance"><span>CÓMO PARTICIPAR</span><strong>No descartes una oportunidad sin entender primero la carencia.</strong><p>Esta guía convierte la duda “no tengo toda la experiencia” en comprobaciones concretas. Ordena el pliego, tu evidencia y las vías posibles de colaboración. No declara aptitud jurídica.</p><div class="assistance-context"><b>Caso de referencia</b><span>${escapeHtml(item?.title || "Selecciona una oportunidad")}</span><small>${unresolved ? `${unresolved} requisitos todavía necesitan comprobación.` : "Los requisitos visibles están confirmados en esta prueba."}</small></div><div class="assistance-actions"><a class="button button-dark assistance-primary" href="#tareas">Ver tareas que desbloquean la decisión →</a><a class="button button-light" href="#radar">Explorar cobertura territorial</a></div></section><section class="assistance-grid">${cards.map((card) => `<article class="assistance-card assistance-card-${card.tone}"><span>${escapeHtml(card.label)}</span><h2>${escapeHtml(card.title)}</h2><p>${escapeHtml(card.text)}</p><a href="${card.href}">${escapeHtml(card.action)} →</a></article>`).join("")}</section><section class="route-section assistance-principles"><div class="route-section-heading"><div><p class="eyebrow eyebrow-muted">AYUDA RÁPIDA</p><h2>Cómo leer una carencia antes de decidir</h2></div><a class="route-inline-action" href="#oportunidades">Volver a oportunidades →</a></div><div class="principle-list"><div><b>1 · Hecho</b><span>Qué exige realmente el expediente.</span></div><div><b>2 · Encaje</b><span>Qué puedes demostrar hoy.</span></div><div><b>3 · Vía</b><span>Si procede estudiar UTE, medios externos o subcontratación.</span></div><div><b>4 · Acción</b><span>Qué documento o conversación cierra la duda.</span></div></div></section></div>`;
}

function radarMarkup() {
  const points = opportunities.filter((item) => item.territory?.mapX && item.territory?.mapY);
  const selectedTerritory = settings.locations?.trim() ? settings.locations : "Sede o zonas de servicio pendientes de completar";
  const modeCounts = points.reduce((counts, item) => {
    const mode = item.territory.mode;
    counts[mode] = (counts[mode] || 0) + 1;
    return counts;
  }, {});
  const markers = points.map((item, index) => `<g class="radar-marker ${item.id === selectedId ? "is-selected" : ""}" data-radar-open="${escapeAttribute(item.id)}" tabindex="0" role="button" aria-label="Abrir ${escapeHtml(item.territory.city)}: ${escapeHtml(item.title)}"><circle cx="${item.territory.mapX}" cy="${item.territory.mapY}" r="${item.id === selectedId ? 8 : 6}"></circle><circle class="radar-marker-core" cx="${item.territory.mapX}" cy="${item.territory.mapY}" r="2.5"></circle><text x="${item.territory.mapX + 10}" y="${item.territory.mapY + 4}">${escapeHtml(item.territory.city)}</text></g>`).join("");
  const cards = points.map((item) => `<button class="radar-opportunity ${item.id === selectedId ? "is-selected" : ""}" data-open-opportunity="${escapeAttribute(item.id)}" type="button"><span><b>${escapeHtml(item.territory.city)}</b><small>${escapeHtml(item.territory.province)} · ${escapeHtml(item.territory.mode)}</small></span><strong>${escapeHtml(item.decision)}</strong><i>→</i></button>`).join("");
  return `<div class="radar-shell"><section class="route-card route-card-radar"><div><span>RADAR TERRITORIAL · ILUSTRATIVO</span><strong>¿Dónde puedes ejecutar de verdad?</strong><p>Una vista para relacionar cada oportunidad con tu cobertura, desplazamiento y modo de servicio. El mapa es orientativo: no sustituye el pliego ni crea preferencia local.</p></div><a class="button button-light" href="#ajustes">Configurar zonas de servicio</a></section><div class="radar-layout"><section class="map-card"><div class="map-card-head"><div><p class="eyebrow eyebrow-muted">VISTA TERRITORIAL</p><h2>Oportunidades por territorio</h2></div><span class="example-label">${points.length} casos con ubicación de prueba</span></div><div class="map-stage"><svg class="spain-map" viewBox="0 0 390 270" role="img" aria-label="Mapa ilustrativo de España con oportunidades de prueba"><path class="spain-outline" d="M60 98 74 79 101 68 128 72 147 61 176 68 195 58 222 68 248 65 274 78 302 80 323 97 350 107 348 124 333 131 338 147 323 157 301 162 291 180 270 184 258 203 239 211 219 205 204 216 182 208 166 214 149 202 127 204 111 190 92 190 83 176 64 171 55 154 61 137 47 123Z"></path><path class="spain-relief" d="M78 96 119 88 158 95 193 82 224 91 254 83 292 101 324 111 M89 145 126 132 161 144 198 130 234 144 272 127 319 139 M115 177 148 163 186 178 226 165 267 174 304 153"></path><path class="island-shape island-canarias" d="M53 231 63 226 73 230 67 239 55 240Z M85 239 97 235 106 241 97 248 86 247Z"></path><path class="island-shape island-baleares" d="M311 64 319 58 327 63 321 70Z M335 74 343 69 351 74 344 80Z"></path>${markers}</svg><div class="map-legend"><span><i class="legend-dot legend-dot-active"></i>Oportunidad de prueba</span><span><i class="legend-dot legend-dot-base"></i>${escapeHtml(selectedTerritory)}</span></div></div><p class="map-disclaimer">La geometría es una vista visual del MVP. La distancia, el tiempo de desplazamiento y la cobertura real se calcularán cuando conectemos ubicación y fuente oficial.</p></section><aside class="radar-side"><section class="radar-side-card"><p class="eyebrow eyebrow-muted">TU COBERTURA DECLARADA</p><h2>${escapeHtml(selectedTerritory)}</h2><p>Completa la sede, provincias, radios y modalidad en Mi empresa para que este panel pueda comparar capacidad y territorio.</p><a href="#ajustes">Editar perfil →</a></section><section class="radar-side-card"><p class="eyebrow eyebrow-muted">CASOS EN EL RADAR</p><div class="radar-count-list">${Object.entries(modeCounts).map(([mode, count]) => `<div><span>${escapeHtml(mode)}</span><b>${count}</b></div>`).join("")}</div></section></aside></div><section class="route-section radar-opportunities"><div class="route-section-heading"><div><p class="eyebrow eyebrow-muted">ABRIR CASO</p><h2>Qué significa cada punto</h2></div><span class="count-label">Haz clic para ver encaje y carencias</span></div><div class="radar-opportunity-list">${cards || `<div class="empty-list"><strong>Aún no hay ubicaciones en los casos.</strong><span>Añade una oportunidad con territorio para probar el radar.</span></div>`}</div></section><section class="route-note radar-note"><strong>Regla de interpretación</strong><p>“Cerca” puede reducir desplazamiento o facilitar la ejecución, pero no demuestra experiencia, solvencia ni derecho a participar. El pliego manda.</p></section></div>`;
}

function teamMarkup() {
  const openTasks = allTasks().filter((task) => ["pending", "in_progress"].includes(task.status));
const roles = team.filter((member) => !member.isMember);
return `<div class="team-shell"><section class="route-card route-card-accent"><span>ROLES DE TRABAJO</span><strong>Quién tiene que cerrar cada duda</strong><p>Los miembros con cuenta aparecen arriba. Aquí puedes añadir además roles sin cuenta (por ejemplo, un colaborador externo) solo para asignar tareas: no les da acceso.</p><div class="team-summary"><div><b>${roles.length}</b><span>roles sin cuenta</span></div><div><b>${openTasks.length}</b><span>tareas abiertas</span></div><div><b>${opportunities.length}</b><span>expedientes</span></div></div></section><section class="route-section"><div class="route-section-heading"><div><p class="eyebrow eyebrow-muted">ROLES DEL ESPACIO</p><h2>Equipo y colaboradores</h2></div><span class="count-label">Compartidos con el espacio</span></div><div class="team-grid">${roles.map((member) => `<article class="team-card"><div class="team-avatar">${escapeHtml(member.name.slice(0, 2).toUpperCase())}</div><div><strong>${escapeHtml(member.name)}</strong><span>${escapeHtml(member.role)}</span><small>${escapeHtml(member.note || "Rol de trabajo")}</small></div>${PliegoCloud.can("editor") ? `<button class="text-button team-delete" data-team-delete="${escapeAttribute(member.id)}" type="button">Quitar</button>` : ""}</article>`).join("")}</div></section><section class="route-note team-composer"><div class="route-section-heading"><div><p class="eyebrow eyebrow-muted">AÑADIR ROL</p><h2>¿Quién puede ayudar?</h2></div></div><form data-team-form class="team-form"><label class="field"><span>Nombre o referencia</span><input name="name" required placeholder="Ej. Colaborador técnico" /></label><label class="field"><span>Rol</span><input name="role" required placeholder="Ej. Solvencia y medios" /></label><button class="button button-dark" type="submit">Añadir al espacio</button></form><p class="team-note">Puedes asignar miembros y roles desde Preparación dentro de cada expediente. Para dar acceso a alguien, invítale arriba con su correo.</p></section></div>`;
}

function renderSettingsMarkup() {
  const storageBytes = new Blob([JSON.stringify({ opportunities, settings, team })]).size;
  return `
    <div class="settings-header">
      <div>
        <p class="eyebrow">Espacio de trabajo · Ajustes</p>
        <h1>Ajustes de la aplicación</h1>
        <p class="route-intro">${PliegoCloud.demo ? "Demostración, reglas y copias. Los cambios se guardan solo en este navegador." : "Cuenta, espacio de trabajo, reglas y copias. Los cambios se guardan en el servidor para todo el espacio."}</p>
      </div>
      <div class="settings-header-actions"><span class="settings-badge"><i></i> ${PliegoCloud.demo ? "Guardado en este navegador" : "Guardado en el servidor"}</span><span class="settings-badge settings-badge-muted">Fuente oficial: PLACSP</span></div>
    </div>
    <div class="settings-notice"><span class="settings-notice-icon">◆</span><div><strong>Control de datos</strong><p>${PliegoCloud.demo ? "En esta demostración los expedientes se guardan solo en este navegador. La IA, el equipo y los correos son simulados. Exporta una copia para conservar el trabajo." : "El trabajo se guarda en el espacio de tu equipo. Consulta Privacidad y proveedores antes de añadir documentación y revisa los permisos de acceso."}</p></div></div>
    <div class="settings-shell">
      <aside class="settings-nav" aria-label="Secciones de ajustes">
        <span>Secciones de ajuste</span>
        <a href="#ajuste-cuenta">Cuenta, espacio y papelera</a>
        <a href="#ajuste-espacio">Espacio de trabajo</a>
        <a href="#ajuste-empresa">Perfil de licitador</a>
        <a href="#ajuste-busqueda">Búsqueda y proximidad</a>
        <a href="#ajuste-decision">Reglas de decisión</a>
        <a href="#ajuste-avisos">Avisos de fechas</a>
        <a href="#ajuste-datos">Datos y resguardo</a>
        <a href="#ajuste-apariencia">Apariencia</a>
        <a class="settings-nav-danger" href="#ajuste-riesgo">Zona de riesgo</a>
      </aside>
      <div class="settings-main">
        ${PliegoFeatures.accountMarkup(settings)}
        <section class="settings-section" id="ajuste-espacio">
          <div class="settings-section-heading"><div><span class="settings-kicker">01 · CONTEXTO</span><h2>Espacio de trabajo</h2><p>Identifica este entorno sin simular una cuenta o una conexión que todavía no existe.</p></div><span class="settings-section-icon">⌂</span></div>
          <div class="settings-field-grid">
            <label class="settings-field"><span>Nombre visible</span><input data-setting="workspaceName" type="text" value="${escapeAttribute(settings.workspaceName)}" placeholder="Ej. Mi empresa" /></label>
            <label class="settings-field"><span>Zona horaria de referencia</span><select data-setting="timezone"><option value="Europe/Madrid" ${settings.timezone === "Europe/Madrid" ? "selected" : ""}>Europe/Madrid</option><option value="UTC" ${settings.timezone === "UTC" ? "selected" : ""}>UTC</option></select></label>
            <div class="settings-readonly"><span>Estado del entorno</span><strong><i></i> ${PliegoCloud.demo ? "Demostración · datos locales" : "Piloto con cuentas · datos en servidor"}</strong><small>Las licitaciones se leen de PLACSP; contrasta siempre con el expediente oficial.</small></div>
          </div>
        </section>

        <section class="settings-section" id="ajuste-empresa"><div class="settings-inline-note"><strong>Perfil y equipo en un solo lugar.</strong> Los datos de solvencia, capacidad y documentación se editan ahora en <a href="#empresa">Empresa y equipo →</a>. Se conservan los valores anteriores.</div></section>

        <section class="settings-section" id="ajuste-busqueda">
          <div class="settings-section-heading"><div><span class="settings-kicker">03 · DESCUBRIMIENTO</span><h2>Búsqueda y proximidad</h2><p>Controla qué señales deben aparecer en las oportunidades sin convertirlas en una puntuación opaca.</p></div><span class="settings-section-icon">⌕</span></div>
          <div class="settings-option-list">
            <label class="settings-toggle"><span><strong>Usar proximidad como señal</strong><small>Mostrar distancia o coincidencia territorial cuando exista el dato. No descarta por sí sola.</small></span><input data-setting="includeProximity" type="checkbox" ${settings.includeProximity ? "checked" : ""} /></label>
            <div class="settings-inline-note"><strong>Importante:</strong> la búsqueda real todavía no está conectada a fuentes oficiales; esta preferencia prepara el criterio del MVP.</div>
          </div>
        </section>

        <section class="settings-section" id="ajuste-decision">
          <div class="settings-section-heading"><div><span class="settings-kicker">04 · TRIAJE</span><h2>Reglas de decisión</h2><p>Define los valores iniciales de la mesa. La decisión final debe seguir siendo explicable y revisable.</p></div><span class="settings-section-icon">✓</span></div>
          <div class="settings-field-grid">
            <label class="settings-field"><span>Estado inicial de una oportunidad nueva</span><select data-setting="defaultDecision"><option value="REVISAR" ${settings.defaultDecision === "REVISAR" ? "selected" : ""}>REVISAR · recomendado</option><option value="GO" ${settings.defaultDecision === "GO" ? "selected" : ""}>GO · solo si está confirmado</option><option value="NO-GO" ${settings.defaultDecision === "NO-GO" ? "selected" : ""}>NO-GO · solo si está descartada</option></select></label>
            <label class="settings-toggle settings-toggle-card"><span><strong>Evidencia obligatoria para GO</strong><small>Siempre activo: documento revisado, página o cláusula y evidencia de la empresa para cada requisito decisivo. No es una comprobación legal automática.</small></span><input type="checkbox" checked disabled /></label>
          </div>
          <div class="settings-status-legend"><span><i class="status-dot status-dot-go"></i>Confirmado</span><span><i class="status-dot status-dot-review"></i>Pendiente de comprobar</span><span><i class="status-dot status-dot-no-go"></i>No encontrado o incompatible</span></div>
        </section>

        <section class="settings-section" id="ajuste-avisos">
          <div class="settings-section-heading"><div><span class="settings-kicker">05 · SEGUIMIENTO</span><h2>Avisos de fechas</h2><p>Prepara qué debe aparecer en “Hoy”. La integración con Calendar o notificaciones del sistema aún no está conectada.</p></div><span class="settings-section-icon">!</span></div>
          <div class="settings-field-grid">
            <label class="settings-toggle settings-toggle-card"><span><strong>Mostrar avisos en Inicio</strong><small>Destacar oportunidades que se acercan al cierre dentro del MVP.</small></span><input data-setting="deadlineReminders" type="checkbox" ${settings.deadlineReminders ? "checked" : ""} /></label>
            <label class="settings-field"><span>Anticipación de aviso</span><input data-setting="reminderDays" type="text" value="${escapeAttribute(settings.reminderDays)}" placeholder="7, 2, 1" /><small>Días antes del cierre, separados por comas.</small></label>
            <label class="settings-toggle settings-toggle-card"><span><strong>Mostrar cambios pendientes</strong><small>Crear la tarjeta de cambios y sus tareas cuando el expediente reciba un evento.</small></span><input data-setting="changeReminders" type="checkbox" ${settings.changeReminders ? "checked" : ""} /></label>
            <label class="settings-toggle settings-toggle-card"><span><strong>Avisos por correo para este espacio</strong><small>Envía por correo los cambios oficiales y los recordatorios de cierre a quien tenga los avisos activados en su cuenta.</small></span><input data-setting="emailChangeAlerts" type="checkbox" ${settings.emailChangeAlerts ? "checked" : ""} /></label>
          </div>
          <div class="settings-inline-note"><strong>Estado actual:</strong> los cambios oficiales crean aviso en Inicio, tarea y (si lo activas) correo una sola vez. Los recordatorios de cierre se calculan en hora de Madrid. El calendario se exporta en .ics desde la sección Cuenta.</div>
        </section>

        <section class="settings-section" id="ajuste-datos">
          <div class="settings-section-heading"><div><span class="settings-kicker">06 · SOBERANÍA</span><h2>Datos y resguardo</h2><p>Exporta o importa una copia antes de probar cambios importantes. El tamaño mostrado es orientativo del almacenamiento de esta prueba.</p></div><span class="settings-section-icon">□</span></div>
          <div class="settings-storage"><div><strong>${PliegoCloud.demo ? "Datos del espacio en este navegador" : "Datos del espacio en el servidor"}</strong><span>${storageBytes} bytes de expedientes, ajustes y equipo · los PDF se guardan aparte con su huella</span></div></div>
          <div class="settings-action-grid"><button class="settings-action" data-export-local type="button"><strong>↓ Exportar datos (JSON)</strong><span> expedientes, ajustes, equipo, notas, texto extraído, análisis, comentarios, avisos y lista de originales. No incluye los archivos.</span></button><button class="settings-action" data-export-full type="button"><strong>↓ Copia completa (.zip)</strong><span> todo lo anterior más los originales con su huella SHA-256 verificada; se restaura aquí mismo</span></button><label class="settings-action"><strong>↑ Traer copia de la beta o de otro espacio</strong><span> vista previa, duplicados y confirmación; todo o nada, sin borrar lo existente</span><input data-import-local type="file" accept="application/json,.json,application/zip,.zip" hidden /></label><button class="settings-action" data-settings-defaults type="button"><strong>↺ Restaurar ajustes</strong><span> volver a los valores del MVP</span></button></div>
        </section>

        <section class="settings-section" id="ajuste-apariencia">
          <div class="settings-section-heading"><div><span class="settings-kicker">07 · LECTURA</span><h2>Apariencia y legibilidad</h2><p>La interfaz prioriza lectura documental, contraste y densidad controlada.</p></div><span class="settings-section-icon">✦</span></div>
          <div class="settings-field-grid">
            <label class="settings-field"><span>Densidad de la lista</span><select data-setting="density"><option value="compact" ${settings.density === "compact" ? "selected" : ""}>Compacta · más casos visibles</option><option value="comfortable" ${settings.density === "comfortable" ? "selected" : ""}>Cómoda · más espacio por caso</option></select></label>
            <label class="settings-toggle settings-toggle-card"><span><strong>Mostrar etiquetas de ejemplo</strong><small>Recordar qué datos aún no están conectados a fuentes oficiales.</small></span><input data-setting="showExampleLabels" type="checkbox" ${settings.showExampleLabels ? "checked" : ""} /></label>
          </div>
        </section>

        <section class="settings-section settings-section-risk" id="ajuste-riesgo">
          <div class="settings-section-heading"><div><span class="settings-kicker settings-kicker-danger">08 · PRECAUCIÓN</span><h2>Zona de riesgo</h2><p>Acciones que cambian datos del espacio. Ninguna borra expedientes.</p></div><span class="settings-section-icon settings-section-icon-danger">×</span></div>
          <div class="settings-danger-row"><div><strong>Añadir casos de práctica</strong><small>Añade ${seedOpportunities.length} casos marcados como EJEMPLO si faltan. No sustituye ni borra nada.</small></div><button class="button button-light" data-route-reset type="button">Añadir ejemplos</button></div>
        </section>
      </div>
    </div>`;
}

function renderRoute() {
  const route = currentRoute();
  if (route !== "oportunidades" && searchQuery) {
    searchQuery = "";
    const searchInput = document.querySelector("#globalSearch");
    if (searchInput) searchInput.value = "";
  }
  const parentRoute = PliegoClaroWorkspaceUI.parent(route);
  if (breadcrumbElement) breadcrumbElement.textContent = PliegoClaroWorkspaceUI.labels[parentRoute];
  const subnav = document.querySelector("#workspaceSubnav");
  subnav.innerHTML = PliegoClaroWorkspaceUI.subnav(route);
  subnav.hidden = !subnav.innerHTML;
  dashboardSections.forEach((section) => { section.hidden = route !== "oportunidades"; });
  routeElement.hidden = route === "oportunidades";
  document.querySelectorAll(".nav-item[data-route]").forEach((item) => {
    const active = item.dataset.route === parentRoute;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
  });
  if (route === "oportunidades") {
    renderList();
    renderDetail();
    document.querySelectorAll(".filter").forEach((button) => button.classList.toggle("active", button.dataset.filter === activeFilter));
    return;
  }

  const selected = opportunities.find((item) => item.id === selectedId) || opportunities[0];
  const openTasks = PliegoClaroWorkspaceUI.attention(allTasks().filter((task) => task.status === "pending" || task.status === "in_progress"));
  const parkedTasks = allTasks().filter((task) => task.status === "blocked");
  const completedTasks = allTasks().filter((task) => task.status === "completed");
  const upcoming = settings.deadlineReminders ? upcomingOpportunities() : [];
  const profile = profileCompletion();
  const pendingChangeCount = settings.changeReminders ? opportunities.reduce((total, item) => total + (item.events || []).filter((event) => event.requiresReview && !event.reviewed).length, 0) : 0;
  const changeCandidate = settings.changeReminders ? opportunities.find((item) => (item.events || []).some((event) => event.requiresReview && !event.reviewed)) || selected : null;
  const filteredExpedients = opportunities.filter((item) => activeExpedientFilter === "all" || item.decision === activeExpedientFilter);
  const routeData = {
    hoy: {
      eyebrow: "Espacio de trabajo · Inicio",
      title: "Tu mesa de trabajo",
      intro: "Retoma un expediente, comprueba lo que falta y decide el siguiente paso. Tus notas están en la vista Notas y aprendizaje.",
      body: `<div class="route-summary-strip"><article class="route-card route-card-accent"><span>PRÓXIMA FECHA</span><strong>${upcoming[0] ? escapeHtml(deadlineLabel(upcoming[0])) : "Sin fecha confirmada"}</strong><p>${upcoming[0] ? escapeHtml(upcoming[0].title) : "Añade una fecha exacta para priorizar mejor."}</p>${upcoming[0] ? `<button class="route-inline-action" data-open-opportunity="${escapeAttribute(upcoming[0].id)}" type="button">Abrir ficha →</button>` : ""}</article><article class="route-card"><span>CAMBIOS PENDIENTES</span><strong>${pendingChangeCount}</strong><p>Eventos que pueden reabrir una tarea o una decisión.</p>${changeCandidate?.events?.length ? `<button class="route-inline-action" data-open-opportunity="${escapeAttribute(changeCandidate.id)}" data-open-tab="changes" type="button">Revisar cambios →</button>` : `<a href="#oportunidades">Abrir expedientes →</a>`}</article><article class="route-card"><span>TRABAJO ABIERTO</span><strong>${openTasks.length} tareas pendientes</strong><p>Una tarea es una duda que debe cerrarse antes de decidir.</p><a href="#tareas">Ver tareas →</a></article><article class="route-card"><span>REVISIÓN</span><strong>${opportunities.filter((item) => item.decision === "REVISAR").length} oportunidades</strong><p>Empieza por requisitos con evidencia pendiente.</p><a href="#oportunidades">Ver oportunidades →</a></article></div><section class="route-section"><div class="route-section-heading"><div><p class="eyebrow eyebrow-muted">PRIORIDAD</p><h2>Lo que puedes cerrar ahora</h2></div><span class="count-label">${Math.min(openTasks.length, 4)} visibles</span></div><div class="task-board">${openTasks.length ? openTasks.slice(0, 4).map((task) => taskRowMarkup(task)).join("") : `<div class="empty-list"><strong>No hay tareas abiertas.</strong><span>La bandeja está despejada por ahora.</span></div>`}</div></section>`
    },
    expedientes: {
      eyebrow: "Espacio de trabajo · Expedientes",
      title: "Cartera de expedientes",
      intro: "Ve en qué etapa está cada caso y qué acción lo desbloquea. El tablero organiza el trabajo; no firma ni presenta ofertas.",
      body: `<div class="route-toolbar"><div class="filters" role="toolbar" aria-label="Filtrar expedientes"><button class="filter ${activeExpedientFilter === "all" ? "active" : ""}" data-expedient-filter="all" type="button">Todos</button><button class="filter ${activeExpedientFilter === "REVISAR" ? "active" : ""}" data-expedient-filter="REVISAR" type="button">Revisar</button><button class="filter ${activeExpedientFilter === "GO" ? "active" : ""}" data-expedient-filter="GO" type="button">GO</button><button class="filter ${activeExpedientFilter === "NO-GO" ? "active" : ""}" data-expedient-filter="NO-GO" type="button">NO-GO</button></div><span class="count-label">${filteredExpedients.length} de ${opportunities.length}</span></div><div class="route-list">${filteredExpedients.length ? filteredExpedients.map((item) => `<button class="route-list-row route-list-row-rich" data-open-opportunity="${escapeAttribute(item.id)}" type="button"><span class="route-list-status decision-pill ${decisionClass(item.decision)}">${escapeHtml(item.decision)}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.organization)} · ${escapeHtml(item.amount)} · ${escapeHtml(deadlineLabel(item))}</small><small>${item.requirements.filter((requirement) => PliegoClaroWorkflow.confirmed(requirement, item.documents)).length}/${item.requirements.length} evidencias claras · ${escapeHtml(item.nextStep)}</small></span><span class="route-arrow">→</span></button>`).join("") : `<div class="empty-list"><strong>No hay expedientes en esta vista.</strong><span>Prueba otro estado.</span></div>`}</div>`
    },
    tareas: {
      eyebrow: "Espacio de trabajo · Tareas",
      title: "Tareas pendientes",
      intro: "Acciones que deben cerrar una duda antes de convertir REVISAR en GO o NO-GO.",
      body: `<div class="route-summary-strip"><article class="route-card"><span>ABIERTAS</span><strong>${openTasks.length}</strong><p>Se generan desde la siguiente acción y los requisitos no confirmados.</p></article><article class="route-card"><span>COMPLETADAS</span><strong>${completedTasks.length}</strong><p>Las comprobaciones confirmadas dejan de bloquear la decisión.</p></article><article class="route-card"><span>APARCADAS</span><strong>${parkedTasks.length}</strong><p>Quedan fuera del trabajo activo hasta que cambie el contexto.</p></article></div><section class="route-section"><div class="route-section-heading"><div><p class="eyebrow eyebrow-muted">LISTA DE TRABAJO</p><h2>Qué toca hacer</h2></div><span class="count-label">${visibleTasks().length} visibles</span></div><div class="filters task-filters" role="toolbar" aria-label="Filtrar tareas"><button class="filter ${activeTaskFilter === "open" ? "active" : ""}" data-task-filter="open" type="button">Abiertas</button><button class="filter ${activeTaskFilter === "urgent" ? "active" : ""}" data-task-filter="urgent" type="button">Prioridad alta</button><button class="filter ${activeTaskFilter === "evidence" ? "active" : ""}" data-task-filter="evidence" type="button">Evidencia</button><button class="filter ${activeTaskFilter === "collaboration" ? "active" : ""}" data-task-filter="collaboration" type="button">Colaboración</button><button class="filter ${activeTaskFilter === "offer" ? "active" : ""}" data-task-filter="offer" type="button">Oferta</button><button class="filter ${activeTaskFilter === "change" ? "active" : ""}" data-task-filter="change" type="button">Cambios</button><button class="filter ${activeTaskFilter === "completed" ? "active" : ""}" data-task-filter="completed" type="button">Completadas</button><button class="filter ${activeTaskFilter === "all" ? "active" : ""}" data-task-filter="all" type="button">Todas</button></div><div class="task-board">${visibleTasks().length ? visibleTasks().map((task) => taskRowMarkup(task)).join("") : `<div class="empty-list"><strong>No hay tareas en esta vista.</strong><span>Prueba otro filtro o registra una nueva oportunidad.</span></div>`}</div></section>`
    },
    asistencia: {
      eyebrow: "Espacio de trabajo · Cómo participar",
      title: "Cómo participar",
      intro: "Una guía para entender si una carencia se puede cubrir antes de descartar una oportunidad.",
      body: assistanceMarkup(selected)
    },
    radar: {
      eyebrow: "Espacio de trabajo · Radar territorial",
      title: "Radar territorial",
      intro: "Relaciona oportunidades con tu capacidad de servicio y desplazamiento.",
      body: radarMarkup()
    },
    equipo: {
      eyebrow: "Espacio de trabajo · Equipo",
      title: "Equipo y colaboración",
      intro: "Organiza roles y responsabilidades sin fingir todavía una cuenta multiusuario.",
      body: teamMarkup()
    },
    empresa: {
      eyebrow: "Espacio de trabajo · Mi empresa",
      title: "Perfil de empresa",
      intro: "La ficha que permitirá contrastar una oportunidad con capacidades, solvencia y proximidad.",
      body: `<div class="route-grid"><article class="route-card route-card-accent"><span>ESTADO DEL PERFIL</span><strong>${profile.percentage}% preparado · ${profile.completed}/${profile.total} bloques</strong><div class="route-progress"><i style="width:${profile.percentage}%"></i></div><p>Datos declarados por el espacio. Se usan para explicar coincidencias y carencias, no para dictaminar aptitud.</p><a href="#ajustes">Completar perfil →</a></article><article class="route-card"><span>QUÉ CAMBIA LA DECISIÓN</span><strong>Solvencia, medios y asociación</strong><p>El perfil debe ayudarte a saber qué puedes demostrar, qué te falta y cuándo necesitas colaborar con otra empresa.</p><a href="#ajustes">Editar datos de encaje →</a></article></div><section class="route-section"><div class="route-section-heading"><div><p class="eyebrow eyebrow-muted">CONTROL DEL PERFIL</p><h2>Bloques pendientes</h2></div><span class="count-label">${profile.total - profile.completed} por completar</span></div><div class="profile-checklist">${profile.blocks.map(([label, value]) => `<div class="profile-check-row"><span class="profile-check ${String(value || "").trim() ? "profile-check-done" : ""}">${String(value || "").trim() ? "✓" : "○"}</span><span><strong>${escapeHtml(label)}</strong><small>${String(value || "").trim() ? "Declarado en el perfil" : "Pendiente de validar"}</small></span></div>`).join("")}</div></section>`
    },
    buscar: {
      eyebrow: "Oportunidades · Fuente oficial",
      title: "Buscar en PLACSP",
      intro: PliegoCloud.demo ? "Explora una muestra fija de licitaciones reales de PLACSP. No se actualiza automáticamente. Contrasta documentos y plazos con el expediente oficial." : "Licitaciones reales de la Plataforma de Contratación del Sector Público, actualizadas automáticamente. Crea un expediente para archivar sus pliegos y vigilar cambios.",
      body: ""
    },
    privacidad: {
      eyebrow: "Ajustes · Privacidad",
      title: "Privacidad y proveedores",
      intro: "Qué datos trata LicitIA, quién los recibe y cómo exportarlos o borrarlos.",
      body: ""
    },
    pruebas: {
      eyebrow: "Espacio de trabajo · Notas de prueba",
      title: "Notas y aprendizaje",
      intro: "Lugar para registrar qué hemos probado, qué ha fallado y qué debe cambiar.",
      body: `<section class="route-note note-composer"><div class="route-section-heading"><div><span>REGISTRAR APRENDIZAJE</span><h2>Añadir una nota de benchmark</h2></div><span class="example-label">Compartidas con el espacio</span></div><form data-note-form class="note-form"><label class="field"><span>Tipo</span><select name="kind"><option>Hallazgo</option><option>Problema</option><option>Decisión</option><option>Pregunta</option><option>Regla</option></select></label><label class="field field-wide"><span>Qué hemos aprendido</span><textarea name="text" rows="3" required placeholder="Ej. La persona buscó la fecha de presentación antes que el importe…"></textarea></label><label class="field"><span>Oportunidad relacionada</span><select name="opportunityId"><option value="">General</option>${opportunities.map((item) => `<option value="${escapeAttribute(item.id)}">${escapeHtml(item.title)}</option>`).join("")}</select></label><div class="modal-actions"><button class="button button-dark" type="submit">Guardar nota</button></div></form></section><section class="route-section"><div class="route-section-heading"><div><p class="eyebrow eyebrow-muted">DIARIO DEL MVP</p><h2>Lo que sabemos hasta ahora</h2></div><span class="count-label">${notes.length} notas</span></div><div class="notes-board">${notes.length ? notes.map((note) => `<article class="route-note note-entry"><div class="note-entry-top"><span>${escapeHtml(note.kind || "Nota")}</span><time>${escapeHtml(formatDate(new Date(note.createdAt)))}</time></div><p>${escapeHtml(note.text)}</p>${note.opportunityId ? `<small>Relacionado con: ${escapeHtml(opportunities.find((item) => item.id === note.opportunityId)?.title || "oportunidad")}</small>` : `<small>Nota general del producto</small>`}${PliegoCloud.can("editor") ? `<button class="text-button note-delete" data-note-delete="${escapeAttribute(note.id)}" type="button">Eliminar</button>` : ""}</article>`).join("") : `<div class="empty-list"><strong>Todavía no hay notas.</strong><span>Registra la primera observación de una prueba.</span></div>`}</div></section>`
    },
    ajustes: {
      eyebrow: "Espacio de trabajo · Ajustes",
      title: "Ajustes del prototipo",
      intro: "Cuenta, espacio, reglas y copias.",
      body: renderSettingsMarkup()
    }
  }[route];
  if (route === "expedientes") {
    const viewButtons = `<div class="workspace-view-switch" role="group" aria-label="Vista de expedientes"><button data-expedient-view="board" aria-pressed="${activeExpedientView === "board"}" type="button">Tablero de trabajo</button><button data-expedient-view="list" aria-pressed="${activeExpedientView === "list"}" type="button">Lista y filtros</button></div>`;
    routeData.body = viewButtons + (activeExpedientView === "board" ? PliegoClaroWorkspaceUI.board(opportunities) : routeData.body);
  }
  if (route === "empresa") routeData.body = `<div class="company-state"><span>${profile.completed}/${profile.total} bloques con datos declarados</span><a href="#equipo">Ver miembros y ${team.filter((m) => !m.isMember).length} roles de trabajo →</a></div>` + PliegoClaroWorkspaceUI.company(settings);
  if (route === "hoy") routeData.body = PliegoClaroWorkspaceUI.focus(selected) + PliegoFeatures.alertsMarkup(opportunities) + routeData.body;
  if (route === "buscar") routeData.body = PliegoFeatures.searchMarkup(settings, opportunities);
  if (route === "equipo") routeData.body = PliegoFeatures.membersMarkup() + routeData.body;
  if (route === "privacidad") routeData.body = PliegoFeatures.privacyMarkup();
  routeElement.innerHTML = route === "ajustes" ? routeData.body : `<div class="route-header"><p class="eyebrow">${routeData.eyebrow}</p><h1>${routeData.title}</h1><p class="route-intro">${routeData.intro}</p></div>${routeData.body}`;
  routeElement.querySelectorAll("[data-expedient-view]").forEach((button) => button.addEventListener("click", () => { activeExpedientView = button.dataset.expedientView; renderRoute(); }));
  if (route === "buscar") PliegoFeatures.bindSearch(routeElement);
  if (route === "equipo") PliegoFeatures.bindMembers(routeElement);
  if (route === "ajustes") PliegoFeatures.bindAccount(routeElement, opportunities, settings);
  routeElement.querySelector("[data-company-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const next = { ...settings, ...Object.fromEntries(PliegoClaroWorkspaceUI.profileFields.map(([key]) => [key, String(data.get(key) || "").trim()])) };
    if (await persistSettings(next, "Perfil guardado. Son datos declarados, no certificados verificados.")) render();
    else if (form.isConnected) form.querySelector("[data-company-error]").textContent = "No se ha guardado. Revisa la conexión y vuelve a intentarlo.";
  });
  routeElement.querySelectorAll("[data-open-opportunity]").forEach((button) => button.addEventListener("click", () => {
    selectedId = button.dataset.openOpportunity;
    activeDetailTab = button.dataset.openTab || "summary";
    window.location.hash = "oportunidades";
  }));
  routeElement.querySelectorAll("[data-radar-open]").forEach((marker) => {
    const openMarker = () => {
      selectedId = marker.dataset.radarOpen;
      activeDetailTab = "summary";
      window.location.hash = "oportunidades";
    };
    marker.addEventListener("click", openMarker);
    marker.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openMarker(); }
    });
  });
  routeElement.querySelectorAll("[data-task-complete]").forEach((button) => button.addEventListener("click", () => completeTask(button.dataset.taskComplete)));
  routeElement.querySelectorAll("[data-expedient-filter]").forEach((button) => button.addEventListener("click", () => {
    activeExpedientFilter = button.dataset.expedientFilter;
    renderRoute();
  }));
  routeElement.querySelectorAll("[data-task-filter]").forEach((button) => button.addEventListener("click", () => {
    activeTaskFilter = button.dataset.taskFilter;
    renderRoute();
  }));
  routeElement.querySelectorAll("[data-draft-retry]").forEach((button) => button.addEventListener("click", () => retryDraft(button.dataset.draftRetry)));
  routeElement.querySelectorAll("[data-draft-discard]").forEach((button) => button.addEventListener("click", () => {
    if (!window.confirm("Se descartará el borrador de este navegador. La versión del servidor no cambia. ¿Descartar?")) return;
    PliegoCloud.clearDraft(button.dataset.draftDiscard);
    renderRoute();
  }));
  routeElement.querySelector("[data-note-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const text = String(formData.get("text") || "").trim();
    if (!text) return;
    const saved = await guarded(() => PliegoCloud.addNote({ id: `note-${crypto.randomUUID()}`, kind: String(formData.get("kind") || "Nota"), text, opportunityId: String(formData.get("opportunityId") || "") }), "No se pudo guardar la nota.");
    if (!saved) return;
    notes.unshift(saved);
    showToast("Nota guardada en el espacio.");
    renderRoute();
  });
  routeElement.querySelectorAll("[data-note-delete]").forEach((button) => button.addEventListener("click", async () => {
    const note = notes.find((entry) => entry.id === button.dataset.noteDelete);
    if (!note || !window.confirm("La nota irá a la papelera del espacio (recuperable desde Ajustes). ¿Eliminar?")) return;
    if (await guarded(() => PliegoCloud.trashNote(note).then(() => true), "No se pudo eliminar la nota.")) {
      notes = notes.filter((entry) => entry.id !== note.id);
      showToast("Nota en la papelera.");
      renderRoute();
    }
  }));
  routeElement.querySelector("[data-team-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const role = String(formData.get("role") || "").trim();
    if (!name || !role) return;
    const saved = await guarded(() => PliegoCloud.addRole({ id: `role-${crypto.randomUUID()}`, name, role, note: "Rol de trabajo · no da acceso a la cuenta" }), "No se pudo añadir el rol.");
    if (!saved) return;
    team.push(saved);
    showToast("Rol añadido. No concede acceso: para eso, invita a la persona.");
    renderRoute();
  });
  routeElement.querySelectorAll("[data-team-delete]").forEach((button) => button.addEventListener("click", async () => {
    const role = team.find((member) => member.id === button.dataset.teamDelete);
    if (!role || role.isMember) return;
    if (await guarded(() => PliegoCloud.trashRole(role).then(() => true), "No se pudo quitar el rol.")) {
      team = team.filter((member) => member.id !== role.id);
      showToast("Rol quitado. Las tareas asignadas muestran «Responsable retirado».");
      renderRoute();
    }
  }));
  routeElement.querySelector("[data-route-reset]")?.addEventListener("click", () => addExamples());
  routeElement.querySelectorAll("[data-setting]").forEach((control) => control.addEventListener("change", async () => {
    const value = control.type === "checkbox" ? control.checked : control.value;
    const next = { ...settings, [control.dataset.setting]: value };
    if (await persistSettings(next)) { renderMetrics(); document.documentElement.dataset.density = settings.density; }
    else { if (control.type === "checkbox") control.checked = !value; else control.value = settings[control.dataset.setting]; }
  }));
  routeElement.querySelector("[data-settings-defaults]")?.addEventListener("click", async () => {
    if (!window.confirm("Se sustituirá el perfil de empresa y las preferencias de este espacio por los valores iniciales. Exporta una copia antes si quieres conservarlos. ¿Restaurar ajustes?")) { showToast("Cancelado. No se ha cambiado nada."); return; }
    if (await persistSettings({ ...defaultSettings, workspaceName: settings.workspaceName }, "Ajustes restaurados.")) render();
  });
  routeElement.querySelector("[data-export-local]")?.addEventListener("click", () => exportWorkspace());
  routeElement.querySelector("[data-export-full]")?.addEventListener("click", () => exportFull());
  routeElement.querySelector("[data-import-local]")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    importBackupFile(file);
  });
}

function selectOpportunity(id) {
  selectedId = id;
  editingDocumentId = "";
  editingRequirementIndex = null;
  render();
  if (window.matchMedia("(max-width: 1050px)").matches) document.querySelector("#detailPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function escapeAttribute(value = "") { return escapeHtml(value).replace(/`/g, "&#96;"); }

function safeHttpUrl(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch (error) {
    return "";
  }
}

document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter;
  render();
}));

window.addEventListener("hashchange", renderRoute);

document.querySelector("#globalSearch")?.addEventListener("input", (event) => {
  searchQuery = event.target.value.trim();
  if (searchQuery && currentRoute() !== "oportunidades") {
    window.location.hash = "oportunidades";
    return;
  }
  renderList();
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    document.querySelector("#globalSearch")?.focus();
  }
});

const dialog = document.querySelector("#addDialog");
const closeDialog = () => { dialog.hidden = true; };
document.querySelector("#openAdd").addEventListener("click", () => {
  dialog.hidden = false;
  dialog.querySelector("input[name='title']").focus();
});
document.querySelector("#closeAdd").addEventListener("click", closeDialog);
document.querySelector("#cancelAdd").addEventListener("click", closeDialog);
dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !dialog.hidden) closeDialog(); });
document.querySelector("#addForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const title = String(formData.get("title") || "").trim();
  if (!title) return;
  if (!PliegoCloud.can("editor")) { showToast("Tu permiso en este espacio es de lectura."); return; }
  const id = `custom-${crypto.randomUUID()}`;
  let source, deadlineDate;
  try {
    source = PliegoClaroWorkflow.url(formData.get("source"));
    deadlineDate = PliegoClaroWorkflow.date(formData.get("deadlineDate")) || null;
  } catch (error) { showToast(error.message); return; }
  // Si el enlace es de PLACSP y la licitación está en la muestra oficial, se usa la ficha oficial.
  if (source && /contrataciondel(estado|sectorpublico)/.test(source)) {
    const found = await guarded(() => PliegoFeatures.findOfficial(source), "");
    if (found?.length) {
      closeDialog();
      form.reset();
      await createFromTender(found[0]);
      return;
    }
  }
  const now = new Date().toISOString();
  const added = {
    id,
    title,
    organization: String(formData.get("organization") || "Sin organismo").trim(),
    amount: String(formData.get("amount") || "").trim() || "Por confirmar",
    deadline: String(formData.get("deadline") || "").trim() || "Por confirmar",
    deadlineDate,
    sector: String(formData.get("sector") || "").trim() || "Sin clasificar",
    decision: settings.defaultDecision === "GO" ? "REVISAR" : settings.defaultDecision,
    fit: "Por comprobar",
    source,
    sourceLabel: source ? "Fuente aportada · sin vigilancia automática" : "Fuente pendiente",
    summary: "Caso añadido manualmente. Completa los requisitos y la fuente después de revisar el expediente.",
    why: [],
    nextStep: "Archivar el pliego y añadir los tres requisitos que más pueden cambiar la decisión.",
    nextDate: "Primera revisión pendiente",
    nextStepDone: false,
    requirements: [
      { id: crypto.randomUUID(), text: "Requisito decisivo por identificar", source: "Pendiente de leer el expediente", status: "unknown" },
      { id: crypto.randomUUID(), text: "Evidencia de la empresa por comprobar", source: "Pendiente de asociar documento", status: "unknown" }
    ],
    history: [{ label: "Expediente añadido manualmente", detail: "Datos aportados por una persona; pendientes de contrastar con la fuente oficial.", at: now }]
  };
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  const saved = await guarded(() => PliegoCloud.createExpediente(added), "No se pudo guardar. Conserva el formulario y vuelve a intentarlo.");
  button.disabled = false;
  if (!saved) return;
  opportunities = [added, ...opportunities];
  selectedId = id;
  activeFilter = "all";
  setSaveStatus("saved");
  render();
  closeDialog();
  form.reset();
  showToast("Oportunidad guardada en el espacio.");
});

async function createFromTender(tender) {
  const existing = Object.entries(PliegoCloud.state.meta).find(([, meta]) => meta.tenderId === tender.id);
  if (existing) { selectedId = existing[0]; activeDetailTab = "summary"; window.location.hash = "oportunidades"; render(); showToast("Ya tienes este expediente: no se duplica."); return; }
  const item = PliegoFeatures.expedienteFromTender(tender, settings);
  try {
    await PliegoCloud.createExpediente(item, tender.id);
  } catch (error) {
    if (error.kind === "duplicate") { await reloadWorkspace(); render(); showToast("Este expediente ya existía en el espacio."); return; }
    throw error;
  }
  opportunities = [normalizeExpediente(item), ...opportunities];
  selectedId = item.id;
  activeDetailTab = "documents";
  window.location.hash = "oportunidades";
  render();
  showToast(item.official.historic ? "Expediente histórico creado: sin plazo vigente ni avisos de presentación." : "Expediente creado desde PLACSP. Archiva ahora el PCAP y el PPT.");
}

async function addExamples() {
  const missing = seedOpportunities.filter((seed) => !opportunities.some((item) => item.id === seed.id));
  if (!missing.length) { showToast("Los casos de práctica ya están en el espacio."); return; }
  if (!window.confirm(`Se añadirán ${missing.length} casos de práctica marcados como EJEMPLO. No se borra ni sustituye nada. ¿Añadir?`)) { showToast("Cancelado. No se ha cambiado nada."); return; }
  let added = 0;
  for (const seed of missing) {
    const item = { ...structuredClone(seed), title: seed.title.startsWith("[EJEMPLO]") ? seed.title : `[EJEMPLO] ${seed.title}`, sourceLabel: `${seed.sourceLabel} · caso de práctica`, history: [{ label: "Caso de práctica añadido", detail: "Sirve para probar el flujo; no es una oportunidad vigente.", at: new Date().toISOString() }] };
    if (await guarded(() => PliegoCloud.createExpediente(item), "No se pudo añadir un caso de práctica.")) { opportunities.push(normalizeExpediente(item)); added += 1; }
  }
  render();
  showToast(added === missing.length ? `${added} casos de práctica añadidos.` : `Solo se añadieron ${added} de ${missing.length} casos: el resto no se guardó en el servidor. Los datos anteriores se han conservado.`);
}

async function retryDraft(clientId) {
  const draft = PliegoCloud.drafts().find((entry) => entry.item.id === clientId);
  if (!draft) return;
  if (draft.reason === "conflict" && !window.confirm("Tu borrador sustituirá la versión actual del servidor, incluidos los cambios que otra persona guardó después. Quedará registrado en el historial. ¿Continuar?")) return;
  const item = structuredClone(draft.item);
  recordHistory(item, draft.reason === "conflict" ? "Borrador aplicado sobre una versión posterior" : "Borrador guardado tras un error", "Cambio recuperado desde este navegador.");
  try {
    await PliegoCloud.saveExpediente(item, { force: draft.reason === "conflict" });
    opportunities = opportunities.map((entry) => entry.id === item.id ? normalizeExpediente(item) : entry);
    setSaveStatus("saved");
    render();
    showToast("Borrador guardado en el servidor.");
  } catch (error) { setSaveStatus("error", error.message); await handleSaveFailure(error, clientId); renderRoute(); }
}

function exportWorkspace() {
  guarded(async () => {
    const extras = await PliegoCloud.exportExtras();
    const payload = { ...currentBase(), cloud: { ...extras, documents: extras.documents.map(({ storage_path, ...rest }) => rest) }, notice: "Exportación de datos. Los archivos originales NO van dentro: usa «Copia completa (.zip)» para conservarlos." };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pliego-claro-${(extras.workspace.name || "espacio").replace(/[^\w]+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Copia del espacio exportada.");
    return true;
  }, "No se pudo exportar.");
}

function currentBase() {
  return { format: "pliego-claro-mvp", version: 2, exportedAt: new Date().toISOString(), opportunities, settings, team: team.filter((member) => !member.isMember).map(({ id, name, role, note }) => ({ id, name, role, note })), notes: notes.map(({ id, kind, text, opportunityId, createdAt }) => ({ id, kind, text, opportunityId, createdAt })) };
}

async function exportFull() {
  const status = (message) => setSaveStatus("saving", message) || (document.querySelector("#saveStatus").textContent = message);
  return guarded(async () => {
    const { blob, manifest, name } = await PliegoFullBackup.exportFull(currentBase(), status);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setSaveStatus("idle");
    const failed = manifest.files.filter((f) => !f.zipPath || f.verified === false);
    showToast(failed.length ? `Copia descargada, pero ${failed.length} originales no se pudieron incluir o verificar: revisa manifiesto.json.` : `Copia completa descargada: ${manifest.counts.expedientes} expedientes y ${manifest.counts.documentos} originales verificados.`);
    return true;
  }, "No se pudo generar la copia completa.");
}

async function importFullFile(file) {
  if (file.size > 300 * 1024 * 1024) { showToast("La copia supera 300 MB. No se ha modificado nada."); return; }
  const status = (message) => { const el = document.querySelector("#saveStatus"); if (el) el.textContent = message; };
  status("Verificando copia…");
  let pack, restored;
  try {
    const JSZip = await PliegoFullBackup.loadJSZip();
    pack = await PliegoFullBackup.readPackage(JSZip, file);
    restored = PliegoClaroBackup.validate(pack.payload, { notes: [], team: [] }, defaultSettings);
  } catch (error) { setSaveStatus("idle"); showToast(`No se ha podido importar: ${error.message}`); return; }
  const duplicates = restored.opportunities.filter((item) => opportunities.some((entry) => entry.id === item.id));
  const counts = pack.manifest.counts;
  const summary = `Copia completa de «${pack.manifest.workspace}» (${new Date(pack.manifest.createdAt).toLocaleString("es-ES")}), huellas verificadas:
· ${counts.expedientes} expedientes (${duplicates.length} ya existen aquí) · ${counts.notas} notas · ${counts.roles} roles
· ${counts.documentos} originales · ${counts.paginas} páginas de texto · ${counts.comentarios} comentarios

No se recrean usuarios ni permisos: vuelve a invitar a las personas. No se borra nada del espacio actual.`;
  let mode = "skip";
  if (duplicates.length) {
    const answer = window.prompt(`${summary}

¿Qué hacemos con los ${duplicates.length} duplicados?
  OMITIR → conservar los del espacio (recomendado)
  COPIA  → importarlos como copias nuevas`, "OMITIR");
    if (answer === null) { setSaveStatus("idle"); showToast("Importación cancelada. No se ha cambiado nada."); return; }
    mode = /^copia/i.test(answer.trim()) ? "copy" : "skip";
  } else if (!window.confirm(`${summary}

¿Restaurar en el espacio actual?`)) { setSaveStatus("idle"); showToast("Importación cancelada. No se ha cambiado nada."); return; }
  const before = { expedientes: opportunities.length, notas: notes.length };
  const result = await guarded(() => PliegoCloud.importBackup({ ...pack.payload, opportunities: restored.opportunities, notes: restored.notes, team: restored.team, settings: restored.settings }, mode, window.confirm("¿Aplicar también el perfil de empresa y los ajustes de la copia?")), "No se pudo importar. No se ha cambiado nada.");
  if (!result) { setSaveStatus("idle"); return; }
  await reloadWorkspace();
  const { report, docMap } = await PliegoFullBackup.restoreFiles(pack, result.mapping || {}, status);
  // Las referencias de los expedientes restaurados apuntan ahora a los originales nuevos.
  for (const [oldId, target] of Object.entries(result.mapping || {})) {
    if (!target.imported) continue;
    const item = opportunities.find((entry) => entry.id === target.id);
    if (item && PliegoFullBackup.remapStoredDocuments(item, docMap)) await guarded(() => PliegoCloud.saveExpediente(item), "No se pudo actualizar una referencia documental.");
  }
  await reloadWorkspace();
  render();
  setSaveStatus("saved");
  window.alert(`Restauración terminada.
Expedientes: ${before.expedientes} → ${opportunities.length} (${result.expedientes} nuevos, ${result.expedientesOmitidos} omitidos)
Notas: ${before.notas} → ${notes.length}
Originales restaurados: ${report.documentos} (huella comprobada) · ya existentes u omitidos: ${report.omitidos}
Páginas de texto: ${report.paginas} · Comentarios: ${report.comentarios}
${report.errores.length ? `
Incidencias:
${report.errores.join("\n")}` : ""}
Abre un expediente y comprueba un original, una evidencia y una tarea.`);
}

function importBackupFile(file) {
  if (/\.zip$/i.test(file.name)) { importFullFile(file); return; }
  if (file.size > 5 * 1024 * 1024) { showToast("La copia supera 5 MB. No se ha modificado nada."); return; }
  const reader = new FileReader();
  reader.addEventListener("load", async () => {
    let payload, restored;
    try {
      payload = JSON.parse(String(reader.result));
      restored = PliegoClaroBackup.validate(payload, { notes: [], team: [] }, defaultSettings);
    } catch (error) { showToast(`No se ha podido importar: ${error.message} No se ha cambiado nada.`); return; }
    restored.opportunities = restored.opportunities.map((item) => ({ ...item, source: safeHttpUrl(item.source), why: item.why || [] }));
    restored.opportunities.forEach((item) => { if (PliegoClaroWorkflow.reopenDecision(item)) recordHistory(item, "GO importado pendiente de revisión", "La copia se conserva, pero no contiene evidencias decisivas trazables para mantener GO."); });
    const duplicates = restored.opportunities.filter((item) => opportunities.some((entry) => entry.id === item.id));
    const before = { expedientes: opportunities.length, notas: notes.length, roles: team.filter((m) => !m.isMember).length };
    const summary = `Vista previa de la copia «${file.name}»:\n· ${restored.opportunities.length} expedientes (${duplicates.length} ya existen en este espacio)\n· ${restored.notes.length} notas · ${restored.team.length} roles\n· Ejemplo: «${restored.opportunities[0]?.title}» con ${restored.opportunities[0]?.requirements?.length || 0} requisitos.\n\nNo se borra nada del espacio ni del archivo original.`;
    let mode = "skip";
    if (duplicates.length) {
      const answer = window.prompt(`${summary}\n\n¿Qué hacemos con los ${duplicates.length} duplicados? Escribe:\n  OMITIR  → conservar los del espacio (recomendado)\n  COPIA   → importarlos como copias nuevas`, "OMITIR");
      if (answer === null) { showToast("Importación cancelada. No se ha cambiado nada."); return; }
      mode = /^copia/i.test(answer.trim()) ? "copy" : "skip";
    } else if (!window.confirm(`${summary}\n\n¿Importar al espacio actual?`)) { showToast("Importación cancelada. No se ha cambiado nada."); return; }
    const applySettings = window.confirm("¿Aplicar también el perfil de empresa y los ajustes de la copia? (Aceptar = sí, Cancelar = conservar los actuales)");
    const result = await guarded(() => PliegoCloud.importBackup({ ...payload, opportunities: restored.opportunities, notes: restored.notes, team: restored.team, settings: restored.settings }, mode, applySettings), "No se pudo importar. No se ha cambiado nada.");
    if (!result) return;
    await reloadWorkspace();
    render();
    const after = { expedientes: opportunities.length, notas: notes.length, roles: team.filter((m) => !m.isMember).length };
    window.alert(`Importación completada.\nExpedientes: ${before.expedientes} → ${after.expedientes} (${result.expedientes} nuevos, ${result.expedientesOmitidos} omitidos)\nNotas: ${before.notas} → ${after.notas}\nRoles: ${before.roles} → ${after.roles}\n\nAbre un expediente importado y comprueba una evidencia, una decisión y una asignación.`);
  });
  reader.addEventListener("error", () => showToast("No se pudo leer la copia. No se ha modificado nada."));
  reader.readAsText(file);
}

// ---------------------------------------------------------------- arranque y sesión
async function reloadWorkspace() {
  const data = await PliegoCloud.loadWorkspaceData();
  opportunities = data.opportunities.map(normalizeExpediente);
  settings = { ...defaultSettings, ...data.settings };
  notes = data.notes;
  team = [...data.members.map((member) => ({ id: `member-${member.userId}`, userId: member.userId, name: member.name || member.email, role: { owner: "Titular", admin: "Administración", editor: "Edición", viewer: "Lectura" }[member.role], note: "Miembro con cuenta", isMember: true })), ...data.team];
  if (!opportunities.some((item) => item.id === selectedId)) selectedId = opportunities[0]?.id || "";
}

let booting = null;
async function boot(preferredWorkspace) {
  if (booting) return booting;
  booting = (async () => {
    document.body.classList.add("app-loading");
    try {
      const session = await PliegoCloud.currentSession();
      if (!session) { PliegoAuthUI.show("login", PliegoAuthUI.linkErrorFromUrl()); return; }
      if (/type=recovery/.test(globalThis.PLIEGO_INITIAL_HASH || "")) { globalThis.PLIEGO_INITIAL_HASH = ""; PliegoAuthUI.show("recovery"); return; }
      await PliegoFeatures.acceptInvitationFromUrl();
      await PliegoCloud.loadWorkspaces();
      const ws = PliegoCloud.chooseWorkspace(preferredWorkspace);
      await reloadWorkspace();
      await PliegoFeatures.onWorkspaceLoaded();
      PliegoCloud.subscribe(onRemoteChange);
      const user = PliegoCloud.state.user;
      const me = PliegoCloud.state.members.find((member) => member.userId === user.id);
      const initials = (me?.name || user.email).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
      document.querySelector(".avatar").textContent = initials;
      document.querySelector(".avatar").setAttribute("aria-label", `Sesión de ${me?.name || user.email}`);
      document.querySelector("[data-workspace-mode]").textContent = `${ws.name} · ${{ owner: "Titular", admin: "Administración", editor: "Edición", viewer: "Lectura" }[ws.role]}`;
      document.body.classList.toggle("read-only", !PliegoCloud.can("editor"));
      if (PliegoCloud.demo) showDemoBanner();
      setSaveStatus("idle");
      PliegoAuthUI.hide();
      openDocumentFromHash();
      render();
    } catch (error) {
      if (error.kind === "session") { PliegoAuthUI.show("expired"); return; }
      PliegoCloud.reportClientError(error.message, "boot");
      showToast(error.message || "No se pudo cargar el espacio.");
      setSaveStatus("error", error.message);
    } finally { document.body.classList.remove("app-loading"); booting = null; }
  })();
  return booting;
}

function showDemoBanner() {
  if (!document.querySelector(".demo-banner")) {
    const banner = document.createElement("div");
    banner.className = "demo-banner";
    banner.innerHTML = '<strong>Demostración · guardado local.</strong><span>IA, equipo y correos simulados. Usa datos de prueba.</span><a href="web/privacidad.html">Datos y privacidad</a>';
    document.body.insertBefore(banner, document.querySelector(".app-shell"));
  }
  const stamp = document.querySelector(".release-stamp");
  if (stamp) { stamp.textContent = "Entorno de demostración"; stamp.title = "Datos guardados en este navegador. Licitaciones reales de PLACSP (muestra del 8 oct 2026)."; }
}

async function onRemoteChange(table, payload) {
  if (table === "alerts") { await PliegoFeatures.loadAlerts(); renderRoute(); renderMetrics(); return; }
  const row = payload.new || {};
  if (!row.client_id || savingIds.has(row.client_id)) return;
  if (row.deleted_at) {
    opportunities = opportunities.filter((item) => item.id !== row.client_id);
    delete PliegoCloud.state.meta[row.client_id];
    render();
    return;
  }
  if (!PliegoCloud.remoteVersionIsNewer(row.client_id, row.version || 0)) return;
  const latest = await PliegoCloud.fetchExpediente(row.client_id).catch(() => null);
  if (!latest) return;
  const isNew = !opportunities.some((item) => item.id === row.client_id);
  opportunities = isNew ? [normalizeExpediente(latest), ...opportunities] : opportunities.map((item) => item.id === row.client_id ? normalizeExpediente(latest) : item);
  editingDocumentId = row.client_id === selectedId ? "" : editingDocumentId;
  render();
  if (row.client_id === selectedId) showToast("Este expediente se ha actualizado desde otra pestaña o persona.");
}

function openDocumentFromHash() {
  const match = window.location.hash.match(/^#documento=([0-9a-f-]{36})(?:&pagina=(\d+))?/);
  if (!match) return;
  window.history.replaceState(null, "", `${window.location.pathname}#oportunidades`);
  guarded(async () => {
    const doc = await PliegoCloud.run(PliegoCloud.client.from("documents").select("*").eq("id", match[1]).maybeSingle(), "No se pudo abrir el documento.");
    if (!doc) { showToast("Documento no disponible en tus espacios."); return; }
    await PliegoFeatures.showPages(doc, Number(match[2] || 0));
  }, "No se pudo abrir el documento.");
}

async function signOut() {
  opportunities = []; notes = []; team = []; selectedId = "";
  await PliegoCloud.signOut();
  render();
  PliegoAuthUI.show("login", "Has cerrado la sesión.");
}

globalThis.PliegoApp = {
  toast: showToast,
  rerender: () => render(),
  rerenderDetail: () => { if (currentRoute() === "oportunidades") renderDetail(); else renderRoute(); },
  commit: commitExpediente,
  history: recordHistory,
  tasksFor: (item) => taskItems(item),
  economicStatus: (item) => { const analysis = economicAnalysis(item); return `${analysis.status}. ${analysis.complete ? `Escenario probable: ${formatEuros(analysis.scenarios[1].result)}.` : `Faltan ${analysis.missing.length} bloques de coste; un coste desconocido no se cuenta como cero.`}`; },
  createFromTender,
  exportFull,
  reloadWorkspace,
  boot,
  signOut
};

window.addEventListener("hashchange", () => { if (/^#documento=/.test(window.location.hash)) openDocumentFromHash(); });
window.addEventListener("online", () => setSaveStatus("idle"));
window.addEventListener("offline", () => setSaveStatus("offline"));
window.addEventListener("error", (event) => PliegoCloud.reportClientError(event.message, "window"));
PliegoAuthUI.init(() => boot());
PliegoCloud.onAuthChange((event) => {
  if (event === "PASSWORD_RECOVERY") { PliegoAuthUI.show("recovery"); return; }
  if (event === "SIGNED_OUT" && opportunities.length && !PliegoAuthUI.isOpen()) PliegoAuthUI.show("expired");
});
if (!PliegoCloud.configured) PliegoAuthUI.show("config");
else boot();
