/* Local backups only: no network requests, credentials or paid services. */
(() => {
  const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const fail = (message) => { throw new Error(message); };
  const check = (condition, message) => { if (!condition) fail(message); };
  const validDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
  function rows(value, name, fields) {
    check(Array.isArray(value), `${name}: se esperaba una lista.`);
    const ids = new Set();
    value.forEach((row) => {
      check(isObject(row), `${name}: entrada no válida.`);
      fields.forEach((field) => check(typeof row[field] === "string", `${name}: falta ${field}.`));
      if (fields.includes("id")) {
        check(row.id.trim() !== "" && !ids.has(row.id), `${name}: identificador vacío o repetido.`);
        ids.add(row.id);
      }
    });
  }

  function validate(payload, current, defaults) {
    check(isObject(payload) && payload.format === "pliego-claro-mvp", "No es una copia de Pliego Claro.");
    const version = payload.version ?? 1;
    check([1, 2].includes(version), "Versión de copia no compatible.");
    rows(payload.opportunities, "Oportunidades", ["id", "title"]);
    check(payload.opportunities.length > 0, "La copia no contiene oportunidades.");
    payload.opportunities.forEach((item) => {
      check(item.title.trim() !== "", "Oportunidad sin título.");
      check(["GO", "REVISAR", "NO-GO"].includes(item.decision), "Decisión no válida.");
      rows(item.requirements, "Requisitos", ["text", "source", "status"]);
      check(item.requirements.every((row) => ["confirmed", "pending", "unknown"].includes(row.status)), "Estado de requisito no válido.");
      const requirementIds = new Set();
      item.requirements.forEach((row, index) => {
        ["id", "documentId", "citation", "companyEvidence", "evidenceUrl", "verifiedAt", "documentReviewedAt", "sourceUrl", "sourceVersion"].forEach((key) => check(row[key] === undefined || typeof row[key] === "string", `Requisito: ${key} no válido.`));
        check(row.critical === undefined || typeof row.critical === "boolean", "Requisito decisivo no válido.");
        const id = row.id || String(index);
        check(!requirementIds.has(id), "Identificadores de requisitos repetidos: podrían mezclar asignaciones.");
        requirementIds.add(id);
        ["verifiedAt", "documentReviewedAt"].forEach((key) => check(!row[key] || validDate(row[key]), "Fecha de evidencia no válida."));
        ["evidenceUrl", "sourceUrl"].forEach((key) => {
          if (!row[key]) return;
          let link;
          try { link = new URL(row[key]); } catch (_) { fail("Enlace de evidencia no válido."); }
          check(["https:", "http:"].includes(link.protocol) && !link.username && !link.password, "Enlace de evidencia no seguro.");
        });
      });
      if (item.documents !== undefined) {
        rows(item.documents, "Documentos", ["id", "name", "kind", "url", "version", "reviewedAt", "registeredAt"]);
        item.documents.forEach((doc) => {
          check(["PCAP", "PPT", "Anexo", "Aclaración", "Otro"].includes(doc.kind), "Tipo de documento no válido.");
          if (doc.url) {
            let link;
            try { link = new URL(doc.url); } catch (_) { fail("Enlace de documento no válido."); }
            check(["https:", "http:"].includes(link.protocol) && !link.username && !link.password, "Enlace de documento no seguro.");
          }
          check(validDate(doc.registeredAt) && (!doc.reviewedAt || (doc.url && validDate(doc.reviewedAt))), "Revisión documental no válida.");
        });
      }
      if (item.taskPlans !== undefined) {
        check(isObject(item.taskPlans), "Asignaciones no válidas.");
        Object.values(item.taskPlans).forEach((plan) => check(isObject(plan) && ["ownerId", "dueDate", "note"].every((key) => typeof plan[key] === "string") && (!plan.dueDate || /^\d{4}-\d{2}-\d{2}$/.test(plan.dueDate) && validDate(plan.dueDate) && new Date(plan.dueDate).toISOString().slice(0, 10) === plan.dueDate), "Asignación o fecha no válida."));
      }
      check(item.decisionReason === undefined || typeof item.decisionReason === "string", "Motivo de decisión no válido.");
      check(item.decisionConfirmedAt === undefined || validDate(item.decisionConfirmedAt), "Fecha de decisión no válida.");
      if (item.deadlineDate) {
        check(/^\d{4}-\d{2}-\d{2}$/.test(item.deadlineDate) && validDate(item.deadlineDate) && new Date(item.deadlineDate).toISOString().slice(0, 10) === item.deadlineDate, "Fecha límite no válida.");
      }
      if (item.why !== undefined) check(Array.isArray(item.why) && item.why.every((text) => typeof text === "string"), "Motivos no válidos.");
      if (item.events !== undefined) {
        rows(item.events, "Cambios", ["id", "label", "kind", "detail", "at"]);
        check(item.events.every((row) => validDate(row.at) && typeof row.reviewed === "boolean" && typeof row.requiresReview === "boolean"), "Cambio o fecha no válidos.");
      }
      if (item.history !== undefined) {
        rows(item.history, "Historial", ["label", "detail", "at"]);
        check(item.history.every((row) => validDate(row.at)), "Fecha de historial no válida.");
      }
      if (item.offerChecklist !== undefined) {
        rows(item.offerChecklist, "Checklist", ["id", "label", "status"]);
        check(item.offerChecklist.every((row) => ["pending", "completed", "blocked"].includes(row.status) && typeof row.approvalRequired === "boolean"), "Checklist no válido.");
        check(item.offerChecklist.filter((row) => /signature$/.test(row.id)).every((row) => row.status === "blocked"), "La firma no puede desbloquearse mediante una copia.");
      }
      if (item.economicInputs !== undefined) check(isObject(item.economicInputs) && Object.values(item.economicInputs).every((value) => typeof value === "string" || (typeof value === "number" && Number.isFinite(value)) || value === null), "Costes no válidos.");
      if (item.territory !== undefined) check(isObject(item.territory), "Territorio no válido.");
    });
    check(isObject(payload.settings), "Ajustes no válidos.");
    const settings = { ...defaults };
    Object.keys(defaults).forEach((key) => {
      if (!Object.hasOwn(payload.settings, key)) return;
      check(typeof payload.settings[key] === typeof defaults[key], `Ajuste no válido: ${key}.`);
      settings[key] = payload.settings[key];
    });
    check(["GO", "REVISAR", "NO-GO"].includes(settings.defaultDecision), "Decisión inicial no válida.");
    check(["compact", "comfortable"].includes(settings.density), "Densidad no válida.");
    if (version === 2) check(Object.hasOwn(payload, "notes") && Object.hasOwn(payload, "team"), "La copia está incompleta: faltan notas o equipo.");
    const notes = Object.hasOwn(payload, "notes") ? payload.notes : current.notes;
    const team = Object.hasOwn(payload, "team") ? payload.team : current.team;
    rows(notes, "Notas", ["id", "text", "createdAt"]);
    check(notes.every((note) => validDate(note.createdAt)), "Fecha de nota no válida.");
    rows(team, "Equipo", ["id", "name", "role"]);
    return structuredClone({ opportunities: payload.opportunities, settings, notes, team, legacyNotes: !Object.hasOwn(payload, "notes") });
  }

  function save(storage, entries) {
    // Capture and serialize everything before the first write. Revert partial writes.
    const staged = entries.map(([key, value]) => [key, JSON.stringify(value), storage.getItem(key)]);
    const written = [];
    try {
      staged.forEach(([key, value, previous]) => {
        storage.setItem(key, value);
        written.push([key, previous]);
      });
    } catch (error) {
      let recovered = true;
      written.reverse().forEach(([key, previous]) => {
        try { if (previous === null) storage.removeItem(key); else storage.setItem(key, previous); }
        catch (_) { recovered = false; }
      });
      fail(recovered ? "No se pudo guardar la copia. Los datos anteriores se han conservado." : "Error de almacenamiento: no se pudo restaurar todo. No cierres la pestaña; exporta el trabajo actual.");
    }
  }
  globalThis.PliegoClaroBackup = Object.freeze({ validate, save });
})();
