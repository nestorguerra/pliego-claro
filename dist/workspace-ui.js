/* Navigation and manual work surfaces only. No API, no data migration. */
(() => {
  const escape = (value = "") => String(value ?? "").replace(/[&<>"'`]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[char]));
  const groups = { pruebas: "hoy", radar: "oportunidades", buscar: "oportunidades", equipo: "empresa", privacidad: "ajustes" };
  const labels = { hoy: "Inicio", oportunidades: "Oportunidades", expedientes: "Expedientes", tareas: "Tareas", empresa: "Empresa y equipo", ajustes: "Ajustes", asistencia: "Ayuda para participar" };
  const detailAliases = { economic: "decision", tasks: "offer", history: "changes" };
  const detailTabs = [["summary", "Ficha"], ["documents", "Documentos"], ["requirements", "Requisitos y evidencia"], ["decision", "Decisión y costes"], ["offer", "Preparación"], ["changes", "Seguimiento"]];
  function parent(route) { return groups[route] || route; }
  function route(hash) {
    const value = String(hash || "").replace(/^#/, "");
    if (value.startsWith("ajuste-")) return "ajustes";
    return Object.hasOwn(labels, value) || Object.hasOwn(groups, value) ? value : "hoy";
  }
  function detail(tab) { return detailAliases[tab] || tab; }
  function subnav(route) {
    const group = parent(route);
    const links = { hoy: [["hoy", "Trabajo de hoy"], ["pruebas", "Notas y aprendizaje"]], oportunidades: [["oportunidades", "Mis expedientes"], ["buscar", "Buscar en PLACSP"], ["radar", "Mapa territorial · ilustrativo"]], empresa: [["empresa", "Capacidades y solvencia"], ["equipo", "Miembros, permisos y roles"]], ajustes: [["ajustes", "Ajustes"], ["privacidad", "Privacidad"]] }[group];
    return links ? links.map(([id, label]) => `<a href="#${id}" ${route === id ? 'aria-current="page"' : ""}>${escape(label)}</a>`).join("") : "";
  }
  function next(item) {
    if (!item) return { tab: "summary", label: "Añade tu primer expediente", detail: "Empieza por el enlace oficial, el organismo y el cierre." };
    if (item.decision === "NO-GO") return { tab: "decision", label: "Revisar o explicar el descarte", detail: "El caso está apartado de la preparación. Conserva el motivo y lo aprendido." };
    if ((item.events || []).some((event) => event.requiresReview && !event.reviewed)) return { tab: "changes", label: "Revisar los cambios registrados", detail: "Hay cambios de prueba pendientes. Contrasta su impacto antes de avanzar." };
    if (!(item.documents || []).some((doc) => doc.url && doc.reviewedAt)) return { tab: "documents", label: "Registrar y revisar el documento original", detail: "Todavía no hay una referencia documental con revisión manual registrada." };
    if (!PliegoClaroWorkflow.canGo(item)) return { tab: "requirements", label: "Completar las evidencias decisivas", detail: "Une cada requisito decisivo a su página o cláusula y a lo que puede demostrar la empresa." };
    if (item.decision !== "GO" || !item.decisionConfirmedAt || !String(item.decisionReason || "").trim()) return { tab: "decision", label: "Decidir y dejar el motivo por escrito", detail: "Las evidencias permiten estudiar el encaje; la decisión sigue siendo humana." };
    return { tab: "offer", label: "Organizar la preparación de la oferta", detail: "Revisa el checklist, asigna responsables y fechas. La app no firma ni presenta." };
  }
  function focus(item) {
    const action = next(item);
    return `<section class="work-focus"><div><p class="eyebrow">CONTINÚA TU EXPEDIENTE</p><h2>${escape(item?.title || "Tu primer caso de trabajo")}</h2><p>${escape(action.detail)}</p></div><div class="work-focus-action"><span>Siguiente paso sugerido · revisión manual</span>${item ? `<button class="button button-dark" data-open-opportunity="${escape(item.id)}" data-open-tab="${action.tab}" type="button">${escape(action.label)} →</button>` : '<a class="button button-dark" href="#oportunidades">Ir a la bandeja →</a>'}</div></section>`;
  }
  function journey(item, active) {
    const suggested = next(item).tab;
    return `<div class="expediente-journey"><span>Un expediente · seis pasos de trabajo</span><div>${detailTabs.map(([id, label], index) => `<button data-tab="${id}" type="button" ${detail(active) === id ? 'aria-current="step"' : ""}><small>${index + 1}</small>${escape(label)}${suggested === id ? '<i>Próximo paso</i>' : ""}</button>`).join("")}</div></div>`;
  }
  function attention(tasks) {
    return [...tasks].sort((a, b) => (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31") || Number(b.priority === "high") - Number(a.priority === "high"));
  }
  function stage(item) {
    if (item.decision === "NO-GO") return "discarded";
    if ((item.events || []).some((event) => event.requiresReview && !event.reviewed)) return "review";
    if (item.decision !== "GO" || !PliegoClaroWorkflow.canGo(item) || !item.decisionConfirmedAt || !String(item.decisionReason || "").trim()) return "review";
    const preparation = (item.offerChecklist || []).filter((entry) => !/signature$/.test(entry.id) && !/human-review$/.test(entry.id));
    return preparation.length && preparation.every((entry) => entry.status === "completed") ? "final" : "prepare";
  }
  function board(items) {
    const columns = [["review", "En revisión", "Documentos, evidencia y decisión"], ["prepare", "Preparando oferta", "Checklist, responsables y costes"], ["final", "Revisión antes de presentar", "Control humano; no se presenta desde aquí"], ["discarded", "No seguir", "Conservar el motivo y el aprendizaje"]];
    return `<div class="expediente-board">${columns.map(([id, label, description]) => {
      const entries = items.filter((item) => stage(item) === id);
      return `<section class="work-lane work-lane-${id}"><div class="work-lane-heading"><h2>${label}</h2><b>${entries.length}</b></div><p>${description}</p>${entries.length ? entries.map((item) => {
        const action = next(item);
        return `<button class="work-case" data-open-opportunity="${escape(item.id)}" data-open-tab="${action.tab}" type="button"><strong>${escape(item.title)}</strong><span>${escape(item.organization)}</span><small>${escape(item.deadlineDate || item.deadline || "Cierre por confirmar")}</small><em>${escape(action.label)} →</em></button>`;
      }).join("") : '<div class="work-lane-empty">Sin expedientes en esta etapa.</div>'}</section>`;
    }).join("")}</div>`;
  }
  const profileFields = [["sectors", "Servicios y sectores"], ["locations", "Zonas de ejecución"], ["technicalSolvency", "Experiencia y solvencia técnica"], ["economicSolvency", "Solvencia económica"], ["collaborationNotes", "Medios propios y colaboración"], ["documentsAvailable", "Documentos disponibles"]];
  function company(settings) {
    return `<section class="company-editor"><div><p class="eyebrow">PERFIL REUTILIZABLE</p><h2>Lo que tu empresa puede demostrar</h2><p>Edítalo aquí. Son declaraciones del espacio: no se verifican certificados ni aptitud automáticamente. La IA lo usa para contrastar requisitos, nunca para confirmarlos.</p></div><form data-company-form><div class="form-grid">${profileFields.map(([id, label]) => `<label class="field"><span>${label}</span><textarea name="${id}" rows="3" placeholder="Pendiente de completar">${escape(settings[id])}</textarea></label>`).join("")}</div><div class="modal-actions"><button class="button button-dark" type="submit">Guardar perfil de empresa</button></div><p class="editor-error" data-company-error role="alert"></p></form></section>`;
  }
  globalThis.PliegoClaroWorkspaceUI = Object.freeze({ parent, route, detail, labels, detailTabs, subnav, next, focus, journey, attention, stage, board, company, profileFields });
})();
