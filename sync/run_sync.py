"""Sincronización programada (GitHub Actions):
1. Lee las páginas nuevas de la sindicación PLACSP desde la última pasada correcta.
2. Inserta o actualiza licitaciones y guarda una versión cuando cambia su contenido
   (la base de datos crea entonces el aviso en cada expediente vinculado).
3. Envía por correo los avisos pendientes y los recordatorios de cierre, una sola vez.

Variables: SUPABASE_URL, SUPABASE_SECRET_KEY, opcionales RESEND_API_KEY, MAIL_FROM,
SITE_URL, MAX_PAGES (por defecto 12), BACKFILL_PAGES (primera vez, por defecto 8).
Un fallo de consulta se registra como fallo: nunca como «sin cambios».
"""
from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(__file__))
import placsp  # noqa: E402

try:
    import certifi  # La cadena de la FNMT está en el almacén de Mozilla que distribuye certifi.
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover
    SSL_CONTEXT = ssl.create_default_context()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SECRET = os.environ.get("SUPABASE_SECRET_KEY", "")
USER_AGENT = "PliegoClaro/1.0 (+https://github.com/nestorguerra/pliego-claro)"
MADRID = ZoneInfo("Europe/Madrid")


def http(method: str, url: str, body=None, headers=None, timeout=90, retries=2):
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(retries + 1):
        request = urllib.request.Request(url, data=data, method=method, headers={"User-Agent": USER_AGENT, **(headers or {})})
        try:
            with urllib.request.urlopen(request, timeout=timeout, context=SSL_CONTEXT) as response:
                raw = response.read()
                return response.status, raw
        except urllib.error.HTTPError as error:
            payload = error.read()
            if error.code >= 500 and attempt < retries:
                time.sleep(3 * (attempt + 1))
                continue
            raise RuntimeError(f"{method} {url.split('?')[0]} -> HTTP {error.code}: {payload[:300]!r}") from None
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt < retries:
                time.sleep(3 * (attempt + 1))
                continue
            raise RuntimeError(f"{method} {url.split('?')[0]} -> {error}") from None
    raise RuntimeError("sin respuesta")


