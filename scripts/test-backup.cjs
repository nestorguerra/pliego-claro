const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ structuredClone, URL });
vm.runInContext(fs.readFileSync(path.join(root, 'dist/backup.js'), 'utf8'), context);
const app = fs.readFileSync(path.join(root, 'dist/app.js'), 'utf8');
vm.runInContext(app.slice(0, app.indexOf('let opportunities =')) + '\nglobalThis.fixture = { seedOpportunities, defaultSettings, seedNotes, defaultTeam };', context);
const { validate, save } = context.PliegoClaroBackup;
const fixture = structuredClone(context.fixture);
const current = { notes: [{ id: 'current', text: 'Trabajo actual', createdAt: '2026-10-06T10:00:00.000Z' }], team: fixture.defaultTeam };
function copy() { return structuredClone({ format: 'pliego-claro-mvp', version: 2, opportunities: fixture.seedOpportunities, settings: fixture.defaultSettings, notes: fixture.seedNotes, team: fixture.defaultTeam }); }
function restore(payload) { return validate(payload, current, fixture.defaultSettings); }

test('la copia completa conserva expedientes, costes, eventos, notas, equipo y ajustes', () => {
  const payload = copy();
  payload.opportunities[0].history = [{ label: 'Decisión', detail: 'Prueba', at: '2026-10-06T10:00:00.000Z' }];
  const result = restore(JSON.parse(JSON.stringify(payload)));
  for (const key of ['opportunities', 'settings', 'notes', 'team']) assert.deepEqual(result[key], payload[key]);
  result.notes[0].text = 'Cambio';
  assert.notEqual(payload.notes[0].text, 'Cambio');
});
test('copias antiguas conservan las notas y equipo actuales si faltan', () => {
  const payload = copy(); delete payload.version; delete payload.notes; delete payload.team;
  const result = restore(payload);
  assert.deepEqual(result.notes, current.notes);
  assert.deepEqual(result.team, current.team);
  assert.equal(result.legacyNotes, true);
});
test('listas explícitamente vacías de notas y equipo no se sustituyen por ejemplos', () => {
  const payload = copy(); payload.notes = []; payload.team = [];
  assert.deepEqual(restore(payload).notes, []);
  assert.deepEqual(restore(payload).team, []);
});

const invalid = {
  'archivo ajeno': (p) => { p.format = 'otro'; },
  'versión futura': (p) => { p.version = 999; },
  'copia v2 incompleta': (p) => { delete p.notes; },
  'oportunidades vacías': (p) => { p.opportunities = []; },
  'id duplicado': (p) => { p.opportunities[1].id = p.opportunities[0].id; },
  'id ausente': (p) => { delete p.opportunities[0].id; },
  'decisión arbitraria': (p) => { p.opportunities[0].decision = 'ENVIADO'; },
  'requisito nulo': (p) => { p.opportunities[0].requirements.push(null); },
  'estado de requisito inválido': (p) => { p.opportunities[0].requirements[0].status = 'enviado'; },
  'fecha imposible': (p) => { p.opportunities[0].deadlineDate = '2026-02-30'; },
  'ajuste con tipo incorrecto': (p) => { p.settings.strictLCSP = 'false'; },
  'densidad no admitida': (p) => { p.settings.density = '<script>'; },
  'evento mal formado': (p) => { p.opportunities[2].events = {}; },
  'evento con fecha incorrecta': (p) => { p.opportunities[2].events[0].at = 'no es fecha'; },
  'historial mal formado': (p) => { p.opportunities[0].history = [null]; },
  'costes mal formados': (p) => { p.opportunities[2].economicInputs = []; },
  'checklist mal formado': (p) => { p.opportunities[2].offerChecklist[0].status = 'firmado'; },
  'firma desbloqueada': (p) => { p.opportunities[2].offerChecklist.at(-1).status = 'completed'; },
  'nota nula': (p) => { p.notes.push(null); },
  'nota con fecha incorrecta': (p) => { p.notes[0].createdAt = 'ayer'; },
  'equipo incorrecto': (p) => { p.team = 'equipo'; },
};
for (const [name, mutate] of Object.entries(invalid)) test(`rechaza ${name} sin modificar el trabajo actual`, () => {
  const before = JSON.stringify(current); const payload = copy(); mutate(payload);
  assert.throws(() => restore(payload)); assert.equal(JSON.stringify(current), before);
});
function storage(failureAt = Infinity) {
  const data = new Map([['a', 'anterior-a'], ['b', 'anterior-b']]); let calls = 0;
  return { data, getItem: (key) => data.get(key) ?? null, removeItem: (key) => data.delete(key), setItem(key, value) { if (++calls === failureAt) throw new Error('QuotaExceededError'); data.set(key, value); } };
}
test('guarda todas las colecciones en una operación comprobada', () => {
  const store = storage(); save(store, [['a', { n: 1 }], ['b', [2]], ['c', []]]);
  assert.equal(store.getItem('a'), '{"n":1}'); assert.equal(store.getItem('c'), '[]');
});
for (const failureAt of [1, 2, 3, 4]) test(`recupera el almacenamiento si falla la escritura ${failureAt}`, () => {
  const store = storage(failureAt); const before = [...store.data];
  assert.throws(() => save(store, [['a', [1]], ['c', [3]], ['b', [2]], ['d', [4]]]), /conservado/);
  assert.deepEqual([...store.data].sort(), before.sort());
});
test('avisa si el navegador también impide recuperar una escritura parcial', () => {
  const store = storage(); const set = store.setItem; let calls = 0;
  store.setItem = (key, value) => { if (++calls > 1) throw new Error('SecurityError'); set(key, value); };
  assert.throws(() => save(store, [['a', [1]], ['b', [2]]]), /No cierres la pestaña/);
});
test('serialización fallida no inicia ninguna escritura', () => {
  const store = storage(); const before = [...store.data]; const circular = {}; circular.loop = circular;
  assert.throws(() => save(store, [['a', [1]], ['b', circular]])); assert.deepEqual([...store.data], before);
});

