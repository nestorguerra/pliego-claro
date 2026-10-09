const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../dist/auth-ui.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function harness({ entryError, renderError, renderResult = true } = {}) {
  const timers = [];
  const calls = [];
  const shell = { inert: false, setAttribute() {}, removeAttribute() {} };
  const heading = { focus() {}, setAttribute() {} };
  let form;
  const root = {
    hidden: true, markup: '', setAttribute() {}, removeAttribute() {},
    set innerHTML(value) {
      this.markup = value;
      if (!value.includes('form data-auth=')) { form = null; return; }
      const error = { textContent: '' };
      const button = { disabled: false, textContent: 'Entrar en la demo', get isConnected() { return form?.button === this; } };
      form = {
        dataset: { auth: 'demo-login' }, values: { email: 'usuario-libre', password: '1' }, error, button,
        addEventListener(name, handler) { this[name] = handler; },
        querySelector(selector) { return selector === '[data-auth-error]' ? error : button; }
      };
    },
    get innerHTML() { return this.markup; },
    querySelectorAll(selector) { return selector === 'form[data-auth]' && form ? [form] : []; },
    querySelector(selector) {
      if (selector === '[data-demo-enter]') return null;
      if (selector === '[data-auth-error]') return form?.error;
      return heading;
    }
  };
  const data = { workspace: { name: 'Demo' }, opportunities: [{ id: 'ejemplo' }] };
  let renders = 0;
  const context = vm.createContext({
    setTimeout(fn, ms) { timers.push({ fn, ms }); },
    FormData: class { constructor(target) { return new Map(Object.entries(target.values)); } },
    PliegoDemo: { active: true, enter() { calls.push('enter'); if (entryError) throw new Error(entryError); return data; } },
    PliegoCloud: { signIn() { throw new Error('El acceso de demo no debe esperar a una sesión remota'); } },
    document: {
      createElement: () => root,
      body: { appendChild() {}, classList: { add() {}, remove() {} } },
      querySelector: (selector) => selector === '.app-shell' ? shell : heading
    }
  });
  vm.runInContext(source, context);
  const ui = context.PliegoAuthUI;
  ui.init((workspace) => { assert.equal(workspace, data); renders += 1; if (renderError) throw new Error(renderError); return renderResult; });
  ui.show('login');
  return { root, shell, ui, timers, calls, get renders() { return renders; }, get form() { return form; }, submit(target = form) { return target.submit({ preventDefault() {} }); } };
}

test('el acceso mantiene la pantalla de carga siete segundos aunque el producto ya esté listo', async () => {
  const h = harness();
  const attempt = h.submit();
  await flush();
  assert.equal(h.ui.isLoading(), true);
  assert.equal(h.root.hidden, false);
  assert.equal(h.shell.inert, true);
  assert.match(h.root.innerHTML, /Preparando tu espacio/);
  assert.equal(h.timers[0].ms, 7000);
  await flush();
  assert.equal(h.root.hidden, false, 'la preparación no termina la espera mínima');
  assert.equal(h.renders, 0);
  h.timers[0].fn();
  await attempt;
  assert.equal(h.root.hidden, true);
  assert.equal(h.shell.inert, false);
  assert.equal(h.ui.isLoading(), false);
  assert.deepEqual(h.calls, ['enter'], 'no se pasan las credenciales escritas ni se espera una sesión remota');
  assert.equal(h.renders, 1);
});

test('al cumplirse siete segundos se muestra el espacio directamente', async () => {
  const h = harness();
  const attempt = h.submit();
  h.timers[0].fn();
  await attempt;
  assert.equal(h.root.hidden, true);
  assert.equal(h.shell.inert, false);
  assert.equal(h.renders, 1);
});

test('un fallo al preparar el producto vuelve al formulario con un error visible', async () => {
  const h = harness({ renderResult: false });
  const attempt = h.submit();
  h.timers[0].fn();
  await attempt;
  assert.equal(h.root.hidden, false);
  assert.equal(h.ui.isLoading(), false);
  assert.match(h.form.error.textContent, /No se pudo abrir la demostración/);
  assert.equal(h.shell.inert, true);
});

test('pulsar Enter de nuevo durante la carga no inicia otra sesión', async () => {
  const h = harness();
  const original = h.form;
  const attempt = h.submit(original);
  await h.submit(original);
  assert.equal(h.timers.length, 1);
  h.timers[0].fn();
  await attempt;
  assert.equal(h.calls.length, 1);
});

test('un fallo de acceso deja disponible el formulario para reintentar', async () => {
  const h = harness({ entryError: 'Ejemplos no disponibles' });
  const attempt = h.submit();
  h.timers[0].fn();
  await attempt;
  assert.equal(h.root.hidden, false);
  assert.equal(h.ui.isLoading(), false);
  assert.match(h.form.error.textContent, /Ejemplos no disponibles/);
});

test('un error de renderizado no deja el indicador girando sin fin', async () => {
  const h = harness({ renderError: 'No se pudo dibujar el inicio' });
  const attempt = h.submit();
  h.timers[0].fn();
  await attempt;
  assert.equal(h.ui.isLoading(), false);
  assert.match(h.form.error.textContent, /No se pudo dibujar el inicio/);
});