def rest(method: str, path: str, body=None, prefer: str | None = None):
    headers = {"apikey": SECRET, "Authorization": f"Bearer {SECRET}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    status, raw = http(method, f"{SUPABASE_URL}/rest/v1/{path}", body, headers)
    return json.loads(raw) if raw else None


def quote_list(values):
    return "(" + ",".join('"' + v.replace('"', '\\"') + '"' for v in values) + ")"


def fetch_pages(cursor: datetime | None, max_pages: int, backfill: int):
    url = placsp.FEED_URL
    pages = 0
    while url and pages < max_pages:
        status, raw = http("GET", url, timeout=180)
        page = placsp.parse_feed(raw)
        pages += 1
        yield page
        if cursor is None and pages >= backfill:
            break
        if cursor is not None and page.oldest and placsp.parse_time(page.oldest) < cursor:
            break
        url = page.next_url


def upsert(records: list[dict]) -> tuple[int, int]:
    """Devuelve (filas insertadas o actualizadas, versiones con cambios)."""
    if not records:
        return 0, 0
    existing = {}
    for start in range(0, len(records), 80):
        chunk = records[start:start + 80]
        ids = quote_list([r["external_id"] for r in chunk])
        rows = rest("GET", f"tenders?select=id,external_id,content_hash,title,status_code,deadline_at,amount_without_tax,amount_with_tax,buyer,documents,lots,procedure_code,source_updated_at&external_id=in.{urllib.parse.quote(ids)}")
        existing.update({row["external_id"]: row for row in rows})
    changed_records, version_rows, changes_count = [], [], 0
    now = datetime.now(timezone.utc).isoformat()
    for record in records:
        current = existing.get(record["external_id"])
        if current and current["content_hash"] == record["content_hash"]:
            continue
        if current and current.get("source_updated_at") and record.get("source_updated_at") and placsp.parse_time(record["source_updated_at"]) < placsp.parse_time(current["source_updated_at"]):
            continue  # una versión antigua no sobrescribe la más reciente
        changed_records.append({**record, "last_seen_at": now, "deleted_at": None})
        changes = placsp.diff(current, record) if current else []
        if current:
            changes_count += 1
        version_rows.append((record["external_id"], record["content_hash"], changes, record))
    if not changed_records:
        return 0, 0
    saved = []
    for start in range(0, len(changed_records), 100):
        saved += rest("POST", "tenders?on_conflict=external_id&select=id,external_id", changed_records[start:start + 100], "resolution=merge-duplicates,return=representation")
    ids = {row["external_id"]: row["id"] for row in saved}
    versions = [{"tender_id": ids[ext], "content_hash": h, "changes": ch, "snapshot": snap, "source_updated_at": snap.get("source_updated_at")} for ext, h, ch, snap in version_rows if ext in ids]
    for start in range(0, len(versions), 100):
        rest("POST", "tender_versions?on_conflict=tender_id,content_hash", versions[start:start + 100], "resolution=ignore-duplicates,return=minimal")
    return len(saved), changes_count


def mark_deleted(tombstones):
    refs = [ref for ref, _ in tombstones if ref]
    for start in range(0, len(refs), 80):
        ids = quote_list(refs[start:start + 80])
        rest("PATCH", f"tenders?external_id=in.{urllib.parse.quote(ids)}&deleted_at=is.null", {"deleted_at": datetime.now(timezone.utc).isoformat()}, "return=minimal")


# ---------------------------------------------------------------- correo
def send_email(to: str, subject: str, text: str) -> str:
    key, sender = os.environ.get("RESEND_API_KEY"), os.environ.get("MAIL_FROM")
    if not key or not sender:
        raise RuntimeError("correo no configurado")
    status, raw = http("POST", "https://api.resend.com/emails", {"from": sender, "to": [to], "subject": subject, "text": text},
                       {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, retries=0)
    return json.loads(raw).get("id", "")


def queue_and_send(dedupe_key, workspace_id, user_id, alert_id, to, subject, text) -> str:
    rows = rest("POST", "email_notifications?on_conflict=dedupe_key", [{"dedupe_key": dedupe_key, "workspace_id": workspace_id, "user_id": user_id, "alert_id": alert_id, "subject": subject}], "resolution=ignore-duplicates,return=representation")
    if not rows:
        existing = rest("GET", f"email_notifications?select=id,status,attempts&dedupe_key=eq.{urllib.parse.quote(dedupe_key)}")
        if not existing or existing[0]["status"] in ("sent", "skipped") or existing[0]["attempts"] >= 3:
            return "omitido"
        rows = existing
    row_id, attempts = rows[0]["id"], rows[0].get("attempts", 0)
    try:
        provider_id = send_email(to, subject, text)
        rest("PATCH", f"email_notifications?id=eq.{row_id}", {"status": "sent", "provider_id": provider_id, "sent_at": datetime.now(timezone.utc).isoformat(), "attempts": attempts + 1, "error": None}, "return=minimal")
        return "enviado"
    except Exception as error:  # noqa: BLE001 - se registra el fallo, no se marca como recibido
        rest("PATCH", f"email_notifications?id=eq.{row_id}", {"status": "failed", "error": str(error)[:400], "attempts": attempts + 1}, "return=minimal")
        return "fallido"


def recipients(workspace_ids):
    if not workspace_ids:
        return {}
    ids = quote_list(sorted(workspace_ids))
    members = rest("GET", f"workspace_members?select=workspace_id,user_id,profile:profiles(email,email_alerts,display_name)&workspace_id=in.{urllib.parse.quote(ids)}")
    settings = {row["workspace_id"]: row["data"] for row in rest("GET", f"workspace_settings?select=workspace_id,data&workspace_id=in.{urllib.parse.quote(ids)}")}
    result = {}
    for member in members:
        profile = member.get("profile") or {}
        prefs = settings.get(member["workspace_id"], {})
        if profile.get("email") and profile.get("email_alerts") and prefs.get("emailChangeAlerts", False):
            result.setdefault(member["workspace_id"], []).append((member["user_id"], profile["email"], prefs))
    return result


def notify(stats):
    if not os.environ.get("RESEND_API_KEY"):
        stats["email"] = "sin configurar"
        return
    site = os.environ.get("SITE_URL", "")
    since = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    alerts = rest("GET", f"alerts?select=id,workspace_id,expediente_id,title,detail,changes,created_at,expediente:expedientes(client_id,data->>title)&created_at=gte.{urllib.parse.quote(since)}")
    expedientes = rest("GET", "expedientes?select=id,workspace_id,client_id,data->>title,data->>deadlineDate,data->>decision&deleted_at=is.null&data->>deadlineDate=not.is.null")
    people = recipients({a["workspace_id"] for a in alerts} | {e["workspace_id"] for e in expedientes})
    sent = failed = 0
    for alert in alerts:
        title = (alert.get("expediente") or {}).get("title") or "Expediente"
        lines = [f"- {c.get('label')}: {c.get('before') or '—'} → {c.get('after') or '—'}" for c in alert.get("changes") or []]
        body = f"{alert['title']}\nExpediente: {title}\n{alert['detail']}\n\n" + "\n".join(lines) + f"\n\nRevisa el cambio y la tarea creada: {site}#oportunidades\n\nLicitIA no decide ni presenta ofertas: revisa siempre el expediente oficial."
        for user_id, email, _ in people.get(alert["workspace_id"], []):
            outcome = queue_and_send(f"alert:{alert['id']}:{user_id}", alert["workspace_id"], user_id, alert["id"], email, f"Cambio oficial · {title[:80]}", body)
            sent += outcome == "enviado"
            failed += outcome == "fallido"
    today = datetime.now(MADRID).date()
    for exp in expedientes:
        if exp.get("decision") == "NO-GO":
            continue
        try:
            deadline = datetime.strptime(exp["deadlineDate"], "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        days = (deadline - today).days
        for user_id, email, prefs in people.get(exp["workspace_id"], []):
            if not prefs.get("deadlineReminders", True):
                continue
            offsets = {int(x) for x in str(prefs.get("reminderDays", "7, 2, 1")).replace(" ", "").split(",") if x.isdigit()}
            if days not in offsets:
                continue
            body = f"Quedan {days} días para el cierre de «{exp['title']}» ({deadline.strftime('%d/%m/%Y')}, hora de Madrid según el expediente).\n\nAbre el expediente: {site}#oportunidades\n\nContrasta la fecha con la fuente oficial antes de presentar."
            outcome = queue_and_send(f"deadline:{exp['id']}:{deadline}:{days}:{user_id}", exp["workspace_id"], user_id, None, email, f"Cierre en {days} días · {exp['title'][:70]}", body)
            sent += outcome == "enviado"
            failed += outcome == "fallido"
    stats["emails_sent"], stats["emails_failed"] = sent, failed


def main():
    if not SUPABASE_URL or not SECRET:
        print("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY", file=sys.stderr)
        return 2
    run = rest("POST", "sync_runs?select=id", [{"source": "PLACSP"}], "return=representation")[0]
    last_ok = rest("GET", "sync_runs?select=cursor_at&status=in.(ok,partial)&cursor_at=not.is.null&order=finished_at.desc&limit=1")
    cursor = placsp.parse_time(last_ok[0]["cursor_at"]) - timedelta(hours=1) if last_ok else None
    stats = {"pages": 0, "entries": 0, "upserts": 0, "changes": 0}
    newest = None
    status, error_text, ingest_ok = "ok", None, False
    try:
        records, tombstones = [], []
        for page in fetch_pages(cursor, int(os.environ.get("MAX_PAGES", "12")), int(os.environ.get("BACKFILL_PAGES", "8"))):
            stats["pages"] += 1
            stats["entries"] += len(page.entries)
            records.extend(page.entries)
            tombstones.extend(page.deleted)
            if page.newest and (newest is None or placsp.parse_time(page.newest) > placsp.parse_time(newest)):
                newest = page.newest
        upserts, changes = upsert(list(placsp.newest_per_tender(records)))
        stats["upserts"], stats["changes"] = upserts, changes
        mark_deleted(tombstones)
        ingest_ok = True
    except Exception as error:  # noqa: BLE001
        status, error_text = ("partial" if stats["pages"] else "failed"), str(error)[:900]
    try:
        notify(stats)
    except Exception as error:  # noqa: BLE001
        error_text = ((error_text or "") + f" | correo: {error}")[:900]
        status = "partial" if status == "ok" else status
    rest("PATCH", f"sync_runs?id=eq.{run['id']}", {
        "finished_at": datetime.now(timezone.utc).isoformat(), "status": status, "pages": stats["pages"], "entries": stats["entries"],
        "upserts": stats["upserts"], "changes": stats["changes"], "cursor_at": newest if ingest_ok else None, "error": error_text,
    }, "return=minimal")
    print(json.dumps({"status": status, **stats, "error": error_text}, ensure_ascii=False))
    return 0 if status != "failed" else 1


if __name__ == "__main__":
    sys.exit(main())
