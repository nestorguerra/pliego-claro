/* Pruebas de la capa con cuentas sin red: errores, contraseñas, expediente oficial,
   coincidencias visibles, calendario e informe. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
function load(extra = {}) {
  const storage = new Map();
  const scope = vm.createContext({
    structuredClone, Intl, URL, URLSearchParams, Blob, crypto, setTimeout, clearTimeout, console,
    location: { origin: 'https://example.test', pathname: '/pliego-claro/', hash: '' },
    history: { replaceState() {} },
    localStorage: { get length() { return storage.size; }, key: (i) => [...storage.keys()][i], getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    document: { baseURI: 'https://example.test/pliego-claro/', scripts: [], createElement: () => ({}), body: { appendChild() {}, classList: { add() {}, remove() {} } } },
    window: {}, PLIEGO_CONFIG: {}, ...extra
  });
  scope.globalThis = scope;
  for (const file of ['workflow.js', 'cloud.js', 'features.js']) vm.runInContext(fs.readFileSync(path.join(root, 'dist', file), 'utf8'), scope);
  return scope;
}
const scope = load();
const { PliegoCloud: cloud, PliegoFeatures: features } = scope;

test('sin configuración no se simula una cuenta', () => {
  assert.equal(cloud.configured, false);
  assert.equal(cloud.client, null);
});

test('clasifica errores de red, sesión, conflicto y permisos con mensajes accionables', () => {
  assert.equal(cloud.classify(new TypeError('Failed to fetch')).kind, 'network');
  assert.equal(cloud.classify({ status: 401, message: 'JWT expired' }).kind, 'session');
  assert.equal(cloud.classify({ code: '40001', message: 'conflicto de versión' }).kind, 'conflict');
  const permission = cloud.classify({ code: '42501', message: 'new row violates row-level security policy' });
  assert.equal(permission.kind, 'permission');
  assert.doesNotMatch(permission.message, /row-level/, 'no se muestra jerga interna');
  assert.equal(cloud.classify({ code: '23514', message: 'check' }).kind, 'validation');
  assert.match(cloud.classify({ status: 401 }).message, /borrador/);
});

test('contraseñas y correos se validan antes de llamar al servidor', () => {
  assert.match(cloud.validatePassword('corta1'), /10 caracteres/);
  assert.match(cloud.validatePassword('soloLetrasLargas'), /letras y números/);
  assert.equal(cloud.validatePassword('Licitaciones2026'), '');
  assert.notEqual(cloud.validateEmail('no-es-correo'), '');
  assert.equal(cloud.validateEmail('ana@example.test'), '');
});

test('el registro inválido no llega al servidor', async () => {
  await assert.rejects(() => cloud.signUp({ name: '', email: 'ana@example.test', password: 'Licitaciones2026' }), /nombre/);
  await assert.rejects(() => cloud.signUp({ name: 'Ana', email: 'mal', password: 'Licitaciones2026' }), /correo/);
  await assert.rejects(() => cloud.signUp({ name: 'Ana', email: 'ana@example.test', password: '123' }), /10 caracteres/);
});

const tender = {
  id: '11111111-2222-3333-4444-555555555555', external_id: 'https://contrataciondelestado.es/sindicacion/licitacionesPerfilContratante/1', folder_id: '3686/2026',
  link: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=x', title: 'Mantenimiento de caminos rurales', buyer: 'Ayuntamiento de Noia', buyer_city: 'Noia', province: 'A Coruña',
  status_code: 'PUB', contract_type: '3', procedure_code: '9', cpv: ['45233250'], amount_without_tax: 47120.52, amount_with_tax: null,
  deadline_at: '2099-10-26T22:59:00+00:00', documents: [{ kind: 'PCAP', name: 'PCAP.pdf', url: 'https://contrataciondelestado.es/doc?id=1', hash: 'abc123' }, { kind: 'Otro', name: 'Malo', url: 'javascript:alert(1)' }],
  lots: [], criteria: [{ text: 'Precio', weight: 30 }], qualification: [{ type: 'Solvencia técnica', text: 'Obras similares en 5 años' }, { type: 'Declaración', text: 'Capacidad de obrar' }]
};

test('un expediente oficial conserva fuente, separa ausentes de cero y no admite enlaces inseguros', () => {
  const item = features.expedienteFromTender(tender, { defaultDecision: 'REVISAR' });
  assert.equal(item.id, `placsp-${tender.id}`);
  assert.equal(item.decision, 'REVISAR');
  assert.equal(item.deadlineDate, '2099-10-26', 'la fecha se calcula en hora de Madrid (23:59 del día 26)');
  assert.equal(features.expedienteFromTender({ ...tender, deadline_at: '2099-07-01T22:30:00Z' }, {}).deadlineDate, '2099-07-02', 'en verano 22:30 UTC ya es el día siguiente en Madrid');
  assert.match(item.amount, /47\.120,52/);
  assert.doesNotMatch(item.amount, /0,00/, 'el importe con IVA ausente no se convierte en cero');
  assert.equal(item.documents.length, 1);
  assert.equal(item.documents[0].reviewedAt, '', 'un documento publicado no cuenta como revisado');
  assert.equal(item.requirements[0].status, 'pending');
  assert.equal(item.requirements[0].critical, true);
  assert.equal(item.requirements[1].critical, false, 'una declaración genérica no es decisiva');
  assert.equal(item.official.historic, false);
  assert.equal(scope.PliegoClaroWorkflow.canGo(item), false, 'GO sigue exigiendo evidencia trazable');
});

test('un caso cerrado o adjudicado se marca como histórico', () => {
  assert.equal(features.isHistoric({ ...tender, status_code: 'ADJ' }), true);
  assert.equal(features.isHistoric({ ...tender, deadline_at: '2020-01-01T00:00:00Z' }), true);
  const item = features.expedienteFromTender({ ...tender, status_code: 'ADJ' }, {});
  assert.match(item.deadline, /Histórico/);
  assert.match(item.nextStep, /histórico/i);
});

test('las coincidencias con el perfil son razones visibles, no una puntuación que oculta', () => {
  const reasons = features.fitReasons(tender, { sectors: 'Obras de caminos rurales, CPV 4523', locations: 'A Coruña, Lugo' });
  assert.ok(reasons.some((r) => /caminos|rurales/.test(r)));
  assert.ok(reasons.some((r) => /CPV 4523/.test(r)));
  assert.ok(reasons.some((r) => /A Coruña/.test(r)));
  assert.match(features.fitReasons(tender, {})[0], /Completa sectores/);
  assert.equal(features.amountLabel({ amount_without_tax: null, amount_with_tax: null }), 'Importe no publicado en la fuente');
});

test('el calendario mantiene hora y zona y no duplica eventos al reexportar', () => {
  const item = features.expedienteFromTender(tender, {});
  item.taskPlans = { t1: { dueDate: '2099-10-20', ownerId: '', note: 'Reunir certificados' } };
  const ics = features.buildIcs([item, { ...item, id: 'descartado', decision: 'NO-GO' }], new Date('2026-10-08T10:00:00Z'));
  assert.match(ics, /DTSTART;TZID=Europe\/Madrid:20991026T235900/, '22:59 UTC en invierno son las 23:59 en Madrid');
  assert.match(ics, /BEGIN:VTIMEZONE\r\nTZID:Europe\/Madrid/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2, 'NO-GO no genera eventos');
  const again = features.buildIcs([item], new Date('2026-10-09T10:00:00Z'));
  const uids = (s) => s.match(/^UID:.*$/gm);
  assert.deepEqual(uids(ics), uids(again), 'mismo UID: actualizar no duplica');
});

test('los borradores se guardan por cuenta, espacio y expediente', () => {
  const local = load();
  local.PliegoCloud.state.user = { id: 'u1' };
  local.PliegoCloud.state.workspaceId = 'w1';
  assert.equal(local.PliegoCloud.drafts().length, 0);
  local.localStorage.setItem('pliego-claro-borrador:u1:w1:caso', JSON.stringify({ item: { id: 'caso', title: 'Caso' }, reason: 'network', at: '2026-10-08T10:00:00Z' }));
  local.localStorage.setItem('pliego-claro-borrador:otra:w1:caso', JSON.stringify({ item: { id: 'caso' } }));
  assert.equal(local.PliegoCloud.drafts().length, 1);
  local.PliegoCloud.clearDraft('caso');
  assert.equal(local.PliegoCloud.drafts().length, 0);
});

test('la vista de búsqueda no inventa resultados y explica la cobertura', () => {
  features.state.search.results = [];
  features.state.search.stats = { total: 0, vigentes: 0, lastOk: null, lastRun: { status: 'failed', error: 'HTTP 503', finished_at: '2026-10-08T10:00:00Z' } };
  const out = features.searchMarkup({}, []);
  assert.match(out, /No hay licitaciones con estos filtros/);
  assert.match(out, /falló/);
  assert.match(out, /HTTP 503/);
});

test('la información de privacidad nombra a todos los proveedores', () => {
  const text = features.privacyMarkup();
  for (const provider of ['Supabase', 'GitHub Pages', 'Anthropic', 'Resend']) assert.match(text, new RegExp(provider));
  assert.match(text, /No se afirma cumplimiento legal/);
});

const plain = (value) => JSON.parse(JSON.stringify(value));
// H04 · OCR: nunca «done» si quedan páginas sin procesar o sin texto suficiente.
test('OCR sin extracción previa en un PDF de 55 páginas no queda como leído tras 40', () => {
  const plan = features.ocrPlan(55, [], 40);
  assert.equal(plan.targets.length, 40); assert.equal(plan.deferred.length, 15);
  const results = plan.targets.map((page) => ({ page, text: 'Cláusula '.repeat(10), confidence: 90 }));
  const outcome = features.ocrOutcome(plan, results);
  assert.equal(outcome.status, 'partial');
  assert.deepEqual(plain(outcome.pending), Array.from({ length: 15 }, (_, i) => 41 + i));
  assert.equal(features.pageRanges(outcome.pending), '41–55');
});
test('OCR de un PDF mixto solo procesa las páginas débiles y termina en done si todas quedan legibles', () => {
  const existing = [{ page_number: 1, text: 'texto suficiente '.repeat(5) }, { page_number: 2, text: '' }, { page_number: 3, text: 'x' }];
  const plan = features.ocrPlan(3, existing, 40);
  assert.deepEqual(plain(plan.targets), [2, 3]);
  const done = features.ocrOutcome(plan, [{ page: 2, text: 'a'.repeat(60), confidence: 88 }, { page: 3, text: 'b'.repeat(60), confidence: 65 }]);
  assert.equal(done.status, 'done'); assert.deepEqual(plain(done.lowConfidence), [3]);
});
test('OCR con texto pobre, baja confianza o cancelado no se da por leído', () => {
  const plan = features.ocrPlan(3, [], 40);
  assert.equal(features.ocrOutcome(plan, [{ page: 1, text: 'a'.repeat(60), confidence: 90 }, { page: 2, text: 'ilegible', confidence: 90 }, { page: 3, text: 'c'.repeat(60), confidence: 30 }]).status, 'partial');
  const cancelled = features.ocrOutcome(plan, [{ page: 1, text: 'a'.repeat(60), confidence: 90 }], true);
  assert.equal(cancelled.status, 'partial'); assert.equal(cancelled.cancelled, true); assert.deepEqual(plain(cancelled.pending), [2, 3]);
});
// H10 · CSV: las celdas no se ejecutan como fórmulas al abrir la hoja de cálculo.
test('la matriz CSV neutraliza fórmulas y escapa comillas', () => {
  const csv = features.csvText([['Requisito', 'Evidencia'], ['=HYPERLINK("http://x","clic")', '+1+1'], ['-2', '@SUM(A1)'], ['\tTab', 'Texto "con" comillas']]);
  assert.ok(csv.startsWith('﻿'));
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/x"",""clic""\)"/);
  assert.match(csv, /"'\+1\+1"/); assert.match(csv, /"'-2"/); assert.match(csv, /"'@SUM\(A1\)"/); assert.match(csv, /"'\tTab"/);
  assert.match(csv, /"Texto ""con"" comillas"/);
});
