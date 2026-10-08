"""Comprobación de entrega: ¿está el SaaS realmente listo o solo la web publicada?

Imprime una tabla en el resumen de GitHub Actions. Si la variable REQUIRE_SAAS=true y falla algo
esencial (web conectada, autenticación con confirmación, correo SMTP, funciones, base de datos),
termina con error. Nunca imprime valores secretos.
"""
import json
import os
import sys
import urllib.error
import urllib.request

SITE = os.environ.get("SITE_URL") or f"https://{os.environ.get('GITHUB_REPOSITORY_OWNER', 'nestorguerra')}.github.io/{os.environ.get('GITHUB_REPOSITORY', '/pliego-claro').split('/')[-1]}/"
REF, TOKEN = os.environ.get("PROJECT_REF", ""), os.environ.get("SUPABASE_ACCESS_TOKEN", "")
checks = []  # (nombre, esencial, ok, detalle)


def fetch(url, headers=None, method="GET", data=None):
    req = urllib.request.Request(url, headers=headers or {}, method=method, data=data)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()
    except Exception as error:  # noqa: BLE001
        return 0, str(error).encode()


def add(name, essential, ok, detail):
    checks.append((name, essential, bool(ok), detail))


status, body = fetch(SITE + "config.js")
config = {}
if status == 200:
    try:
        config = json.loads(body.decode().split("window.PLIEGO_CONFIG = ", 1)[1].rsplit(";", 1)[0])
    except Exception:  # noqa: BLE001
        config = {}
add("Web publicada", True, status == 200, f"{SITE} → HTTP {status}")
url, key = config.get("supabaseUrl", ""), config.get("supabaseKey", "")
add("Web conectada al servidor", True, bool(url and key) and not key.startswith("sb_secret_"), url or "config.js vacío: la web muestra «Falta la conexión con el servidor»")

if url and key:
    s, b = fetch(f"{url}/auth/v1/settings", {"apikey": key})
    auth = json.loads(b or b"{}") if s == 200 else {}
    add("Autenticación por correo con confirmación", True, s == 200 and auth.get("external", {}).get("email") and not auth.get("mailer_autoconfirm") and not auth.get("disable_signup"), f"HTTP {s}; autoconfirm={auth.get('mailer_autoconfirm')}")
    s, _ = fetch(f"{url}/functions/v1/service-status", {"apikey": key, "Content-Type": "application/json"}, "POST", b"{}")
    add("Funciones desplegadas y protegidas", True, s == 401, f"sin sesión → HTTP {s} (se espera 401)")
    s, b = fetch(f"{url}/rest/v1/expedientes?select=id&limit=1", {"apikey": key})
    add("Base de datos sin acceso anónimo", True, s in (200, 401) and (s == 401 or b.strip() == b"[]"), f"anónimo → HTTP {s}, {b[:40]!r}")

if REF and TOKEN:
    auth_headers = {"Authorization": f"Bearer {TOKEN}"}
    s, b = fetch(f"https://api.supabase.com/v1/projects/{REF}/config/auth", auth_headers)
    cfg = json.loads(b or b"{}") if s == 200 else {}
    add("Correo SMTP propio (no el restringido de Supabase)", True, bool(cfg.get("smtp_host")), f"SMTP: {cfg.get('smtp_host') or 'no configurado'}; remitente: {cfg.get('smtp_admin_email') or '—'}")
    add("Redirecciones a esta web", True, (cfg.get("site_url") or "").rstrip("/") == SITE.rstrip("/"), f"site_url={cfg.get('site_url')}")
    add("Cambio de contraseña con reautenticación", False, cfg.get("security_update_password_require_reauthentication") is True, str(cfg.get("security_update_password_require_reauthentication")))
    s, b = fetch(f"https://api.supabase.com/v1/projects/{REF}/secrets", auth_headers)
    names = {item.get("name") for item in json.loads(b or b"[]")} if s == 200 else set()
    add("IA configurada (ANTHROPIC_API_KEY)", False, "ANTHROPIC_API_KEY" in names, "presente" if "ANTHROPIC_API_KEY" in names else "sin clave: la IA queda desactivada")
    add("Correo de avisos (RESEND_API_KEY y MAIL_FROM)", False, {"RESEND_API_KEY", "MAIL_FROM"} <= names, "presente" if {"RESEND_API_KEY", "MAIL_FROM"} <= names else "falta")
    q = json.dumps({"query": "select status, finished_at, upserts, error from public.sync_runs order by id desc limit 1"}).encode()
    s, b = fetch(f"https://api.supabase.com/v1/projects/{REF}/database/query", {**auth_headers, "Content-Type": "application/json"}, "POST", q)
    rows = json.loads(b or b"[]") if s in (200, 201) else []
    last = rows[0] if rows else {}
    add("Fuente oficial PLACSP sincronizada", False, last.get("status") == "ok", f"última: {last.get('status', 'nunca')} {last.get('finished_at', '')} {last.get('error') or ''}")
else:
    add("Servidor Supabase configurado", True, False, "faltan secretos SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF")

essential_ok = all(ok for _, essential, ok, _ in checks if essential)
lines = ["## Estado de la entrega", "", f"**{'SaaS listo para usar' if essential_ok else 'Solo web publicada: el servicio NO está listo'}**", "", "| Comprobación | Esencial | Resultado | Detalle |", "|---|---|---|---|"]
lines += [f"| {name} | {'sí' if essential else 'no'} | {'✅' if ok else '❌'} | {detail} |" for name, essential, ok, detail in checks]
text = "\n".join(lines)
print(text)
if os.environ.get("GITHUB_STEP_SUMMARY"):
    open(os.environ["GITHUB_STEP_SUMMARY"], "a").write(text + "\n")
if os.environ.get("REQUIRE_SAAS", "").lower() == "true" and not essential_ok:
    sys.exit(1)
