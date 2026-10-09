const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../dist/auth-ui.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function harness({ signInError } = {}) {
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
  let ready;
  const prepared = new Promise((resolve) => { ready = resolve; });
  const context = vm.createContext({
    setTimeout(fn, ms) { timers.push({ fn, ms }); },
    FormData: class { constructor(target) { return new Map(Object.entries(target.values)); } },
    PliegoDemo: { active: true },
    PliegoCloud: { async signIn(...args) { calls.push(args); if (signInError) throw new Error(signInError); } },
    document: {
      createElement: () => root,
      body: { appendChild() {}, classList: { add() {}, remove() {} } },
      querySelector: (selector) => selector === '.app-shell' ? shell : heading
    }
  });
  vm.runInContext(source, context);
  const ui = context.PliegoAuthUI;
  ui.init(() => prepared);
  ui.show('login');
  return { root, shell, ui, timers, calls, ready, get form() { return form; }, submit(target = form) { return target.submit({ preventDefault() {} }); } };
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
  h.ready(true);
  await flush();
  assert.equal(h.root.hidden, false, 'la preparación no termina la espera mínima');
  h.timers[0].fn();
  await attempt;
  assert.equal(h.root.hidden, true);
  assert.equal(h.shell.inert, false);
  assert.equal(h.ui.isLoading(), false);
  assert.deepEqual(h.calls, [['demo@licitia.invalid', 'DemoLocal2026']], 'no se pasan las credenciales escritas');
});

test('siete segundos no desbloquean una aplicación que todavía está cargando', async () => {
  const h = harness();
  const attempt = h.submit();
  h.timers[0].fn();
  await flush();
  assert.equal(h.root.hidden, false);
  assert.equal(h.shell.inert, true);
  h.ready(true);
  await attempt;
  assert.equal(h.root.hidden, true);
  assert.equal(h.shell.inert, false);
});

test('un fallo al preparar el producto vuelve al formulario con un error visible', async () => {
  const h = harness();
  const attempt = h.submit();
  h.ready(false);
  await attempt;
  assert.equal(h.root.hidden, false);
  assert.equal(h.ui.isLoading(), false);
  assert.match(h.form.error.textContent, /No se pudo cargar el espacio/);
  assert.equal(h.shell.inert, true);
});

test('pulsar Enter de nuevo durante la carga no inicia otra sesión', async () => {
  const h = harness();
  const original = h.form;
  const attempt = h.submit(original);
  await h.submit(original);
  assert.equal(h.calls.length, 1);
  h.ready(true);
  h.timers[0].fn();
  await attempt;
});

test('un fallo de acceso deja disponible el formulario para reintentar', async () => {
  const h = harness({ signInError: 'Almacenamiento no disponible' });
  await h.submit();
  assert.equal(h.root.hidden, false);
  assert.equal(h.ui.isLoading(), false);
  assert.match(h.form.error.textContent, /Almacenamiento no disponible/);
});
