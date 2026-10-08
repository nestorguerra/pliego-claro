/* H03 · Copia completa: ida y vuelta con originales, huellas y remapeo de referencias. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const scope = vm.createContext({ console, crypto: globalThis.crypto, Blob, TextEncoder, TextDecoder, setTimeout, clearTimeout, setImmediate, queueMicrotask, structuredClone, Uint8Array, ArrayBuffer, Promise, document: { baseURI: 'https://example.test/' } });
scope.globalThis = scope; scope.self = scope; scope.window = scope;
vm.runInContext(fs.readFileSync(path.join(root, 'dist/vendor/jszip-3.10.1.min.js'), 'utf8'), scope);
vm.runInContext(fs.readFileSync(path.join(root, 'dist/backup-full.js'), 'utf8'), scope);
const { PliegoFullBackup: full, JSZip } = scope;
const sha = (buf) => crypto.createHash('sha256').update(Buffer.from(buf)).digest('hex');
const pdf = new TextEncoder().encode('%PDF-1.7 pliego de prueba').buffer;
const base = { format: 'pliego-claro-mvp', version: 2, opportunities: [{ id: 'exp-1', title: 'Caso', decision: 'REVISAR', requirements: [], documents: [{ id: 'archivo-doc-1', storedDocumentId: 'doc-1', url: 'https://example.test/#documento=doc-1', name: 'PCAP.pdf', kind: 'PCAP', version: 'v1', reviewedAt: '', registeredAt: '2026-10-08T10:00:00Z' }] }], notes: [], team: [], settings: {} };
const extras = { workspace: { name: 'Prueba' }, documents: [{ id: 'doc-1', expediente: 'exp-1', name: 'PCAP.pdf', kind: 'PCAP', sha256: sha(pdf), size_bytes: pdf.byteLength, mime_type: 'application/pdf', storage_path: 'ws/exp/a.pdf', created_at: '2026-10-08T10:00:00Z' }], pages: [{ document_id: 'doc-1', page_number: 1, text: 'Cláusula 7', method: 'text' }], analyses: [], comments: [{ expediente: 'exp-1', author: 'Ana', body: 'Revisar solvencia', created_at: '2026-10-08T10:00:00Z' }], alerts: [], activity: [], members: [] };

test('la copia completa incluye originales verificados, texto y comentarios, sin rutas internas', async () => {
  const { zip, manifest } = await full.buildPackage(JSZip, base, extras, async () => pdf);
  assert.equal(manifest.files[0].verified, true);
  assert.equal(manifest.counts.documentos, 1); assert.equal(manifest.counts.paginas, 1); assert.equal(manifest.counts.comentarios, 1);
  const buffer = await zip.generateAsync({ type: 'uint8array' });
  const read = await full.readPackage(JSZip, buffer);
  assert.equal(sha(read.buffers['doc-1']), sha(pdf));
  assert.equal(read.payload.cloud.pages[0].text, 'Cláusula 7');
  assert.equal(read.payload.cloud.documents[0].storage_path, undefined, 'no se exportan rutas internas de almacenamiento');
});

test('un original modificado dentro del zip hace fallar la restauración antes de escribir', async () => {
  const { zip, manifest } = await full.buildPackage(JSZip, base, extras, async () => pdf);
  zip.file(manifest.files[0].zipPath, 'contenido alterado');
  const buffer = await zip.generateAsync({ type: 'uint8array' });
  await assert.rejects(() => full.readPackage(JSZip, buffer), /huella .* no coincide/);
});

test('archivos corruptos o ajenos se rechazan sin cambios', async () => {
  await assert.rejects(() => full.readPackage(JSZip, new TextEncoder().encode('no es un zip')), /no es un \.zip válido/);
  const other = new JSZip(); other.file('hola.txt', 'x');
  await assert.rejects(async () => full.readPackage(JSZip, await other.generateAsync({ type: 'uint8array' })), /Falta manifiesto/);
});

test('un original que no se puede descargar queda señalado en el manifiesto', async () => {
  const { manifest } = await full.buildPackage(JSZip, base, extras, async () => { throw new Error('403'); });
  assert.equal(manifest.files[0].zipPath, null); assert.match(manifest.files[0].error, /403/);
});

test('tras restaurar, las referencias apuntan a los originales nuevos', () => {
  const item = structuredClone(base.opportunities[0]);
  item.requirements = [{ id: 'r', documentId: 'archivo-doc-1', sourceUrl: 'https://example.test/#documento=doc-1' }];
  assert.equal(full.remapStoredDocuments(item, { 'doc-1': 'doc-nuevo' }), true);
  assert.equal(item.documents[0].storedDocumentId, 'doc-nuevo');
  assert.equal(item.documents[0].url, 'https://example.test/#documento=doc-nuevo');
  assert.equal(item.requirements[0].sourceUrl, item.documents[0].url, 'la evidencia sigue enlazada al mismo documento');
  assert.equal(full.remapStoredDocuments(item, { 'doc-1': 'doc-nuevo' }), false);
});
