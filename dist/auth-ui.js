/* Acceso simulado en demo; las cuentas reales usan Supabase Auth. */
(() => {
  const html = (value = "") => String(value ?? "").replace(/[&<>'"`]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;", "`": "&#96;" }[char]));
  let root = null;
  let onAuthenticated = () => {};
  let mode = "login";
  let notice = "";
  let lastEmail = "";
  let loading = false;

  function ensureRoot() {
    if (root) return root;
    root = document.createElement("div");
    root.className = "auth-screen";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "authTitle");
    document.body.appendChild(root);
    return root;
  }

  const brand = `<a class="auth-brand brand" href="web/" aria-label="LicitIA, web principal"><img class="brand-logo" src="brand-logo.svg" width="36" height="36" alt="" aria-hidden="true" /><strong class="brand-name">Licit<span>IA</span></strong></a>`;
  const aside = `<aside class="auth-aside"><p class="eyebrow">LICITACIONES PÚBLICAS</p><h2>Decide qué licitaciones merecen tu tiempo y prepara las que sí.</h2><ul><li>${globalThis.PliegoDemo?.active ? "Muestra fija de licitaciones oficiales de PLACSP." : "Licitaciones oficiales de la Plataforma de Contratación del Sector Público."}</li><li>Pliegos archivados con su huella, citas a página y versiones.</li><li>Requisitos, evidencias de tu empresa y decisión GO / REVISAR / NO-GO razonada.</li><li>${globalThis.PliegoDemo?.active ? "Recorrido de seguimiento con avisos de ejemplo." : "Avisos cuando cambia el expediente oficial."}</li></ul><p class="auth-small">La decisión y la presentación siguen siendo humanas. <a href="#privacidad" data-auth-privacy>Privacidad y proveedores</a></p></aside>`;

  function field(label, name, type = "text", extra = "") {
    return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" ${extra} /></label>`;
  }

  function view() {
    if (globalThis.PliegoDemo?.active && ["login", "config", "expired"].includes(mode)) return `<p class="eyebrow">PILOTO INTERACTIVO</p><h1 id="authTitle">Entrar en LicitIA.</h1><p class="auth-lead">Tu mesa de trabajo para licitaciones públicas. En esta demo puedes entrar con cualquier usuario y contraseña.</p><form data-auth="demo-login" novalidate>${field("Correo o usuario", "email", "text", 'autocomplete="off" required placeholder="Ej. demo"')}${field("Contraseña", "password", "password", 'autocomplete="off" required placeholder="Cualquier contraseña"')}<button class="button button-dark auth-submit" type="submit">Entrar en la demo</button><p class="editor-error" data-auth-error role="alert"></p></form><p class="auth-small">Usa datos ficticios. El usuario y la contraseña de este formulario no se guardan ni se envían. El trabajo se conserva en este navegador; la IA, el equipo y los correos son simulados.</p>`;
    if (mode === "config") return `<h1 id="authTitle">Servicio en preparación</h1><p class="auth-lead">El servidor de cuentas todavía no está conectado: aún no se pueden crear cuentas ni guardar trabajo en la nube.</p>
      <p class="auth-lead">Mientras tanto puedes <strong>probar la demostración</strong>: busca licitaciones reales publicadas hoy en PLACSP, crea expedientes y trabaja requisitos, decisión, tareas, costes y exportaciones. Los datos se guardan solo en este navegador.</p>
      <button class="button button-dark auth-submit" data-demo-enter type="button">Probar la demostración</button>
      <p class="auth-small">Cuentas, documentos originales, IA, avisos por correo y equipo se activarán al conectar el servidor.</p>`;
    if (mode === "signup") return `<h1 id="authTitle">Crear cuenta</h1><p class="auth-lead">Tu cuenta tendrá un espacio privado. Nadie más lo verá salvo que le invites.</p>
      <form data-auth="signup" novalidate>${field("Nombre y apellidos", "name", "text", 'autocomplete="name" required maxlength="120"')}${field("Empresa (opcional)", "company", "text", 'autocomplete="organization" maxlength="120"')}${field("Correo", "email", "email", `autocomplete="email" required value="${html(lastEmail)}"`)}${field("Contraseña (mín. 10, letras y números)", "password", "password", 'autocomplete="new-password" required minlength="10"')}
      <label class="editor-check"><input type="checkbox" name="privacy" required /><span>He leído la <a href="#privacidad" data-auth-privacy>información de privacidad</a> y qué proveedores tratan mis datos.</span></label>
      <button class="button button-dark auth-submit" type="submit">Crear cuenta</button><p class="editor-error" data-auth-error role="alert"></p></form>
      <p class="auth-switch">¿Ya tienes cuenta? <button class="link-button" data-auth-mode="login" type="button">Entrar</button></p>`;
    if (mode === "forgot") return `<h1 id="authTitle">Recuperar contraseña</h1><p class="auth-lead">Te enviaremos un enlace temporal de un solo uso. Caduca en una hora.</p>
      <form data-auth="forgot" novalidate>${field("Correo de tu cuenta", "email", "email", `autocomplete="email" required value="${html(lastEmail)}"`)}<button class="button button-dark auth-submit" type="submit">Enviar enlace</button><p class="editor-error" data-auth-error role="alert"></p></form>
      <p class="auth-switch"><button class="link-button" data-auth-mode="login" type="button">Volver a entrar</button></p>`;
    if (mode === "recovery") return `<h1 id="authTitle">Elige una contraseña nueva</h1><p class="auth-lead">El enlace es válido. Al guardar se cerrarán las demás sesiones abiertas con la contraseña anterior cuando caduquen.</p>
      <form data-auth="recovery" novalidate>${field("Contraseña nueva", "password", "password", 'autocomplete="new-password" required minlength="10"')}${field("Repite la contraseña", "password2", "password", 'autocomplete="new-password" required minlength="10"')}<button class="button button-dark auth-submit" type="submit">Guardar contraseña</button><p class="editor-error" data-auth-error role="alert"></p></form>`;
    if (mode === "check-email") return `<h1 id="authTitle">Revisa tu correo</h1><p class="auth-lead">${html(notice)}</p><p class="auth-small">Si no llega en unos minutos, mira en correo no deseado.</p>
      <form data-auth="resend" novalidate><input type="hidden" name="email" value="${html(lastEmail)}" /><button class="button button-light" type="submit">Reenviar correo de confirmación</button><p class="editor-error" data-auth-error role="alert"></p></form>
      <p class="auth-switch"><button class="link-button" data-auth-mode="login" type="button">Ya lo he confirmado: entrar</button></p>`;
    return `<h1 id="authTitle">${mode === "expired" ? "Tu sesión ha caducado" : "Entrar"}</h1>${mode === "expired" ? '<p class="auth-notice" role="status">Vuelve a entrar para seguir. Si estabas editando, tu cambio se conserva como borrador en este navegador y podrás reintentarlo; aún no está guardado en el servidor.</p>' : ""}${notice && mode !== "expired" ? `<p class="auth-notice" role="status">${html(notice)}</p>` : ""}
      <form data-auth="login" novalidate>${field("Correo", "email", "email", `autocomplete="email" required value="${html(lastEmail)}"`)}${field("Contraseña", "password", "password", 'autocomplete="current-password" required')}<button class="button button-dark auth-submit" type="submit">Entrar</button><p class="editor-error" data-auth-error role="alert"></p></form>
      <p class="auth-switch"><button class="link-button" data-auth-mode="forgot" type="button">He olvidado la contraseña</button> · <button class="link-button" data-auth-mode="signup" type="button">Crear cuenta</button></p>`;
  }

  function render() {
    const element = ensureRoot();
    loading = false;
    element.removeAttribute("aria-busy");
    element.hidden = false;
    document.body.classList.add("auth-open");
    const shell = document.querySelector(".app-shell");
    if (shell) { shell.inert = true; shell.setAttribute("aria-hidden", "true"); }
    element.innerHTML = `<div class="auth-card"><div class="auth-main">${brand}${view()}<nav class="auth-nav" aria-label="LicitIA y blog"><a href="web/">Conocer LicitIA</a><a href="https://room-137.astral-box-9497.chatgpt.site/">Blog Room 137</a></nav></div>${aside}</div>`;
    element.querySelector("[data-demo-enter]")?.addEventListener("click", () => { if (globalThis.PliegoDemo?.active) enterDemo(); });
    element.querySelectorAll("[data-auth-mode]").forEach((button) => button.addEventListener("click", () => { mode = button.dataset.authMode; notice = ""; render(); }));
    element.querySelectorAll("[data-auth-privacy]").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); globalThis.PliegoFeatures?.showPrivacy(); }));
    element.querySelectorAll("form[data-auth]").forEach((form) => form.addEventListener("submit", (event) => submit(event, form)));
    (element.querySelector("input:not([type=hidden])") || element.querySelector("[data-demo-enter]"))?.focus();
  }

  async function enterDemo() {
    if (loading) return;
    loading = true;
    const element = ensureRoot();
    element.hidden = false;
    element.setAttribute("aria-busy", "true");
    element.innerHTML = `<section class="auth-loading-card">${brand}<span class="auth-loading-spinner" aria-hidden="true"></span><p class="eyebrow">PILOTO INTERACTIVO</p><h1 id="authTitle" tabindex="-1">Preparando tu espacio.</h1><p role="status">Estamos cargando los expedientes y tu mesa de trabajo.</p><p class="auth-small">Datos de demostración · Guardado local</p></section>`;
    element.querySelector("#authTitle")?.focus();
    const minimumWait = new Promise((resolve) => setTimeout(resolve, 7000));
    try {
      await Promise.all([minimumWait, (async () => {
        await PliegoCloud.signIn("demo@licitia.invalid", "DemoLocal2026");
        const ready = await onAuthenticated();
        if (ready === false) throw new Error("No se pudo cargar el espacio. Vuelve a intentarlo.");
      })()]);
      hide();
      const heading = document.querySelector("main h1");
      if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true }); }
    } catch (error) {
      show("login");
      root.querySelector("[data-auth-error]").textContent = error.message || "No se pudo abrir la demostración. Vuelve a intentarlo.";
    }
  }

  async function submit(event, form) {
    event.preventDefault();
    if (loading) return;
    const errorBox = form.querySelector("[data-auth-error]");
    const button = form.querySelector("button[type=submit]");
    const data = Object.fromEntries(new FormData(form));
    if (data.email && form.dataset.auth !== "demo-login") lastEmail = String(data.email).trim();
    errorBox.textContent = "";
    button.disabled = true;
    const label = button.textContent;
    button.textContent = "Un momento…";
    try {
      const kind = form.dataset.auth;
      if (kind === "demo-login") {
        if (!globalThis.PliegoDemo?.active) throw new Error("El acceso de demostración no está disponible.");
        if (!String(data.email || "").trim()) throw new Error("Escribe cualquier usuario para entrar en la demo.");
        if (!String(data.password || "").length) throw new Error("Escribe cualquier contraseña para entrar en la demo.");
        await enterDemo();
      } else if (kind === "login") {
        await PliegoCloud.signIn(String(data.email || ""), String(data.password || ""));
        hide();
        await onAuthenticated();
      } else if (kind === "signup") {
        if (!form.elements.privacy.checked) throw new Error("Confirma que has leído la información de privacidad.");
        const result = await PliegoCloud.signUp(data);
        if (result.needsConfirmation) { mode = "check-email"; notice = `Hemos enviado un enlace de confirmación a ${lastEmail}. Ábrelo para activar la cuenta; caduca en una hora.`; render(); }
        else { hide(); await onAuthenticated(); }
      } else if (kind === "forgot") {
        await PliegoCloud.requestPasswordReset(String(data.email || ""));
        mode = "login"; notice = "Si existe una cuenta con ese correo, recibirás un enlace para elegir una contraseña nueva."; render();
      } else if (kind === "resend") {
        await PliegoCloud.resendConfirmation(String(data.email || ""));
        errorBox.textContent = "Correo reenviado.";
      } else if (kind === "recovery") {
        if (data.password !== data.password2) throw new Error("Las contraseñas no coinciden.");
        await PliegoCloud.updatePassword(String(data.password || ""));
        hide();
        globalThis.PliegoApp?.toast("Contraseña actualizada.");
        await onAuthenticated();
      }
    } catch (error) {
      errorBox.textContent = error.message || "No se pudo completar.";
    } finally {
      if (button.isConnected) { button.disabled = false; button.textContent = label; }
    }
  }

  function show(nextMode = "login", message = "") { mode = nextMode; notice = message; render(); }
  function hide() {
    loading = false;
    if (root) { root.hidden = true; root.innerHTML = ""; root.removeAttribute("aria-busy"); }
    document.body.classList.remove("auth-open");
    const shell = document.querySelector(".app-shell");
    if (shell) { shell.inert = false; shell.removeAttribute("aria-hidden"); }
  }
  function isOpen() { return Boolean(root && !root.hidden); }

  // Errores devueltos por enlaces de correo (caducado o ya usado) llegan en el fragmento de la URL.
  function linkErrorFromUrl() {
    const raw = location.hash.startsWith("#") ? location.hash.slice(1) : "";
    if (!/error_description=|error_code=/.test(raw)) return "";
    const params = new URLSearchParams(raw);
    const code = params.get("error_code") || "";
    history.replaceState(null, "", `${location.pathname}${location.search}#hoy`);
    if (code === "otp_expired") return "El enlace ha caducado o ya se utilizó. Pide uno nuevo.";
    return params.get("error_description") || "El enlace no es válido.";
  }

  globalThis.PliegoAuthUI = Object.freeze({
    init(handler) { onAuthenticated = handler; },
    show, hide, isOpen, isLoading: () => loading, linkErrorFromUrl
  });
})();
