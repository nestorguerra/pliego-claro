"""Pruebas de base de datos: aislamiento entre cuentas, permisos, versiones,
importación todo-o-nada y avisos de cambios oficiales.

Uso: DATABASE_URL=postgresql://... python supabase/tests/test_database.py
La base debe estar vacía: se aplican supabase_stub.sql y todas las migraciones.
"""
import json
import os
import pathlib
import sys
import traceback
import uuid

import psycopg

ROOT = pathlib.Path(__file__).resolve().parents[1]
DSN = os.environ["DATABASE_URL"]
results = []


def connect():
    return psycopg.connect(DSN, autocommit=True)


def setup():
    with connect() as c:
        c.execute((ROOT / "tests" / "supabase_stub.sql").read_text())
        for path in sorted((ROOT / "migrations").glob("*.sql")):
            c.execute(path.read_text())


def new_user(c, email, confirmed=True, name="Persona"):
    uid = uuid.uuid4()
    c.execute(
        "insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (%s, %s, %s, %s)",
        (uid, email, "now()" if confirmed else None, json.dumps({"name": name})),
    )
    return uid


class As:
    """Ejecuta como un usuario autenticado concreto, igual que PostgREST."""

    def __init__(self, uid):
        self.uid = uid

    def __enter__(self):
        self.c = psycopg.connect(DSN)
        self.c.execute("set role authenticated")
        self.c.execute("select set_config('request.jwt.claims', %s, false)", (json.dumps({"sub": str(self.uid), "role": "authenticated"}),))
        return self.c

    def __exit__(self, kind, value, tb):
        if kind is None:
            self.c.commit()
        else:
            self.c.rollback()
        self.c.close()


def expect_error(fn, fragment=""):
    try:
        fn()
    except psycopg.Error as error:
        assert fragment.lower() in str(error).lower(), f"error inesperado: {error}"
        return
    raise AssertionError("se esperaba un error")


def test(fn):
    try:
        fn()
        results.append((fn.__name__, True, ""))
    except Exception as error:  # noqa: BLE001
        results.append((fn.__name__, False, f"{error}\n{traceback.format_exc(limit=2)}"))
    return fn


def workspace_of(uid):
    with connect() as c:
        return c.execute("select workspace_id from workspace_members where user_id = %s and role = 'owner' limit 1", (uid,)).fetchone()[0]


def expediente(title="Caso", decision="REVISAR"):
    return {"id": f"custom-{uuid.uuid4()}", "title": title, "decision": decision, "requirements": []}


setup()
with connect() as admin:
    ANA = new_user(admin, "ana@example.test", name="Ana")
    BEA = new_user(admin, "bea@example.test", name="Bea")
    CAR = new_user(admin, "car@example.test", name="Car")
    NOCONF = new_user(admin, "sin@example.test", confirmed=False)
WS_A, WS_B = workspace_of(ANA), workspace_of(BEA)


@test
def alta_crea_espacio_propio_y_perfil():
    with As(ANA) as c:
        rows = c.execute("select w.id, m.role from workspaces w join workspace_members m on m.workspace_id = w.id").fetchall()
        assert rows == [(WS_A, "owner")], rows
        assert c.execute("select display_name from profiles where user_id = %s", (ANA,)).fetchone()[0] == "Ana"
        assert c.execute("select count(*) from workspace_settings").fetchone()[0] == 1


@test
def anonimo_no_lee_nada():
    with psycopg.connect(DSN) as c:
        c.execute("set role anon")
        for table in ["expedientes", "workspaces", "notes", "documents", "tenders"]:
            count = c.execute(f"select count(*) from {table}").fetchone()[0]
            assert count == 0, (table, count)
        c.rollback()


