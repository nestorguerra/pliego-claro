const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const scope = vm.createContext({ structuredClone, URL });
for (const file of ['workflow.js', 'workflow-ui.js', 'backup.js']) vm.runInContext(fs.readFileSync(path.join(root, 'dist', file), 'utf8'), scope);
const W = scope.PliegoClaroWorkflow;
const now = '2026-10-06T19:00:00.000Z';
const doc = W.document({ name: 'PCAP original', kind: 'PCAP', url: 'https://example.org/pcap.pdf', version: '1', reviewed: true }, 'doc-1', now);
const input = { text: 'Experiencia acreditada', documentId: doc.id, citation: 'Página 12, cláusula 4', companyEvidence: 'Certificado de buena ejecución: proyecto de prueba', status: 'confirmed', critical: true };
const req = () => W.requirement(input, 'req-1', [doc], now);
const item = () => ({ id: 'case', title: 'Caso manual', organization: 'Organismo de prueba', decision: 'GO', requirements: [req()], documents: [structuredClone(doc)], taskPlans: { 'requirement-case-req-1': { ownerId: 'owner', dueDate: '2026-10-08', note: 'Verificar' } }, history: [], why: [], deadlineDate: '2026-10-12', decisionConfirmedAt: now });
test('registrar un documento guarda la revisión manual y no descarga nada', () => {
  assert.equal(doc.reviewedAt, now); assert.equal(doc.url, 'https://example.org/pcap.pdf');
  assert.equal(W.document({ ...doc, reviewed: false }, doc.id, now).reviewedAt, '');
});
for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///tmp/a.pdf', 'https://user:password@example.org/a']) test(`rechaza enlace inseguro ${bad.split(':')[0]}`, () => {
  assert.throws(() => W.document({ ...doc, url: bad, reviewed: true }, doc.id, now));
});
test('documento pendiente puede registrarse sin enlace; revisado no', () => {
  assert.equal(W.document({ name: 'Anexo pendiente', kind: 'Anexo', url: '', reviewed: false }, 'x', now).url, '');
  assert.throws(() => W.document({ name: 'Anexo', kind: 'Anexo', url: '', reviewed: true }, 'x', now));
});
test('confirmación manual exige documento revisado, cita y evidencia', () => {
  assert.equal(W.confirmed(req(), [doc]), true);
  for (const missing of ['citation', 'companyEvidence', 'documentId']) assert.throws(() => W.requirement({ ...input, [missing]: '' }, 'req-1', [doc], now));
  assert.throws(() => W.requirement(input, 'req-1', [{ ...doc, reviewedAt: '' }], now));
});
test('un estado confirmado antiguo no se convierte en evidencia válida', () => {
  assert.equal(W.confirmed({ text: 'Experiencia', status: 'confirmed', source: 'Afirmación antigua' }, [doc]), false);
});
test('un requisito pendiente admite carencias sin inventar documentos', () => {
  const result = W.requirement({ text: 'Certificado por buscar', status: 'pending' }, 'r', [], now);
  assert.equal(result.status, 'pending'); assert.equal(result.verifiedAt, '');
});
test('solo GO con al menos un requisito decisivo y evidencias trazables', () => {
  assert.equal(W.canGo(item()), true); assert.equal(W.canGo({ requirements: [] }), false);
  assert.equal(W.canGo({ ...item(), requirements: [{ ...req(), status: 'pending' }] }), false);
});
test('requisito no decisivo pendiente no bloquea una decisión con evidencias críticas', () => {
  const draft = item(); draft.requirements.push({ text: 'Preferencia', critical: false, status: 'pending' });
  assert.equal(W.canGo(draft), true);
});
for (const changed of ['url', 'version', 'reviewedAt']) test(`cambiar ${changed} invalida evidencia anterior y reabre GO sin borrar trabajo`, () => {
  const draft = item(); draft.documents[0][changed] += 'nuevo'; const before = JSON.stringify(draft.taskPlans);
  assert.equal(W.reopenDecision(draft), true); assert.equal(draft.decision, 'REVISAR');
  assert.equal(draft.decisionConfirmedAt, undefined); assert.equal(draft.requirements.length, 1);
  assert.equal(JSON.stringify(draft.taskPlans), before);
});
test('un NO-GO humano no se reemplaza automáticamente por GO', () => {
  const draft = item(); draft.decision = 'NO-GO'; assert.equal(W.reopenDecision(draft), false); assert.equal(draft.decision, 'NO-GO');
});
test('asignar un responsable y plazo guarda solo referencias locales', () => {
  const plan = W.plan({ ownerId: 'owner', dueDate: '2026-10-08', note: 'Revisar fuente' }, [{ id: 'owner' }], '2026-10-12');
  assert.deepEqual(structuredClone(plan), { ownerId: 'owner', dueDate: '2026-10-08', note: 'Revisar fuente' });
});
test('rechaza responsable retirado, fecha imposible y fecha posterior al cierre', () => {
  assert.throws(() => W.plan({ ownerId: 'removed' }, [], '2026-10-12'));
  assert.throws(() => W.plan({ dueDate: '2026-02-30' }, [], '2026-10-12'));
  assert.throws(() => W.plan({ dueDate: '2026-10-13' }, [], '2026-10-12'));
});
test('editar el expediente mantiene datos asociados y reabre GO al cambiar el cierre', () => {
  const current = item(); const result = W.editExpediente(current, { title: 'Nuevo nombre', organization: 'Organismo', deadlineDate: '2026-10-14', summary: 'Objeto', nextStep: 'Revisión', source: 'https://example.org/ficha' });
  assert.equal(result.decision, 'REVISAR'); assert.deepEqual(result.documents, current.documents);
  assert.deepEqual(result.taskPlans, current.taskPlans); assert.equal(current.title, 'Caso manual');
});
test('copia y recuperación mantienen fuentes, citas, evidencias y asignaciones', () => {
  const defaults = { defaultDecision: 'REVISAR', density: 'compact' };
  const payload = { format: 'pliego-claro-mvp', version: 2, settings: defaults, opportunities: [item()], notes: [], team: [] };
  const result = scope.PliegoClaroBackup.validate(JSON.parse(JSON.stringify(payload)), { notes: [], team: [] }, defaults);
  assert.deepEqual(result.opportunities[0], structuredClone(payload.opportunities[0])); assert.equal(W.canGo(result.opportunities[0]), true);
});
test('copia con enlace documental malicioso o asignación mal formada se rechaza', () => {
  const defaults = { defaultDecision: 'REVISAR', density: 'compact' };
  const payload = { format: 'pliego-claro-mvp', version: 2, settings: defaults, opportunities: [item()], notes: [], team: [] };
  payload.opportunities[0].documents[0].url = 'javascript:alert(1)';
  assert.throws(() => scope.PliegoClaroBackup.validate(payload, {}, defaults));
  payload.opportunities[0] = item(); payload.opportunities[0].taskPlans.x = null;
  assert.throws(() => scope.PliegoClaroBackup.validate(payload, {}, defaults));
});
test('datos aportados se muestran como texto, no como HTML ejecutable', () => {
  const draft = item(); draft.documents[0].name = '<img src=x onerror=alert(1)>';
  const output = scope.PliegoClaroWorkflowUI.documents(draft, '');
  assert.equal(output.includes('<img src=x'), false); assert.equal(output.includes('&lt;img'), true);
});
test('editar fuente u organismo reabre GO y una nueva acción no hereda completado', () => {
  const current = { ...item(), source: 'https://example.org/original', nextStep: 'Primera acción', nextStepDone: true };
  const fields = { ...current, deadlineDate: current.deadlineDate, nextStep: 'Nueva acción' };
  const result = W.editExpediente(current, { ...fields, source: 'https://example.org/nuevo' });
  assert.equal(result.decision, 'REVISAR'); assert.equal(result.nextStepDone, false);
  assert.equal(W.editExpediente(current, { ...fields, organization: 'Otro organismo' }).decision, 'REVISAR');
});
test('avisa de una tarea posterior a un cierre adelantado sin borrar asignaciones', () => {
  const draft = item(); draft.deadlineDate = '2026-10-07';
  const output = scope.PliegoClaroWorkflowUI.tasks(draft, [{ id: 'requirement-case-req-1', title: 'Revisar' }], [{ id: 'owner', name: 'Responsable' }]);
  assert.match(output, /supera el cierre actual/); assert.equal(draft.taskPlans['requirement-case-req-1'].dueDate, '2026-10-08');
});
const appSource = fs.readFileSync(path.join(root, 'dist/app.js'), 'utf8');
const commitSource = appSource.slice(appSource.indexOf('const savingIds = new Set();'), appSource.indexOf('const listElement ='));
function commitFixture(failServer = false) {
  const initial = [item()]; let saved = JSON.stringify(initial); let writes = 0;
  const cloud = {
    can: () => true,
    async saveExpediente(next) { writes += 1; if (failServer) throw Object.assign(new Error('Sin conexión con el servidor. No se ha guardado; tu cambio queda como borrador en este navegador.'), { kind: 'network' }); saved = JSON.stringify([next]); return next; },
    async fetchExpediente() { return JSON.parse(saved)[0]; }
  };
  const ctx = vm.createContext({ structuredClone, PliegoClaroWorkflow: W, PliegoCloud: cloud, PliegoAuthUI: { show() {} }, opportunities: initial, seedOpportunities: [], safeHttpUrl: (v) => v,
    document: { querySelector: () => null }, window: { setTimeout, clearTimeout }, Intl,
    render: () => {}, showToast: (message) => { ctx.lastMessage = message; }, recordHistory: (item, label, detail) => { item.history.push({ label, detail, at: now }); }
  });
  vm.runInContext(commitSource, ctx);
  return { ctx, initial, saved: () => saved, writes: () => writes };
}
test('fallo de almacenamiento no cambia documentos, requisitos o tareas en memoria', async () => {
  const state = commitFixture(true); const before = JSON.stringify(state.initial);
  assert.equal(await state.ctx.commitExpediente('case', (draft) => { draft.documents[0].version = '2'; draft.taskPlans.x = { note: 'Nuevo' }; }, 'Guardado'), false);
  assert.equal(JSON.stringify(state.ctx.opportunities), before); assert.equal(state.saved(), before);
  assert.match(state.ctx.lastMessage, /No se ha guardado/);
});
test('guardar una versión distinta persiste REVISAR y conserva las referencias anteriores', async () => {
  const state = commitFixture();
  assert.equal(await state.ctx.commitExpediente('case', (draft) => { draft.documents[0].version = '2'; }, 'Guardado'), true);
  const restored = JSON.parse(state.saved())[0];
  assert.equal(restored.decision, 'REVISAR'); assert.equal(restored.requirements[0].sourceVersion, '1');
  assert.equal(restored.taskPlans['requirement-case-req-1'].note, 'Verificar'); assert.equal(state.initial[0].decision, 'GO');
  assert.equal(state.ctx.opportunities[0].decision, 'REVISAR', 'la interfaz refleja lo confirmado por el servidor');
});
test('un error de validación o expediente ausente no inicia una escritura', async () => {
  const state = commitFixture(); const before = state.saved();
  assert.equal(await state.ctx.commitExpediente('missing', () => {}, 'Guardado'), false);
  assert.equal(await state.ctx.commitExpediente('case', () => { throw new Error('Datos inválidos'); }, 'Guardado'), false);
  assert.equal(state.saved(), before); assert.equal(state.writes(), 0);
});
test('dos guardados simultáneos del mismo expediente no se pisan', async () => {
  const state = commitFixture();
  const first = state.ctx.commitExpediente('case', (draft) => { draft.summary = 'uno'; }, 'Guardado');
  const second = await state.ctx.commitExpediente('case', (draft) => { draft.summary = 'dos'; }, 'Guardado');
  assert.equal(second, false); assert.equal(await first, true);
  assert.equal(JSON.parse(state.saved())[0].summary, 'uno'); assert.equal(state.writes(), 1);
});
test('el historial conserva más de veinte pasos de revisión', () => {
  const start = appSource.indexOf('function recordHistory(');
  const ctx = vm.createContext({}); vm.runInContext(appSource.slice(start, appSource.indexOf('function getDeadlineDate(', start)), ctx);
  const draft = { history: [] };
  for (let i = 0; i < 30; i++) ctx.recordHistory(draft, `Paso ${i}`, 'Prueba');
  assert.equal(draft.history.length, 30); assert.equal(draft.history.at(-1).label, 'Paso 0');
});
for (const invalid of ['duplicate', 'date', 'url']) test(`rechaza evidencia importada no segura: ${invalid}`, () => {
  const defaults = { defaultDecision: 'REVISAR', density: 'compact' };
  const payload = { format: 'pliego-claro-mvp', version: 2, settings: defaults, opportunities: [item()], notes: [], team: [] };
  if (invalid === 'duplicate') payload.opportunities[0].requirements.push(req());
  if (invalid === 'date') payload.opportunities[0].requirements[0].verifiedAt = 'inventado';
  if (invalid === 'url') payload.opportunities[0].requirements[0].evidenceUrl = 'javascript:alert(1)';
  assert.throws(() => scope.PliegoClaroBackup.validate(payload, {}, defaults));
});
