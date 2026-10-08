/* Manual expediente workflow. No API calls or document transmission. */
(() => {
  const text = (value) => String(value ?? "").trim();
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  function url(value) {
    if (!text(value)) return "";
    let parsed;
    try { parsed = new URL(text(value)); } catch (_) { throw new Error("El enlace debe ser una URL completa http o https."); }
    check(["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password, "El enlace no es seguro o contiene credenciales.");
    return parsed.href;
  }
  function date(value) {
    const input = text(value);
    if (!input) return "";
    check(/^\d{4}-\d{2}-\d{2}$/.test(input) && !Number.isNaN(Date.parse(input)) && new Date(input).toISOString().slice(0, 10) === input, "La fecha no es válida.");
    return input;
  }
  function document(input, id, now) {
    check(text(input.name), "Añade el nombre del documento.");
    const link = url(input.url);
    check(["PCAP", "PPT", "Anexo", "Aclaración", "Otro"].includes(input.kind), "Tipo de documento no válido.");
    check(!input.reviewed || link, "Para registrar una revisión hace falta el enlace al documento.");
    return { id, name: text(input.name), kind: input.kind, url: link, version: text(input.version), reviewedAt: input.reviewed ? now : "", registeredAt: now };
  }
  // Fecha de hoy en Madrid (AAAA-MM-DD): los plazos y vigencias se comparan en esa zona.
  function today() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
  function expired(requirement, on = today()) {
    return Boolean(text(requirement.evidenceValidUntil) && requirement.evidenceValidUntil < on);
  }
  function hasEvidence(requirement, documents = [], on = today()) {
    const source = documents.find((entry) => entry.id === requirement.documentId);
    return Boolean(source && source.url && source.reviewedAt && source.reviewedAt === requirement.documentReviewedAt && source.url === requirement.sourceUrl && (source.version || "") === requirement.sourceVersion && text(requirement.citation) && text(requirement.companyEvidence) && requirement.verifiedAt && !expired(requirement, on));
  }
  function confirmed(requirement, documents = [], on = today()) {
    return requirement.status === "confirmed" && hasEvidence(requirement, documents, on);
  }
  function requirement(input, id, documents, now) {
    check(text(input.text), "Escribe el requisito que debe comprobarse.");
    check(["confirmed", "partial", "pending", "unknown"].includes(input.status), "Estado de requisito no válido.");
    const validUntil = date(input.evidenceValidUntil);
    const source = documents.find((entry) => entry.id === text(input.documentId));
    check(!text(input.documentId) || source, "El documento asociado ya no existe.");
    const result = {
      id, text: text(input.text), status: input.status, critical: input.critical !== false,
      documentId: source?.id || "", citation: text(input.citation),
      source: source ? `${source.kind} · ${source.name}${text(input.citation) ? ` · ${text(input.citation)}` : ""}` : "Fuente pendiente de asociar",
      companyEvidence: text(input.companyEvidence), evidenceUrl: url(input.evidenceUrl), evidenceValidUntil: validUntil,
      verifiedBy: input.status === "confirmed" ? text(input.verifiedBy) : "",
      documentReviewedAt: source?.reviewedAt || "", sourceUrl: source?.url || "", sourceVersion: source?.version || "",
      verifiedAt: input.status === "confirmed" ? now : ""
    };
    check(input.status !== "confirmed" || !expired(result), "La evidencia de la empresa está caducada: actualízala o guarda el requisito como parcial.");
    check(input.status !== "confirmed" || hasEvidence(result, documents), "Para confirmar: documento revisado, página o cláusula y evidencia de la empresa. Si falta algo, guarda como pendiente o parcial.");
    return result;
  }
  function deadlinePassed(item, on = today()) {
    return Boolean(item.deadlineDate && item.deadlineDate < on);
  }
  function canGo(item, on = today()) {
    if (deadlinePassed(item, on)) return false;
    const critical = (item.requirements || []).filter((entry) => entry.critical !== false);
    return critical.length > 0 && critical.every((entry) => confirmed(entry, item.documents, on));
  }
  function reopenDecision(item) {
    if (item.decision === "GO" && !canGo(item)) {
      item.decision = "REVISAR";
      delete item.decisionConfirmedAt;
      return true;
    }
    return false;
  }
  function plan(input, team, deadline) {
    const ownerId = text(input.ownerId);
    check(!ownerId || team.some((member) => member.id === ownerId), "Ese responsable ya no está en el equipo local.");
    const dueDate = date(input.dueDate);
    check(!dueDate || !deadline || dueDate <= deadline, "La fecha de tarea no puede ser posterior al cierre del expediente.");
    return { ownerId, dueDate, note: text(input.note) };
  }
  function editExpediente(item, input) {
    check(text(input.title) && text(input.organization), "Nombre y organismo son obligatorios.");
    const deadlineDate = date(input.deadlineDate) || null;
    const result = { ...item, title: text(input.title), organization: text(input.organization), amount: text(input.amount) || "Por confirmar", sector: text(input.sector) || "Sin clasificar", summary: text(input.summary), nextStep: text(input.nextStep), source: url(input.source), deadlineDate, deadline: deadlineDate ? "Fecha aportada · pendiente de contraste" : "Fecha por confirmar", sourceLabel: "Fuente aportada · revisión manual" };
    // Retain evidence, notes and tasks. Source, buyer or deadline changes need another decision.
    if (item.nextStep !== result.nextStep) result.nextStepDone = false;
    if ((item.deadlineDate !== deadlineDate || item.source !== result.source || item.organization !== result.organization) && item.decision === "GO") { result.decision = "REVISAR"; delete result.decisionConfirmedAt; }
    return result;
  }
  globalThis.PliegoClaroWorkflow = Object.freeze({ url, date, today, expired, deadlinePassed, document, requirement, confirmed, hasEvidence, canGo, reopenDecision, plan, editExpediente });
})();
