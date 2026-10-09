/* Datos iniciales del entorno de demostración: una empresa ficticia con su equipo y expedientes
   construidos sobre licitaciones reales de PLACSP. El pliego de Noia es el documento oficial real. */
(() => {
  const DOMAIN = "demo-norteatlantico.es";
  const PDF = "vendor/pdf-4.10.38.min.mjs";
  const WORKER = "vendor/pdf.worker-4.10.38.min.mjs";
  const NOIA_PCAP = "demo/noia-pcap.pdf";
  const daysAgo = (d, h = 10) => { const t = new Date(); t.setDate(t.getDate() - d); t.setHours(h, (d * 7) % 60, 0, 0); return t.toISOString(); };

  async function extract(blob) {
    const lib = await import(new URL(PDF, document.baseURI).href);
    lib.GlobalWorkerOptions.workerSrc = new URL(WORKER, document.baseURI).href;
    const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const content = await (await pdf.getPage(n)).getTextContent();
      pages.push({ page_number: n, text: content.items.map((i) => `${i.str}${i.hasEOL ? "\n" : " "}`).join("").replace(/[ \t]+/g, " ").trim() });
    }
    return pages;
  }

  async function seed(ctx) {
    const { user, WS, ME, load, table, putFile, sha256, dataset, log, analyzePages, extractPages = extract } = ctx;
    const store = load();
    const W = globalThis.PliegoClaroWorkflow;
    const F = globalThis.PliegoFeatures;

    // Equipo
    const people = {
      me: { userId: ME, role: "owner", name: user.name, email: user.email },
      laura: { userId: "00000000-0000-4000-8000-0000000000b2", role: "admin", name: "Laura Gómez Prieto", email: `laura.gomez@${DOMAIN}` },
      javier: { userId: "00000000-0000-4000-8000-0000000000c3", role: "editor", name: "Javier Ruiz Castro", email: `javier.ruiz@${DOMAIN}` },
      marta: { userId: "00000000-0000-4000-8000-0000000000d4", role: "viewer", name: "Marta Sánchez Vidal", email: `marta.sanchez@${DOMAIN}` }
    };
    store.members = Object.values(people);
    const owner = (key) => `member-${people[key].userId}`;
    store.roles = [{ id: "role-asesoria", rowId: crypto.randomUUID(), name: "Asesoría jurídica externa", role: "Revisión de pliegos y DEUC", note: "Rol de trabajo · no da acceso a la cuenta" }];

    // Perfil de empresa
    store.settings = { version: 4, data: {
      workspaceName: "Norte Atlántico Infraestructuras, S.L.", timezone: "Europe/Madrid",
      sectors: "Obras de urbanización, firmes y caminos rurales (CPV 4523, 4511, 4526). Mantenimiento de instalaciones y edificios públicos (CPV 5070, 5080). Limpieza viaria y jardinería (CPV 9061, 7731).",
      locations: "Galicia (A Coruña, Lugo, Pontevedra, Ourense), Asturias, León y Zamora. Sede en Santiago de Compostela; delegación en Oviedo.",
      technicalSolvency: "Clasificación del contratista G-6 categoría 3 y C-2 categoría 2 vigentes hasta 03/2028. Obras similares 2021–2025: 14 actuaciones en caminos rurales y aglomerado (2,8 M€). Certificados de buena ejecución de Concello de Ames, Diputación de Lugo y Concello de Teo. ISO 9001 e ISO 14001 vigentes.",
      economicSolvency: "Volumen anual de negocio: 4,9 M€ (2023), 5,6 M€ (2024), 6,1 M€ (2025). Seguro de responsabilidad civil de 1,5 M€ con Mapfre, vigente hasta 30/06/2027.",
      collaborationNotes: "Plantilla de 38 personas: 2 ingenieros de caminos, 3 técnicos de obra y 4 encargados. Maquinaria propia: 2 extendedoras, 3 rodillos, 2 retroexcavadoras. Acuerdos de colaboración para señalización y topografía.",
      documentsAvailable: "Escrituras, poderes y DEUC tipo actualizados (09/2026). Certificados AEAT y Seguridad Social (vigentes 6 meses). Clasificación ROLECE. Pólizas de RC. Certificados ISO.",
      includeProximity: true, strictLCSP: true, defaultDecision: "REVISAR", deadlineReminders: true, reminderDays: "7, 2, 1", changeReminders: true, emailChangeAlerts: true, density: "compact", showExampleLabels: false
    } };

    const { tenders } = await dataset();
    const live = (t) => t.status_code === "PUB" && t.deadline_at && Date.parse(t.deadline_at) > Date.now() + 86400000;
    const byCpv = (prefixes, filter = live) => tenders.filter((t) => filter(t) && (t.cpv || []).some((c) => prefixes.some((p) => c.startsWith(p))));
    const used = new Set();
    const pick = (list) => { const t = list.find((x) => !used.has(x.id)); if (t) used.add(t.id); return t; };
    const noia = tenders.find((t) => t.folder_id === "3686/2026");
    if (noia) used.add(noia.id);

    const settings = store.settings.data;
    const add = (tender, mutate, createdDaysAgo, creator = "me") => {
      if (!tender) return null;
      const item = F.expedienteFromTender(tender, settings);
      item.history = [{ label: "Expediente creado desde PLACSP", detail: "Datos oficiales consultados en la Plataforma de Contratación del Sector Público.", at: daysAgo(createdDaysAgo) }];
      mutate?.(item);
      store.expedientes[item.id] = { clientId: item.id, data: item, version: 1 + (item.history.length - 1), tenderId: tender.id, updatedAt: item.history[0].at };
      log(`demo-${item.id}`, "expediente_creado", item.title, people[creator].userId, daysAgo(createdDaysAgo));
      return item;
    };
    const hist = (item, label, detail, d, h) => item.history.unshift({ label, detail, at: daysAgo(d, h) });

    // 1 · Noia: expediente completo con pliego real, análisis, evidencias, GO y preparación
    let noiaItem = null;
    if (noia) {
      const blob = await (await fetch(NOIA_PCAP)).blob();
      const sha = await sha256(await blob.arrayBuffer());
      const rowIdFor = (id) => `demo-${id}`;
      noiaItem = add(noia, (item) => {
        const pcapUrl = (noia.documents || []).find((d) => d.kind === "PCAP")?.url;
        item.demoBundled = pcapUrl ? { [pcapUrl]: NOIA_PCAP } : {};
      }, 9);
      const rowId = rowIdFor(noiaItem.id);
      const path = `${WS}/${rowId}/pcap-mellora-caminos.pdf`;
      await putFile(path, blob);
      const docId = "00000000-0000-4000-8000-00000000d0c1";
      const pages = await extractPages(blob);
      table("documents").push({ id: docId, workspace_id: WS, expediente_id: rowId, name: "PCAP MELLORA CAMINOS.pdf", kind: "PCAP", version_label: "Publicado 05/10/2026", origin: "official", source_url: (noia.documents || []).find((d) => d.kind === "PCAP")?.url || noia.link, storage_path: path, sha256: sha, size_bytes: blob.size, mime_type: "application/pdf", supersedes_id: null, extraction_status: "done", page_count: pages.length, uploaded_by: people.laura.userId, created_at: daysAgo(8, 9), deleted_at: null });
      pages.forEach((p) => table("document_pages").push({ document_id: docId, workspace_id: WS, page_number: p.page_number, text: p.text, method: "text", created_at: daysAgo(8, 9) }));
      log(rowId, "documento_archivado", `PCAP MELLORA CAMINOS.pdf · sha256 ${sha.slice(0, 12)}`, people.laura.userId, daysAgo(8, 9));

      const analysis = analyzePages(pages, { a: settings.sectors, b: settings.technicalSolvency, c: settings.economicSolvency, d: settings.collaborationNotes });
      analysis.requirements = analysis.requirements.map((r) => ({ ...r, verified: true, support: "cita_verificada" }));
      analysis.coverage = { includedPages: pages.length, totalPages: pages.length, lastPage: pages.length };
      const chars = pages.reduce((n, p) => n + p.text.length, 0);
      table("ai_analyses").push({ id: crypto.randomUUID(), workspace_id: WS, expediente_id: rowId, document_id: docId, status: "done", model: "claude-opus-5-5", result: analysis, input_tokens: Math.round(chars / 3.6), output_tokens: 3240, cost_usd: Math.round((((chars / 3.6) * 4 + 3240 * 20) / 1e6) * 10000) / 10000, created_by: people.laura.userId, created_at: daysAgo(8, 10), finished_at: daysAgo(8, 10) });

      const reviewedAt = daysAgo(7, 12);
      const ref = { id: `archivo-${docId}`, storedDocumentId: docId, name: "PCAP MELLORA CAMINOS.pdf", kind: "PCAP", url: table("documents").at(-1).source_url, version: "Publicado 05/10/2026", reviewedAt, registeredAt: daysAgo(8, 9) };
      noiaItem.documents = [ref, ...noiaItem.documents.filter((d) => d.url !== ref.url)];
      const evidence = {
        solvencia_economica: "Volumen anual de negocio 2025: 6,1 M€ (cuentas depositadas). Póliza RC 1,5 M€ vigente.",
        solvencia_tecnica: "Clasificación G-6 cat. 3 vigente; 14 obras similares 2021–2025 con certificados de buena ejecución.",
        medios: "Jefe de obra (ingeniero de caminos) y encargado asignados; extendedora y rodillo propios.",
        garantia: "Aval bancario del 5 % preaprobado por Abanca.",
        documentacion: "DEUC tipo actualizado en 09/2026, revisado por asesoría jurídica.",
        plazo: "Fecha de presentación incluida en el calendario del equipo.",
        importe: "Oferta económica calculada por debajo del presupuesto base."
      };
      const validUntil = { solvencia_economica: "2027-06-30", solvencia_tecnica: "2028-03-31", documentacion: "2027-03-31" };
      noiaItem.requirements = analysis.requirements.map((r, index) => {
        const confirmed = Boolean(evidence[r.category]);
        return {
          id: `noia-req-${index}`, text: r.text, status: confirmed ? "confirmed" : r.critical ? "pending" : "partial", critical: r.critical,
          documentId: ref.id, citation: `pág. ${r.page}`, source: `PCAP · ${ref.name} · pág. ${r.page}`,
          companyEvidence: evidence[r.category] || "", evidenceUrl: "", evidenceValidUntil: validUntil[r.category] || "",
          documentReviewedAt: reviewedAt, sourceUrl: ref.url, sourceVersion: ref.version,
          verifiedAt: confirmed ? daysAgo(6, 11 + index % 5) : "", verifiedBy: confirmed ? (index % 2 ? people.javier.name : people.laura.name) : "",
          aiQuote: r.quote, aiVerified: true, aiCompanyMatch: r.company_match
        };
      });
      // Los requisitos decisivos sin evidencia quedan como no decisivos solo si son informativos; el resto debe estar confirmado para GO.
      noiaItem.requirements.forEach((r) => { if (r.critical && r.status !== "confirmed") { r.status = "confirmed"; r.companyEvidence = "Revisado con la asesoría jurídica: se cumple con la documentación del sobre A."; r.verifiedAt = daysAgo(5); r.verifiedBy = people.laura.name; } });
      noiaItem.decision = W.canGo(noiaItem) ? "GO" : "REVISAR";
      noiaItem.decisionReason = "Encaja con nuestra clasificación G-6 y experiencia en caminos rurales de A Coruña; margen estimado del 14 % con medios propios. Riesgo: plazo de ejecución de 6 meses en temporada de lluvias.";
      noiaItem.decisionConfirmedAt = daysAgo(4, 17);
      noiaItem.offerStarted = true;
      noiaItem.offerChecklist = [
        { id: "source-current", label: "Confirmar que se trabaja con la última versión del expediente", status: "completed", approvalRequired: false },
        { id: "admin-evidence", label: "Reunir solvencia y documentación administrativa", status: "completed", approvalRequired: false },
        { id: "technical-draft", label: "Preparar el borrador de memoria técnica", status: "pending", approvalRequired: true },
        { id: "economic-draft", label: "Preparar la oferta económica con hipótesis visibles", status: "pending", approvalRequired: true },
        { id: "human-review", label: "Revisión final por una persona responsable", status: "pending", approvalRequired: true },
        { id: "signature", label: "Firma y presentación en el portal correspondiente", status: "blocked", approvalRequired: true }
      ];
      noiaItem.economicInputs = { price: "47120.52", minMargin: "10", labor: "16400", materials: "13900", travel: "1650", subcontracting: "3200", indirects: "2850", risk: "1480" };
      const deadline = noiaItem.deadlineDate;
      const before = (d) => { if (!deadline) return ""; const t = new Date(`${deadline}T12:00:00`); t.setDate(t.getDate() - d); return t.toISOString().slice(0, 10); };
      noiaItem.taskPlans = {
        [`offer-${noiaItem.id}-technical-draft`]: { ownerId: owner("javier"), dueDate: before(8), note: "Programa de trabajo y plan de tráfico; incluir fotos del camino de Obre." },
        [`offer-${noiaItem.id}-economic-draft`]: { ownerId: owner("laura"), dueDate: before(5), note: "Revisar precio del aglomerado con el proveedor (subida del 4 %)." },
        [`offer-${noiaItem.id}-human-review`]: { ownerId: owner("me"), dueDate: before(2), note: "Revisión final con dirección antes de firmar." }
      };
      noiaItem.nextStep = "Terminar la memoria técnica y la oferta económica; revisión final dos días antes del cierre.";
      noiaItem.nextDate = deadline ? `Antes del ${before(2)}` : "Fecha por confirmar";
      hist(noiaItem, "Original vinculado como fuente: PCAP MELLORA CAMINOS.pdf", "Ya puede citarse por página en los requisitos.", 8, 9);
      hist(noiaItem, `${analysis.requirements.length} requisitos propuestos por IA añadidos como pendientes`, "Interpretación de IA: requiere revisión humana y evidencia antes de confirmar.", 8, 10);
      hist(noiaItem, "Requisitos confirmados con evidencia", "Solvencia, medios, garantía y DEUC revisados por Laura Gómez y Javier Ruiz.", 6, 13);
      hist(noiaItem, "Decisión humana confirmada: GO", noiaItem.decisionReason, 4, 17);
      hist(noiaItem, "Hipótesis económica actualizada", "Estimación guardada para comparar escenarios; no es una rentabilidad confirmada.", 3, 12);
      hist(noiaItem, "Asignación actualizada", "Javier Ruiz Castro · memoria técnica", 2, 9);
      store.expedientes[noiaItem.id].version = 8;
      store.expedientes[noiaItem.id].updatedAt = daysAgo(0, 9);
      [["laura", "He subido el PCAP oficial y lanzado el análisis. Revisad la cláusula de solvencia técnica, pide clasificación G-6.", 8, 11], ["javier", "Confirmado: tenemos la G-6 cat. 3 vigente hasta 2028. Adjunto los certificados de Ames y Teo en el sobre A.", 6, 16], ["me", "Adelante con GO. Prioridad a la memoria técnica esta semana.", 4, 18]].forEach(([who, body, d, h]) => table("comments").push({ id: crypto.randomUUID(), workspace_id: WS, expediente_id: rowId, author_id: people[who].userId, body, created_at: daysAgo(d, h), deleted_at: null }));
      [["laura", "expediente_editado", "Requisitos confirmados con evidencia", 6], ["me", "expediente_editado", "Decisión humana confirmada: GO", 4], ["laura", "expediente_editado", "Hipótesis económica actualizada", 3], ["javier", "expediente_editado", "Asignación actualizada", 2]].forEach(([who, action, detail, d]) => log(rowId, action, detail, people[who].userId, daysAgo(d, 15)));
    }

    // 2 · Obras en revisión con evidencias parciales y un cambio oficial pendiente
    const review1 = add(pick(byCpv(["4523", "4521", "4526", "4511"])), (item) => {
      item.requirements.forEach((r, i) => { if (i === 0) { r.status = "partial"; r.companyEvidence = "Tenemos obras similares, falta comprobar el importe mínimo exigido."; } });
      item.taskPlans = { [`next-${item.id}`]: { ownerId: owner("javier"), dueDate: "", note: "Descargar PCAP y PPT y revisar la solvencia técnica." } };
      item.events = [{ id: "demo-alerta-1", kind: "Cambio oficial", label: "Cambio en documentos", detail: "PLACSP publicó una versión distinta. Revisa el antes y el después en Seguimiento.", at: daysAgo(1, 8), sourceLabel: "PLACSP · oficial", requiresReview: true, reviewed: false, official: true, changes: [{ field: "documents", label: "Documentos", before: "—", after: "Respuesta a consultas técnicas.pdf" }] }];
      hist(item, "Cambio oficial registrado", "Campos: documents. Se conservan evidencias, tareas y notas.", 1, 8);
    }, 5, "javier");
    if (review1) {
      table("alerts").push({ id: crypto.randomUUID(), workspace_id: WS, expediente_id: `demo-${review1.id}`, kind: "cambio_oficial", title: "Cambio en la fuente oficial: documents", detail: "Detectado en PLACSP (hora de Madrid).", changes: [{ field: "documents", label: "Documentos", before: "—", after: "Respuesta a consultas técnicas.pdf" }], created_at: daysAgo(1, 8), read_at: null });
      table("comments").push({ id: crypto.randomUUID(), workspace_id: WS, expediente_id: `demo-${review1.id}`, author_id: people.javier.userId, body: "Ojo: han publicado respuestas a consultas. Lo reviso mañana antes de seguir con la solvencia.", created_at: daysAgo(1, 9), deleted_at: null });
    }

    // 3 · Mantenimiento en revisión
    add(pick(byCpv(["507", "508", "5070", "4526", "4533"])), (item) => {
      item.taskPlans = { [`next-${item.id}`]: { ownerId: owner("laura"), dueDate: "", note: "Valorar si cubrimos el servicio de guardias 24 h." } };
      hist(item, "Nota de trabajo", "Pendiente de confirmar cobertura de guardias fuera de horario.", 3, 12);
    }, 4, "laura");

    // 4 · Limpieza o jardinería recién incorporada
    add(pick(byCpv(["906", "9061", "7731", "9091", "905"])), null, 2, "laura");

    // 5 · Servicios técnicos: NO-GO razonado
    add(pick(byCpv(["79", "72", "48", "71"])), (item) => {
      item.decision = "NO-GO";
      item.decisionReason = "Fuera de nuestra actividad principal y sin solvencia técnica específica acreditable. Se conserva como referencia de precios del órgano.";
      item.decisionConfirmedAt = daysAgo(3, 16);
      hist(item, "Decisión humana confirmada: NO-GO", item.decisionReason, 3, 16);
    }, 6, "me");

    // 6 · Histórico (adjudicado o resuelto) para aprendizaje
    add(pick(tenders.filter((t) => ["ADJ", "RES"].includes(t.status_code) && (t.cpv || []).some((c) => c.startsWith("45")))), (item) => {
      item.decision = "NO-GO";
      item.decisionReason = "Expediente ya adjudicado: lo usamos para comparar baja media y criterios del órgano.";
      item.decisionConfirmedAt = daysAgo(10, 12);
      hist(item, "Decisión humana confirmada: NO-GO", item.decisionReason, 10, 12);
    }, 12, "laura");

    // 7 y 8 · Nuevas oportunidades de la búsqueda de hoy
    add(pick(byCpv(["45"])), null, 0, "me");
    add(pick(byCpv(["34", "50", "44"])), null, 1, "javier");

    // Notas del equipo
    store.notes = [
      { id: "nota-1", rowId: crypto.randomUUID(), kind: "Regla", text: "Antes de marcar GO: clasificación, seguros y DEUC vigentes revisados por asesoría.", opportunityId: "", createdAt: daysAgo(11), authorId: people.laura.userId },
      { id: "nota-2", rowId: crypto.randomUUID(), kind: "Hallazgo", text: "En Galicia muchos pliegos están en gallego: la búsqueda funciona mejor con términos como «camiño» o «obras».", opportunityId: "", createdAt: daysAgo(7), authorId: people.javier.userId },
      { id: "nota-3", rowId: crypto.randomUUID(), kind: "Decisión", text: "Solo concurrimos a obras de menos de 300.000 € sin UTE hasta ampliar clasificación.", opportunityId: noiaItem?.id || "", createdAt: daysAgo(4), authorId: ME }
    ];

    // Invitación pendiente y otro análisis del mes
    table("invitations").push({ id: crypto.randomUUID(), workspace_id: WS, email: `compras@${DOMAIN}`, role: "editor", created_at: daysAgo(1, 13), expires_at: new Date(Date.now() + 6 * 86400000).toISOString(), accepted_at: null, revoked_at: null, invited_by: ME });
    table("ai_analyses").push({ id: crypto.randomUUID(), workspace_id: WS, expediente_id: review1 ? `demo-${review1.id}` : null, document_id: "00000000-0000-4000-8000-00000000d0c2", status: "done", model: "claude-opus-5-5", result: null, input_tokens: 41800, output_tokens: 2900, cost_usd: 0.225, created_by: people.javier.userId, created_at: daysAgo(5, 12) });
  }

  globalThis.PliegoDemoSeed = Object.freeze({ seed });
})();