@test
def dos_cuentas_aisladas_en_lectura_y_escritura():
    data = expediente("Privado de Ana")
    with As(ANA) as c:
        exp_id = c.execute("insert into expedientes (workspace_id, client_id, data) values (%s, %s, %s) returning id", (WS_A, data["id"], json.dumps(data))).fetchone()[0]
        c.execute("insert into notes (workspace_id, client_id, text) values (%s, 'n1', 'nota privada')", (WS_A,))
    with As(BEA) as c:
        assert c.execute("select count(*) from expedientes").fetchone()[0] == 0
        assert c.execute("select count(*) from expedientes where id = %s", (exp_id,)).fetchone()[0] == 0
        assert c.execute("select count(*) from notes").fetchone()[0] == 0
        updated = c.execute("update expedientes set data = data || '{\"title\":\"hack\"}', version = version + 1 where id = %s returning id", (exp_id,)).fetchall()
        assert updated == [], "Bea modificó un expediente ajeno"
    with As(BEA) as c:
        expect_error(lambda: c.execute("insert into expedientes (workspace_id, client_id, data) values (%s, 'x', %s)", (WS_A, json.dumps(expediente()))), "row-level security")
    with As(BEA) as c:
        moved = c.execute("update expedientes set workspace_id = %s, version = version + 1 where workspace_id = %s returning id", (WS_B, WS_A)).fetchall()
        assert moved == [], "Bea pudo trasladar expedientes ajenos a su espacio"


@test
def no_se_puede_mover_un_expediente_a_otro_espacio():
    data = expediente("Movible")
    with As(ANA) as c:
        exp_id = c.execute("insert into expedientes (workspace_id, client_id, data) values (%s, %s, %s) returning id", (WS_A, data["id"], json.dumps(data))).fetchone()[0]
    with As(ANA) as c:
        expect_error(lambda: c.execute("update expedientes set workspace_id = %s, version = version + 1 where id = %s", (WS_B, exp_id)), "")


@test
def version_obligatoria_y_conflicto_recuperable():
    data = expediente("Versionado")
    with As(ANA) as c:
        exp_id = c.execute("insert into expedientes (workspace_id, client_id, data) values (%s, %s, %s) returning id", (WS_A, data["id"], json.dumps(data))).fetchone()[0]
    # Pestaña 1 guarda partiendo de la versión 1
    with As(ANA) as c:
        rows = c.execute("update expedientes set data = data || '{\"summary\":\"uno\"}', version = 2 where id = %s and version = 1 returning version", (exp_id,)).fetchall()
        assert rows == [(2,)]
    # Pestaña 2 también partía de la versión 1: no sobrescribe en silencio
    with As(ANA) as c:
        rows = c.execute("update expedientes set data = data || '{\"summary\":\"dos\"}', version = 2 where id = %s and version = 1 returning version", (exp_id,)).fetchall()
        assert rows == [], "segunda escritura con versión antigua no debería aplicarse"
    with As(ANA) as c:
        expect_error(lambda: c.execute("update expedientes set version = 9 where id = %s", (exp_id,)), "conflicto")
    with As(ANA) as c:
        assert c.execute("select data->>'summary', updated_by from expedientes where id = %s", (exp_id,)).fetchone() == ("uno", ANA)


@test
def datos_invalidos_rechazados():
    with As(ANA) as c:
        expect_error(lambda: c.execute("insert into expedientes (workspace_id, client_id, data) values (%s, 'bad', %s)", (WS_A, json.dumps({"title": "", "decision": "GO"}))), "check")
    with As(ANA) as c:
        expect_error(lambda: c.execute("insert into expedientes (workspace_id, client_id, data) values (%s, 'bad2', %s)", (WS_A, json.dumps({"title": "x", "decision": "QUIZÁ"}))), "check")


