// Regenera el ejemplo completo al cambiar la muestra o el PDF. Recibe sus páginas
// extraídas como JSON [{page_number, text}]. No realiza peticiones de red.
// Uso: node scripts/build-demo-data.mjs /ruta/noia-pages.json
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const pages = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
if (pages.length !== 57 || pages.some((page, i) => page.page_number !== i + 1 || !page.text)) throw new Error('Se necesitan las 57 páginas del PDF original.');
const dataset = JSON.parse(await fs.readFile(path.join(dist, 'demo/licitaciones.json'), 'utf8'));
const workspace = { seeded: true, expedientes: {}, settings: { data: {}, version: 1 }, notes: [], roles: [], members: [], tables: {} };
const context = vm.createContext({
  URL, Date, crypto: webcrypto, Intl,
  document: { baseURI: 'https://nestorguerra.github.io/pliego-claro/' },
  fetch: async (file) => ({ blob: async () => new Blob([await fs.readFile(path.join(dist, file))]) })
});
for (const name of ['workflow.js', 'features.js', 'cloud.js', 'demo.js', 'demo-seed.js']) {
  vm.runInContext(await fs.readFile(path.join(dist, name), 'utf8'), context, { filename: name });
}
const WS = context.PliegoDemo.WS;
const ME = context.PliegoDemo.ME;
const table = (name) => (workspace.tables[name] ||= []);
await context.PliegoDemoSeed.seed({
  user: { name: 'Demo', email: 'demo@licitia.invalid' }, WS, ME,
  load: () => workspace, table, putFile: async () => {},
  sha256: async (buffer) => Buffer.from(await webcrypto.subtle.digest('SHA-256', buffer)).toString('hex'),
  dataset: async () => dataset, analyzePages: context.PliegoDemo.analyzePages,
  extractPages: async () => pages,
  log: (expediente_id, action, detail, actor_id = ME, created_at = new Date().toISOString()) => table('activity_log').push({ id: webcrypto.randomUUID(), expediente_id, actor_id, action, detail, created_at })
});
for (const doc of workspace.tables.documents || []) doc.bundled_source = 'demo/noia-pcap.pdf';
const data = JSON.stringify({ generatedAt: new Date().toISOString(), dataset, workspace }).replace(/</g, '\\u003c');
await fs.writeFile(path.join(dist, 'demo-data.js'), `/* Muestra pública y espacio ficticio preparados antes del acceso. Regenerar con scripts/build-demo-data.mjs. */\nglobalThis.PliegoDemoData = ${data};\n`);
console.log(`Demo preparada: ${Object.keys(workspace.expedientes).length} expedientes, ${pages.length} páginas, ${dataset.tenders.length} licitaciones.`);
