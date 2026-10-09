const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const read = (name) => fs.readFileSync(path.join(__dirname, '../dist', name), 'utf8');

function harness({ blockedStorage = false, existing } = {}) {
  const storage = new Map(existing ? [['pliego-claro-demo-v2', JSON.stringify(existing)]] : []);
  let fetches = 0;
  const context = vm.createContext({
    URL, Date, Intl, crypto: webcrypto, window: {},
    localStorage: {
      getItem(key) { if (blockedStorage) throw new Error('Storage blocked'); return storage.get(key) || null; },
      setItem(key, value) { if (blockedStorage) throw new Error('Storage blocked'); storage.set(key, value); },
      removeItem(key) { storage.delete(key); }
    },
    fetch() { fetches += 1; return new Promise(() => {}); },
    indexedDB: { open() { throw new Error('El acceso no debe abrir IndexedDB'); } }
  });
  for (const name of ['cloud.js', 'demo-data.js', 'demo.js']) vm.runInContext(read(name), context, { filename: name });
  return { context, storage, get fetches() { return fetches; } };
}

test('la primera visita obtiene ocho expedientes sin esperar red, PDF ni IndexedDB', async () => {
  const h = harness();
  const data = h.context.PliegoDemo.enter();
  assert.equal(typeof data.then, 'undefined');
  assert.equal(data.opportunities.length, 8);
  assert.equal(data.members.length, 4);
  assert.equal(h.fetches, 0);
  assert.equal(h.context.PliegoCloud.state.role, 'owner');
  assert.equal(h.context.PliegoCloud.can('editor'), true);
  const stats = await h.context.PliegoCloud.client.rpc('tender_stats', {});
  assert.equal(stats.data.total, 279);
  assert.equal(h.fetches, 0, 'las estadísticas tampoco bloquean con una descarga');
  const pages = h.context.PliegoDemoData.workspace.tables.document_pages;
  assert.equal(pages.length, 57);
  assert.ok(pages.every((page) => page.text.length > 0));
});

test('el acceso funciona en memoria aunque el navegador bloquee el almacenamiento', async () => {
  const h = harness({ blockedStorage: true });
  const data = h.context.PliegoDemo.enter();
  assert.equal(data.opportunities.length, 8);
  assert.equal(h.context.PliegoDemo.persistent, false);
  assert.ok(await h.context.PliegoCloud.currentSession());
  assert.equal(h.fetches, 0);
});

test('volver a entrar conserva el trabajo local existente', () => {
  const first = harness();
  first.context.PliegoDemo.enter();
  const existing = JSON.parse(first.storage.get('pliego-claro-demo-v2'));
  existing.notes.unshift({ id: 'nota-usuario', text: 'Conservar mi trabajo' });
  const id = Object.keys(existing.expedientes)[0];
  existing.expedientes[id].data.nextStep = 'Mi siguiente paso';
  const next = harness({ existing });
  const data = next.context.PliegoDemo.enter();
  assert.equal(data.notes[0].text, 'Conservar mi trabajo');
  assert.equal(data.opportunities.find((item) => item.id === id).nextStep, 'Mi siguiente paso');
});

test('cerrar sesión elimina también la sesión temporal en memoria', async () => {
  const h = harness({ blockedStorage: true });
  h.context.PliegoDemo.enter();
  await h.context.PliegoCloud.signOut();
  assert.equal(await h.context.PliegoCloud.currentSession(), null);
});

test('la pantalla de inicio se abre aunque una carga auxiliar no responda', () => {
  const app = read('app.js');
  const boot = app.match(/function bootDemo\(data\) \{[\s\S]*?\n\}/)[0];
  const calls = [];
  const context = vm.createContext({
    applyWorkspaceData: (data) => calls.push(['data', data]),
    displayWorkspace: (workspace) => calls.push(['visible', workspace]),
    history: { replaceState: (_state, _unused, url) => calls.push(['route', url]) },
    location: { pathname: '/', search: '' },
    document: { body: { classList: { remove() {} } } },
    PliegoFeatures: { onWorkspaceLoaded: () => new Promise(() => {}) },
    render() {}, showToast() {}
  });
  vm.runInContext(boot, context);
  const data = { workspace: { name: 'Ejemplo' } };
  assert.equal(context.bootDemo(data), true);
  assert.deepEqual(calls, [['data', data], ['route', '/#hoy'], ['visible', data.workspace]]);
});
