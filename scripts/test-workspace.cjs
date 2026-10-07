const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const scope = vm.createContext({ URL, structuredClone });
for (const name of ['workflow.js', 'workspace-ui.js']) vm.runInContext(fs.readFileSync(path.join(root, 'dist', name), 'utf8'), scope);
const U = scope.PliegoClaroWorkspaceUI;
const W = scope.PliegoClaroWorkflow;
const now = '2026-10-07T12:00:00.000Z';
function fixture() {
  const doc = W.document({ name: 'PCAP', kind: 'PCAP', url: 'https://example.org/pcap', version: '1', reviewed: true }, 'doc', now);
  const req = W.requirement({ text: 'Experiencia', status: 'confirmed', documentId: 'doc', citation: 'Página 2', companyEvidence: 'Certificado de prueba' }, 'req', [doc], now);
  return { id: 'case', title: 'Caso de prueba', organization: 'Organismo', documents: [doc], requirements: [req], decision: 'GO', decisionReason: 'Encaje revisado', decisionConfirmedAt: now, events: [] };
}
for (const [child, parent] of [['pruebas', 'hoy'], ['radar', 'oportunidades'], ['equipo', 'empresa']]) test(`${child} se conserva y activa ${parent}`, () => {
  assert.equal(U.route(`#${child}`), child); assert.equal(U.parent(child), parent);
  assert.match(U.subnav(child), new RegExp(`href="#${child}" aria-current="page"`));
});
test('el menú principal se reduce a seis sin eliminar datos ni rutas anteriores', () => {
  const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  const nav = html.slice(html.indexOf('<nav class="nav-list">'), html.indexOf('</nav>'));
  assert.equal((nav.match(/data-route=/g) || []).length, 6);
  for (const route of ['hoy', 'oportunidades', 'expedientes', 'tareas', 'empresa', 'ajustes']) assert.match(nav, new RegExp(`data-route="${route}"`));
  for (const route of ['hoy', 'oportunidades', 'expedientes', 'tareas', 'empresa', 'ajustes', 'asistencia', 'radar', 'equipo', 'pruebas']) assert.equal(U.route(`#${route}`), route);
});
test('inicio por defecto y anclas internas de ajustes no llevan a una pantalla equivocada', () => {
  for (const hash of ['', '#top', '#desconocido']) assert.equal(U.route(hash), 'hoy');
  assert.equal(U.route('#ajuste-datos'), 'ajustes'); assert.equal(U.route('#ajuste-empresa'), 'ajustes');
});
test('las nueve vistas de expediente se agrupan en seis con equivalencias', () => {
  assert.equal(U.detailTabs.length, 6);
  assert.equal(U.detail('economic'), 'decision'); assert.equal(U.detail('tasks'), 'offer'); assert.equal(U.detail('history'), 'changes');
});
test('primer documento es la siguiente acción cuando no se ha revisado ninguna fuente', () => {
  const item = fixture(); item.documents = [];
  assert.equal(U.next(item).tab, 'documents');
});
test('un cambio pendiente tiene prioridad sobre preparar una oferta', () => {
  const item = fixture(); item.events.push({ requiresReview: true, reviewed: false });
  assert.equal(U.next(item).tab, 'changes');
  assert.equal(U.stage(item), 'review');
});
test('evidencia inválida dirige a requisitos, no a una oferta preparada', () => {
  const item = fixture(); item.requirements[0].citation = '';
  assert.equal(U.next(item).tab, 'requirements'); assert.equal(U.stage(item), 'review');
});
test('GO sin motivo o confirmación manual continúa en revisión', () => {
  for (const field of ['decisionReason', 'decisionConfirmedAt']) {
    const item = fixture(); delete item[field];
    assert.equal(U.next(item).tab, 'decision'); assert.equal(U.stage(item), 'review');
  }
});
test('NO-GO conserva el caso sin sugerir que prepare una oferta', () => {
  const item = fixture(); item.decision = 'NO-GO';
  assert.equal(U.stage(item), 'discarded'); assert.equal(U.next(item).tab, 'decision');
});
test('tablero deriva preparación y revisión final sin firmar ni alterar datos', () => {
  const item = fixture(); assert.equal(U.stage(item), 'prepare');
  item.offerChecklist = [{ id: 'technical-draft', status: 'completed' }, { id: 'human-review', status: 'pending' }, { id: 'signature', status: 'blocked' }];
  const before = JSON.stringify(item);
  assert.equal(U.stage(item), 'final'); U.board([item]); assert.equal(JSON.stringify(item), before);
});
test('cada expediente aparece una sola vez en el tablero y hay vacíos explícitos', () => {
  const item = fixture(); const board = U.board([item]);
  assert.equal((board.match(/data-open-opportunity="case"/g) || []).length, 1);
  assert.equal((board.match(/Sin expedientes en esta etapa/g) || []).length, 3);
});
test('la prioridad de inicio ordena por cierre y prioridad sin cambiar la lista original', () => {
  const tasks = [{ id: 'none', priority: 'high' }, { id: 'late', dueDate: '2026-10-10', priority: 'high' }, { id: 'low', dueDate: '2026-10-08' }, { id: 'urgent', dueDate: '2026-10-08', priority: 'high' }];
  const before = JSON.stringify(tasks);
  assert.deepEqual(structuredClone(U.attention(tasks)).map(task => task.id), ['urgent', 'low', 'late', 'none']);
  assert.equal(JSON.stringify(tasks), before);
});
test('perfil editable contiene los seis campos existentes y conserva valores como texto', () => {
  const settings = Object.fromEntries(U.profileFields.map(([id]) => [id, '<script>dato</script>']));
  const html = U.company(settings);
  assert.equal((html.match(/<textarea /g) || []).length, 6); assert.equal(html.includes('<script>'), false);
  for (const [id] of U.profileFields) assert.match(html, new RegExp(`name="${id}"`));
});
test('el tablero y la tarjeta de inicio escapan nombres e identificadores importados', () => {
  const item = fixture(); item.id = '" onclick="alert(1)'; item.title = '<img src=x onerror=alert(1)>';
  for (const output of [U.board([item]), U.focus(item)]) { assert.equal(output.includes('<img'), false); assert.equal(output.includes('data-open-opportunity="" onclick='), false); }
});
test('el recorrido indica un paso actual y uno sugerido sin porcentaje de cumplimiento inventado', () => {
  const html = U.journey(fixture(), 'economic');
  assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
  assert.equal((html.match(/Próximo paso/g) || []).length, 1);
  assert.equal((html.match(/data-tab=/g) || []).length, 6);
});
test('un espacio vacío muestra una siguiente acción y tablero sin errores', () => {
  assert.match(U.focus(null), /Tu primer caso/); assert.equal((U.board([]).match(/Sin expedientes en esta etapa/g) || []).length, 4);
});
