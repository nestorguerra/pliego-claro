"""Descarga todos los originales del bucket `documents` y comprueba su SHA-256 contra la base de datos.

Uso: SUPABASE_URL=... SUPABASE_SECRET_KEY=... python ops/backup_files.py <carpeta_destino>
Escribe <carpeta>/archivos/<ruta> y <carpeta>/archivos.json. Falla si un archivo falta o no coincide.
"""
import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SECRET_KEY"]
HEADERS = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}


def get(path):
    with urllib.request.urlopen(urllib.request.Request(f"{URL}{path}", headers=HEADERS), timeout=120) as response:
        return response.read()


def documents():
    rows, start = [], 0
    while True:
        page = json.loads(get(f"/rest/v1/documents?select=id,storage_path,sha256,size_bytes&order=id&offset={start}&limit=1000"))
        rows += page
        if len(page) < 1000:
            return rows
        start += 1000


def main(target):
    os.makedirs(os.path.join(target, "archivos"), exist_ok=True)
    manifest, problems = [], []
    for doc in documents():
        data = None
        try:
            data = get(f"/storage/v1/object/documents/{urllib.parse.quote(doc['storage_path'])}")
        except Exception as error:  # noqa: BLE001
            problems.append(f"{doc['id']}: no descargado ({error})")
        if data is not None:
            digest = hashlib.sha256(data).hexdigest()
            if digest != doc["sha256"]:
                problems.append(f"{doc['id']}: huella distinta")
            path = os.path.join(target, "archivos", doc["storage_path"])
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "wb") as handle:
                handle.write(data)
        manifest.append({**doc, "copied": data is not None})
    with open(os.path.join(target, "archivos.json"), "w") as handle:
        json.dump(manifest, handle, indent=1)
    print(f"Originales copiados: {sum(m['copied'] for m in manifest)}/{len(manifest)}")
    # Los documentos enviados a la papelera fallidos (sin archivo) no bloquean; cualquier otro problema sí.
    if problems:
        print("\n".join(problems), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
