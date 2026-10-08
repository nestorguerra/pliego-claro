"""Recuento exacto de filas por tabla en el proyecto real (antes del volcado)."""
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from restore_check import TABLES  # noqa: E402

URL, KEY = os.environ["SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SECRET_KEY"]
counts = {}
for table in TABLES:
    req = urllib.request.Request(f"{URL}/rest/v1/{table}?select=*", method="HEAD", headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Prefer": "count=exact", "Range": "0-0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        counts[table] = int(response.headers.get("Content-Range", "*/0").split("/")[-1])
json.dump(counts, open(sys.argv[1], "w"), indent=1)
print(json.dumps(counts))