@test
def invitacion_da_solo_el_permiso_previsto_y_se_puede_retirar():
    with As(ANA) as c:
        token = c.execute("select create_invitation(%s, 'CAR@example.test', 'viewer')", (WS_A,)).fetchone()[0]
    with As(BEA) as c:
        expect_error(lambda: c.execute("select accept_invitation(%s)", (token,)), "otra dirección")
    with As(BEA) as c:
        expect_error(lambda: c.execute("select create_invitation(%s, 'x@example.test', 'admin')", (WS_A,)), "administración")
    with As(CAR) as c:
        assert c.execute("select accept_invitation(%s)", (token,)).fetchone()[0] == WS_A
    with As(CAR) as c:
        expect_error(lambda: c.execute("select accept_invitation(%s)", (token,)), "ya se utilizó")
    with As(CAR) as c:
        assert c.execute("select count(*) from expedientes where workspace_id = %s", (WS_A,)).fetchone()[0] >= 1
        expect_error(lambda: c.execute("insert into expedientes (workspace_id, client_id, data) values (%s, 'v', %s)", (WS_A, json.dumps(expediente()))), "row-level security")
    with As(ANA) as c:
        c.execute("select set_member_role(%s, %s, 'editor')", (WS_A, CAR))
    with As(CAR) as c:
        c.execute("insert into expedientes (workspace_id, client_id, data) values (%s, 'de-car', %s)", (WS_A, json.dumps(expediente("De Car"))))
    with As(ANA) as c:
        c.execute("select remove_member(%s, %s)", (WS_A, CAR))
    with As(CAR) as c:
        assert c.execute("select count(*) from expedientes where workspace_id = %s", (WS_A,)).fetchone()[0] == 0
        expect_error(lambda: c.execute("insert into notes (workspace_id, client_id, text) values (%s, 'n9', 'tras retirada')", (WS_A,)), "row-level security")


@test
def invitacion_caducada_o_sin_correo_confirmado():
    with As(ANA) as c:
        token = c.execute("select create_invitation(%s, 'sin@example.test', 'editor')", (WS_A,)).fetchone()[0]
    with As(NOCONF) as c:
        expect_error(lambda: c.execute("select accept_invitation(%s)", (token,)), "confirma tu correo")
    with connect() as c:
        c.execute("update invitations set expires_at = now() - interval '1 minute' where email = 'sin@example.test'")
        c.execute("update auth.users set email_confirmed_at = now() where id = %s", (NOCONF,))
    with As(NOCONF) as c:
        expect_error(lambda: c.execute("select accept_invitation(%s)", (token,)), "caducado")


@test
def ultimo_titular_no_se_puede_retirar():
    with As(ANA) as c:
        expect_error(lambda: c.execute("select remove_member(%s, %s)", (WS_A, ANA)), "al menos una persona titular")


@test
def importacion_todo_o_nada_y_duplicados():
    payload = {"format": "pliego-claro-mvp", "version": 2, "opportunities": [expediente("Importado 1"), expediente("Importado 2")],
               "notes": [{"id": "nota-imp", "text": "hola", "kind": "Regla", "createdAt": "2026-09-30T09:00:00Z"}],
               "team": [{"id": "role-x", "name": "Técnica", "role": "Solvencia"}], "settings": {}}
    with As(BEA) as c:
        res = c.execute("select import_workspace_backup(%s, %s, 'skip')", (WS_B, json.dumps(payload))).fetchone()[0]
        assert res["expedientes"] == 2 and res["notas"] == 1 and res["roles"] == 1, res
    with As(BEA) as c:
        res = c.execute("select import_workspace_backup(%s, %s, 'skip')", (WS_B, json.dumps(payload))).fetchone()[0]
        assert res["expedientes"] == 0 and res["expedientesOmitidos"] == 2, res
    with As(BEA) as c:
        res = c.execute("select import_workspace_backup(%s, %s, 'copy')", (WS_B, json.dumps(payload))).fetchone()[0]
        assert res["expedientes"] == 2, res
        assert c.execute("select count(*) from expedientes where workspace_id = %s", (WS_B,)).fetchone()[0] == 4
    broken = dict(payload, opportunities=[expediente("Válido"), {"id": "roto", "title": "", "decision": "GO", "requirements": []}])
    with As(BEA) as c:
        expect_error(lambda: c.execute("select import_workspace_backup(%s, %s, 'skip')", (WS_B, json.dumps(broken))), "check")
    with As(BEA) as c:
        assert c.execute("select count(*) from expedientes where workspace_id = %s", (WS_B,)).fetchone()[0] == 4, "una importación fallida dejó datos parciales"
    with As(ANA) as c:
        expect_error(lambda: c.execute("select import_workspace_backup(%s, %s, 'skip')", (WS_B, json.dumps(payload))), "sin permiso")


