const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../dist/demo.js'), 'utf8');
async function statsFor(meta) {
  class FutureDate extends Date { static now() { return Date.parse('2030-01-01T12:00:00Z'); } }
  const context = vm.createContext({
    Date: FutureDate,
    PliegoCloud: { configured: false, state: {}, CloudError: Error },
    fetch: async () => ({ ok: true, json: async () => ({ meta, tenders: [] }) })
  });
  vm.runInContext(source, context);
  return context.PliegoCloud.client.rpc('tender_stats', {});
}
test('la muestra fija conserva su fecha real aunque el reloj avance', async () => {
  const result = await statsFor({ generadoEl: '2026-10-08T20:03:15.914569+00:00', total: 0 });
  assert.equal(result.error, null);
  assert.equal(result.data.demo, true);
  assert.equal(result.data.lastOk, '2026-10-08T20:03:15.914569+00:00');
  assert.equal(result.data.lastRun, null);
});
test('una muestra sin fecha no inventa una sincronización reciente', async () => {
  const result = await statsFor({ total: 0 });
  assert.equal(result.data.demo, true);
  assert.equal(result.data.lastOk, null);
  assert.equal(result.data.lastRun, null);
});