// Second pass: exercise the actual handlers (now server-backed), not a reimplementation.
// The server double fails on demand; memory must only change after a confirmed write.
function serverDouble(fail = false) {
  const writes = [];
  return { writes, can: () => true, async createExpediente(item) { if (fail) throw Object.assign(new Error('Sin conexión con el servidor. No se ha guardado; los datos anteriores se han conservado.'), { kind: 'network' }); writes.push(['create', item.id]); return item; }, async saveSettings(data) { if (fail) throw Object.assign(new Error('Sin conexión con el servidor. No se ha guardado; los datos anteriores se han conservado.'), { kind: 'network' }); writes.push(['settings', data.workspaceName]); } };
}
async function handler(kind, approved, fail = false) {
  const cloud = serverDouble(fail); let callback;
  const element = { addEventListener(_event, fn) { callback = fn; }, value: '' };
  const scope = vm.createContext({
    structuredClone, PliegoCloud: cloud, PliegoAuthUI: { show() {} },
    window: { confirm: () => approved }, document: { querySelector: () => null },
    routeElement: { querySelector: () => element },
    opportunities: [{ id: 'custom', title: 'Trabajo actual' }], selectedId: 'custom',
    settings: { ...fixture.defaultSettings, workspaceName: 'Perfil actual' },
    seedOpportunities: fixture.seedOpportunities, defaultSettings: fixture.defaultSettings,
    render() {}, renderRoute() {}, setSaveStatus() {}, normalizeExpediente: (item) => item, showToast(message) { scope.message = message; }
  });
  const helpers = app.slice(app.indexOf('async function persistSettings('), app.indexOf('function showToast('));
  vm.runInContext(helpers, scope);
  if (kind === 'examples') {
    vm.runInContext(app.slice(app.indexOf('async function addExamples('), app.indexOf('async function retryDraft(')) + '\ncallback = addExamples;', Object.assign(scope, { callback: null }));
    callback = scope.callback;
  } else {
    vm.runInContext(app.slice(app.indexOf('  routeElement.querySelector("[data-settings-defaults]")?.addEventListener'), app.indexOf('  routeElement.querySelector("[data-export-local]")')), scope);
  }
  await callback(); return { scope, cloud };
}
for (const kind of ['examples', 'settings']) {
  test(`cancelar ${kind} no modifica memoria ni almacenamiento`, async () => {
    const { scope, cloud } = await handler(kind, false);
    assert.equal(scope.opportunities.length, 1); assert.equal(scope.opportunities[0].id, 'custom');
    assert.equal(scope.settings.workspaceName, 'Perfil actual');
    assert.equal(cloud.writes.length, 0); assert.match(scope.message, /No se ha cambiado nada/);
  });
  test(`fallo al restaurar ${kind} no cambia el trabajo en memoria`, async () => {
    const { scope } = await handler(kind, true, true);
    assert.equal(scope.opportunities.length, 1); assert.equal(scope.opportunities[0].id, 'custom');
    assert.equal(scope.settings.workspaceName, 'Perfil actual');
    assert.match(scope.message, /conservado/);
  });
  test(`restaurar ${kind} confirmado guarda antes de cambiar la interfaz`, async () => {
    const { scope, cloud } = await handler(kind, true);
    if (kind === 'examples') {
      // Ahora es aditivo: conserva el trabajo actual y añade los ejemplos que faltan, marcados.
      assert.equal(scope.opportunities.length, 1 + fixture.seedOpportunities.length);
      assert.equal(scope.opportunities[0].id, 'custom');
      assert.equal(cloud.writes.filter(([op]) => op === 'create').length, fixture.seedOpportunities.length);
      assert.ok(scope.opportunities.slice(1).every((item) => item.title.startsWith('[EJEMPLO]')));
    } else {
      assert.equal(scope.settings.workspaceName, 'Perfil actual', 'el nombre del espacio no se pierde al restaurar ajustes');
      assert.equal(scope.settings.sectors, fixture.defaultSettings.sectors);
      assert.deepEqual(cloud.writes, [['settings', 'Perfil actual']]);
    }
  });
}
