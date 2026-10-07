"""Pruebas del lector PLACSP con una muestra real de la sindicación (5 oct 2026)."""
import copy
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import placsp  # noqa: E402

SAMPLE = os.path.join(os.path.dirname(__file__), "fixtures", "placsp_muestra.atom")


class PlacspTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(SAMPLE, "rb") as handle:
            cls.page = placsp.parse_feed(handle.read())
        cls.by_folder = {e["folder_id"]: e for e in cls.page.entries}

    def test_lee_entradas_borradas_y_siguiente_pagina(self):
        self.assertEqual(len(self.page.entries), 3)
        self.assertTrue(self.page.deleted)
        self.assertTrue(self.page.next_url.startswith("https://contrataciondelestado.es/sindicacion/"))

    def test_campos_oficiales_de_una_licitacion_en_plazo(self):
        noia = self.by_folder["3686/2026"]
        self.assertEqual(noia["status_code"], "PUB")
        self.assertEqual(noia["buyer"], "Alcaldía del Ayuntamiento de Noia")
        self.assertEqual(noia["buyer_nif"], "P1505800A")
        self.assertEqual(noia["amount_without_tax"], 47120.52)
        self.assertEqual(noia["amount_with_tax"], 57015.83)
        self.assertEqual(noia["cpv"], ["45233250", "45000000"])
        self.assertEqual(noia["nuts"], "ES111")
        self.assertTrue(noia["link"].startswith("https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion"))
        kinds = [d["kind"] for d in noia["documents"]]
        self.assertIn("PCAP", kinds)
        self.assertIn("PPT", kinds)

    def test_cierre_en_hora_de_madrid_convertido_a_utc(self):
        # 26/10/2026 23:59 en Madrid (horario de invierno desde el 25/10, UTC+1)
        self.assertEqual(self.by_folder["3686/2026"]["deadline_at"], "2026-10-26T22:59:00+00:00")
        # En verano (UTC+2)
        self.assertEqual(placsp._deadline("2026-07-01", "14:00:00"), "2026-07-01T12:00:00+00:00")
        self.assertIsNone(placsp._deadline(None, None))
        self.assertEqual(placsp._deadline("2026-07-01", None), "2026-07-01T21:59:59+00:00")

    def test_importe_ausente_no_es_cero(self):
        self.assertIsNone(placsp._number(None))
        self.assertIsNone(placsp._number("n/d"))

    def test_lotes(self):
        with_lots = [e for e in self.page.entries if e["lots"]]
        self.assertEqual(len(with_lots), 1)
        self.assertTrue(all(lot["name"] for lot in with_lots[0]["lots"]))

    def test_hash_estable_y_diferencias_relevantes(self):
        noia = self.by_folder["3686/2026"]
        self.assertEqual(placsp.content_hash(noia), noia["content_hash"])
        again = copy.deepcopy(noia)
        again["source_updated_at"] = "2026-10-07T10:00:00+02:00"
        self.assertEqual(placsp.content_hash(again), noia["content_hash"], "la fecha de publicación del feed no es un cambio")
        changed = copy.deepcopy(noia)
        changed["deadline_at"] = "2026-11-02T22:59:00+00:00"
        changed["documents"] = noia["documents"] + [{"kind": "Aclaración", "name": "Aclaración 1.pdf", "url": "https://contrataciondelestado.es/x", "hash": "abc"}]
        changed["status_code"] = "EV"
        fields = {c["field"]: c for c in placsp.diff(noia, changed)}
        self.assertEqual(set(fields), {"deadline_at", "documents", "status_code"})
        self.assertEqual(fields["status_code"]["after"], "Pendiente de adjudicación")
        self.assertIn("Aclaración 1.pdf", fields["documents"]["after"])
        self.assertEqual(placsp.diff(noia, again), [])

    def test_se_conserva_la_version_mas_reciente(self):
        a = {"external_id": "x", "source_updated_at": "2026-10-05T10:00:00+02:00", "v": 1}
        b = {"external_id": "x", "source_updated_at": "2026-10-05T12:00:00+02:00", "v": 2}
        self.assertEqual([r["v"] for r in placsp.newest_per_tender([b, a])], [2])
        self.assertEqual([r["v"] for r in placsp.newest_per_tender([a, b])], [2])

    def test_entrada_sin_contenido_se_ignora(self):
        import xml.etree.ElementTree as ET
        entry = ET.fromstring('<entry xmlns="http://www.w3.org/2005/Atom"><id>x</id></entry>')
        self.assertIsNone(placsp.parse_entry(entry))


if __name__ == "__main__":
    unittest.main(verbosity=1)
