"""Prueba de restauración en un Supabase local y aislado (GitHub Actions).

1. Sube los originales copiados al Storage local en las mismas rutas.
2. Compara el número de filas de cada tabla entre el proyecto real (en el momento de la copia) y la restauración.
3. Descarga cada original restaurado y comprueba su SHA-256 con la tabla `documents` restaurada.

Variables: LOCAL_URL, LOCAL_KEY (clave de servicio local), COUNTS_FILE (recuentos del origen), FILES_DIR.
"""
import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request

LOCAL = os.environ.get("LOCAL_URL", "").rstrip("/")
KEY = os.environ.get("LOCAL_KEY", "")
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
TABLES = ["workspaces", "workspace_members", "profiles", "workspace_settings", "expedientes", "notes", "team_roles", "documents", "document_pages", "comments", "activity_log", "alerts", "invitations", "ai_analyses", "tenders", "tender_versions"]


def request(method, path, data=None, headers=None):
    req = urllib.request.Request(f"{LOCAL}{path}", data=data, method=method, headers={**HEADERS, **(headers or {})})
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read(), response.headers


def count(table):
    _, headers = request("HEAD", f"/rest/v1/{table}?select=*", headers={"Prefer": "count=exact", "Range": "0-0"})
    return int(headers.get("Content-Range", "*/0").split("/")[-1])


def main():
    expected = json.load(open(os.environ["COUNTS_FILE"]))
    files = json.load(open(os.path.join(os.environ["FILES_DIR"], "archivos.json")))
    try:
        request("POST", "/storage/v1/bucket", json.dumps({"id": "documents", "name": "documents", "public": False}).encode(), {"Content-Type": "application/json"})
    except urllib.error.HTTPError:
        pass  # ya existe (creado por la migración)
    for item in files:
        if not item["copied"]:
            continue
        with open(os.path.join(os.environ["FILES_DIR"], "archivos", item["storage_path"]), "rb") as handle:
            request("POST", f"/storage/v1/object/documents/{urllib.parse.quote(item['storage_path'])}", handle.read(), {"Content-Type": "application/octet-stream", "x-upsert": "true"})
    problems, lines = [], []
    for table in TABLES:
        got, want = count(table), expected.get(table)
        lines.append(f"| {table} | {want} | {got} | {'✅' if got == want else '❌'} |")
        if got != want:
            problems.append(f"{table}: origen {want}, restaurado {got}")
    restored_docs = json.loads(request("GET", "/rest/v1/documents?select=id,storage_path,sha256&limit=100000")[0])
    verified = 0
    for doc in restored_docs:
        try:
            data, _ = request("GET", f"/storage/v1/object/documents/{urllib.parse.quote(doc['storage_path'])}")
            if hashlib.sha256(data).hexdigest() == doc["sha256"]:
                verified += 1
            else:
                problems.append(f"documento {doc['id']}: huella distinta tras restaurar")
        except Exception as error:  # noqa: BLE001
            problems.append(f"documento {doc['id']}: no se pudo abrir tras restaurar ({error})")
    summary = ["## Prueba de restauración", "", "| Tabla | Origen | Restaurado | |", "|---|---|---|---|", *lines, "", f"Originales abiertos con huella correcta: **{verified}/{len(restored_docs)}**", ""]
    summary.append("**Resultado: restauración verificada.**" if not problems else "**Resultado: FALLO**\n\n" + "\n".join(f"- {p}" for p in problems))
    text = "\n".join(summary)
    print(text)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as handle:
            handle.write(text + "\n")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