@test
def documentos_y_storage_aislados():
    data = expediente("Con documento")
    with As(ANA) as c:
        exp_id = c.execute("insert into expedientes (workspace_id, client_id, data) values (%s, %s, %s) returning id", (WS_A, data["id"], json.dumps(data))).fetchone()[0]
        doc = c.execute("""insert into documents (workspace_id, expediente_id, name, kind, origin, storage_path, sha256, size_bytes, mime_type)
                           values (%s, %s, 'PCAP.pdf', 'PCAP', 'upload', %s, %s, 100, 'application/pdf') returning id""",
                        (WS_A, exp_id, f"{WS_A}/{exp_id}/a.pdf", "a" * 64)).fetchone()[0]
        c.execute("insert into document_pages (document_id, workspace_id, page_number, text) values (%s, %s, 1, 'Cláusula 7')", (doc, WS_A))
        c.execute("insert into storage.objects (bucket_id, name) values ('documents', %s)", (f"{WS_A}/{exp_id}/a.pdf",))
    with As(BEA) as c:
        assert c.execute("select count(*) from documents").fetchone()[0] == 0
        assert c.execute("select count(*) from document_pages").fetchone()[0] == 0
        assert c.execute("select count(*) from storage.objects").fetchone()[0] == 0
    with As(BEA) as c:
        expect_error(lambda: c.execute("insert into storage.objects (bucket_id, name) values ('documents', %s)", (f"{WS_A}/x.pdf",)), "row-level security")
    with As(BEA) as c:
        # Ruta en su espacio pero expediente ajeno
        expect_error(lambda: c.execute("""insert into documents (workspace_id, expediente_id, name, kind, origin, storage_path, sha256, size_bytes, mime_type)
                           values (%s, %s, 'x', 'PCAP', 'upload', %s, %s, 1, 'application/pdf')""", (WS_B, exp_id, f"{WS_B}/x.pdf", "b" * 64)), "no pertenece")
    with As(ANA) as c:
        expect_error(lambda: c.execute("""insert into documents (workspace_id, expediente_id, name, kind, origin, storage_path, sha256, size_bytes, mime_type)
                           values (%s, %s, 'x', 'PCAP', 'upload', %s, %s, 1, 'application/pdf')""", (WS_A, exp_id, f"{WS_B}/x.pdf", "c" * 64)), "check")


@test
def cambio_oficial_crea_un_aviso_y_reabre_go():
    with connect() as c:
        tender = c.execute("insert into tenders (external_id, title, content_hash) values ('ext-1', 'Licitación real', 'h1') returning id").fetchone()[0]
        c.execute("insert into tender_versions (tender_id, content_hash, snapshot) values (%s, 'h1', '{}')", (tender,))
    data = expediente("Vigilado", decision="GO")
    with As(ANA) as c:
        exp_id = c.execute("insert into expedientes (workspace_id, client_id, tender_id, data) values (%s, %s, %s, %s) returning id", (WS_A, data["id"], tender, json.dumps(data))).fetchone()[0]
        assert c.execute("select count(*) from alerts").fetchone()[0] == 0
    with connect() as c:
        c.execute("insert into tender_versions (tender_id, content_hash, snapshot, changes) values (%s, 'h2', '{}', %s)",
                  (tender, json.dumps([{"field": "deadline_at", "before": "2026-10-20", "after": "2026-10-27"}])))
        c.execute("insert into tender_versions (tender_id, content_hash, snapshot, changes) values (%s, 'h2', '{}', '[]') on conflict do nothing", (tender,))
    with As(ANA) as c:
        alerts = c.execute("select title from alerts where expediente_id = %s", (exp_id,)).fetchall()
        assert len(alerts) == 1, alerts
        decision, events, history = c.execute("select data->>'decision', data->'events', data->'history' from expedientes where id = %s", (exp_id,)).fetchone()
        assert decision == "REVISAR" and len(events) == 1 and events[0]["requiresReview"] and history[0]["label"].startswith("Decisión reabierta")
    with As(BEA) as c:
        assert c.execute("select count(*) from alerts").fetchone()[0] == 0
        expect_error(lambda: c.execute("select mark_alert_read(%s)", (c.execute("select gen_random_uuid()").fetchone()[0],)), "no disponible")


@test
def licitaciones_solo_escribe_el_servidor():
    with As(ANA) as c:
        assert c.execute("select count(*) from tenders").fetchone()[0] >= 1
        expect_error(lambda: c.execute("insert into tenders (external_id, title, content_hash) values ('fake', 'x', 'y')"), "row-level security")
    with As(ANA) as c:
        assert c.execute("update tenders set title = 'x' returning id").fetchall() == []


@test
def auditoria_identifica_autoria():
    with As(ANA) as c:
        rows = c.execute("select actor_id, action from activity_log where workspace_id = %s order by id", (WS_A,)).fetchall()
        assert any(actor == ANA and action == "expediente_creado" for actor, action in rows)
        expect_error(lambda: c.execute("insert into activity_log (workspace_id, action) values (%s, 'falso')", (WS_A,)), "row-level security")


@test
def comentarios_con_autor_real():
    data = expediente("Comentado")
    with As(ANA) as c:
        exp_id = c.execute("insert into expedientes (workspace_id, client_id, data) values (%s, %s, %s) returning id", (WS_A, data["id"], json.dumps(data))).fetchone()[0]
        c.execute("insert into comments (workspace_id, expediente_id, body, author_id) values (%s, %s, 'ok', %s)", (WS_A, exp_id, BEA))
        assert c.execute("select author_id from comments where expediente_id = %s", (exp_id,)).fetchone()[0] == ANA


@test
def original_archivado_inmutable_y_uso_ia_privado():
    with As(ANA) as c:
        doc = c.execute("select id from documents where workspace_id = %s limit 1", (WS_A,)).fetchone()[0]
        c.execute("update documents set extraction_status = 'done', page_count = 1 where id = %s", (doc,))
    with As(ANA) as c:
        expect_error(lambda: c.execute("update documents set sha256 = %s where id = %s", ("f" * 64, doc)), "inmutable")
    with As(ANA) as c:
        summary = c.execute("select ai_usage_summary(%s)", (WS_A,)).fetchone()[0]
        assert summary["limits"]["ai_monthly_budget_usd"] == 15, summary
    with As(BEA) as c:
        expect_error(lambda: c.execute("select ai_usage_summary(%s)", (WS_A,)), "sin permiso")
    with As(BEA) as c:
        expect_error(lambda: c.execute("insert into document_pages (document_id, workspace_id, page_number, text) values (%s, %s, 2, 'x')", (doc, WS_B)), "")


@test
def busqueda_reproducible_con_filtros():
    with connect() as c:
        c.execute("""insert into tenders (external_id, title, buyer, province, status_code, cpv, amount_without_tax, deadline_at, content_hash) values
          ('s1', 'Mantenimiento de ascensores municipales', 'Ayuntamiento de Ávila', 'Ávila', 'PUB', '{50750000}', 30000, now() + interval '10 days', 'a'),
          ('s2', 'Servicio de mantenimiento de jardines', 'Diputación de Soria', 'Soria', 'PUB', '{77310000}', 90000, now() + interval '5 days', 'b'),
          ('s3', 'Mantenimiento histórico cerrado', 'Ayuntamiento de Ávila', 'Ávila', 'ADJ', '{50750000}', 20000, now() - interval '30 days', 'c')""")
    with As(ANA) as c:
        rows = c.execute("select external_id from search_tenders(p_q => 'mantenimiento')").fetchall()
        assert [r[0] for r in rows] == ["s2", "s1"], rows
        assert [r[0] for r in c.execute("select external_id from search_tenders(p_q => 'mantenimiento', p_status => 'todas')").fetchall()] == ["s3", "s2", "s1"]
        assert [r[0] for r in c.execute("select external_id from search_tenders(p_cpv => '5075')").fetchall()] == ["s1"]
        assert [r[0] for r in c.execute("select external_id from search_tenders(p_province => 'soria', p_max => 100000, p_min => 50000)").fetchall()] == ["s2"]
        assert c.execute("select count(*) from search_tenders(p_q => 'inexistente zzz')").fetchone()[0] == 0
        stats = c.execute("select tender_stats()").fetchone()[0]
        assert stats["vigentes"] >= 2


for name, ok, detail in results:
    print(("ok   " if ok else "FAIL ") + name + ("" if ok else "\n" + detail))
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} pruebas de base de datos correctas")
sys.exit(1 if failed else 0)
