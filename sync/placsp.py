"""Lectura de la sindicación oficial de la Plataforma de Contratación del Sector
Público (PLACSP, formato ATOM + CODICE). Solo biblioteca estándar.

Fuente: https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom
Cada fichero contiene unas 400 entradas (las más recientes primero) y enlaza al
anterior con rel="next". Una licitación vuelve a aparecer cuando cambia.
"""
from __future__ import annotations

import hashlib
import json
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Iterable, Iterator
from zoneinfo import ZoneInfo

FEED_URL = "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom"
MADRID = ZoneInfo("Europe/Madrid")

NS = {
    "a": "http://www.w3.org/2005/Atom",
    "at": "http://purl.org/atompub/tombstones/1.0",
    "cbc": "urn:dgpe:names:draft:codice:schema:xsd:CommonBasicComponents-2",
    "cac": "urn:dgpe:names:draft:codice:schema:xsd:CommonAggregateComponents-2",
    "cpe": "urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonAggregateComponents-2",
    "cbe": "urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonBasicComponents-2",
}

STATUS_LABELS = {"PRE": "Anuncio previo", "PUB": "En plazo", "EV": "Pendiente de adjudicación", "ADJ": "Adjudicada", "RES": "Resuelta", "ANUL": "Anulada"}
CONTRACT_TYPES = {"1": "Suministros", "2": "Servicios", "3": "Obras", "21": "Gestión de servicios públicos", "22": "Concesión de servicios", "31": "Concesión de obras públicas", "32": "Concesión de obras", "40": "Colaboración público-privada", "7": "Administrativo especial", "8": "Privado", "50": "Patrimonial", "999": "Otros"}
PROCEDURES = {"1": "Abierto", "2": "Restringido", "3": "Negociado sin publicidad", "4": "Negociado con publicidad", "5": "Diálogo competitivo", "6": "Contrato menor", "7": "Derivado de acuerdo marco", "8": "Concurso de proyectos", "9": "Abierto simplificado", "10": "Asociación para la innovación", "11": "Derivado de asociación para la innovación", "12": "Basado en sistema dinámico", "13": "Licitación con negociación", "100": "Normas internas", "999": "Otros"}
# Campos que, si cambian, generan una nueva versión y un aviso en los expedientes vinculados.
TRACKED_FIELDS = ["title", "status_code", "deadline_at", "amount_without_tax", "amount_with_tax", "buyer", "documents", "lots", "procedure_code"]


def _text(node: ET.Element | None, path: str) -> str | None:
    if node is None:
        return None
    found = node.find(path, NS)
    if found is None or found.text is None:
        return None
    value = found.text.strip()
    return value or None


def _number(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 2)
    except ValueError:
        return None


def _deadline(date: str | None, time: str | None) -> str | None:
    """La plataforma publica fecha y hora locales de Madrid sin zona: se guardan en UTC."""
    if not date:
        return None
    try:
        day = datetime.strptime(date[:10], "%Y-%m-%d")
    except ValueError:
        return None
    hours, minutes, seconds = 23, 59, 59
    if time:
        try:
            parts = [int(p) for p in time[:8].split(":")]
            hours, minutes, seconds = (parts + [0, 0, 0])[:3]
        except ValueError:
            pass
    local = day.replace(hour=hours, minute=minutes, second=seconds, tzinfo=MADRID)
    return local.astimezone(timezone.utc).isoformat()


def _documents(cfs: ET.Element) -> list[dict]:
    docs = []
    for tag, kind in (("cac:LegalDocumentReference", "PCAP"), ("cac:TechnicalDocumentReference", "PPT"), ("cac:AdditionalDocumentReference", "Anexo")):
        for ref in cfs.findall(tag, NS):
            uri = _text(ref, "cac:Attachment/cac:ExternalReference/cbc:URI")
            if not uri:
                continue
            docs.append({"kind": kind, "name": _text(ref, "cbc:ID") or kind, "url": uri, "hash": _text(ref, "cac:Attachment/cac:ExternalReference/cbc:DocumentHash")})
    for ref in cfs.findall("cpe:GeneralDocument/cpe:GeneralDocumentDocumentReference", NS):
        uri = _text(ref, "cac:Attachment/cac:ExternalReference/cbc:URI")
        if uri:
            docs.append({"kind": "Otro", "name": _text(ref, "cac:Attachment/cac:ExternalReference/cbc:FileName") or _text(ref, "cbc:ID") or "Documento", "url": uri, "hash": None})
    return docs


def _cpv(project: ET.Element | None) -> list[str]:
    if project is None:
        return []
    codes = [c.text.strip() for c in project.findall("cac:RequiredCommodityClassification/cbc:ItemClassificationCode", NS) if c.text]
    return list(dict.fromkeys(codes))


def parse_entry(entry: ET.Element) -> dict | None:
    cfs = entry.find("cpe:ContractFolderStatus", NS)
    external_id = _text(entry, "a:id")
    if cfs is None or not external_id:
        return None
    link_node = entry.find("a:link", NS)
    project = cfs.find("cac:ProcurementProject", NS)
    party = cfs.find("cpe:LocatedContractingParty/cac:Party", NS)
    process = cfs.find("cac:TenderingProcess", NS)
    terms = cfs.find("cac:TenderingTerms", NS)
    nif = None
    if party is not None:
        for ident in party.findall("cac:PartyIdentification/cbc:ID", NS):
            if ident.get("schemeName") == "NIF" and ident.text:
                nif = ident.text.strip()
    lots = []
    for lot in cfs.findall("cac:ProcurementProjectLot", NS):
        lot_project = lot.find("cac:ProcurementProject", NS)
        lots.append({
            "id": _text(lot, "cbc:ID"),
            "name": _text(lot_project, "cbc:Name"),
            "amount_without_tax": _number(_text(lot_project, "cac:BudgetAmount/cbc:TaxExclusiveAmount")),
            "amount_with_tax": _number(_text(lot_project, "cac:BudgetAmount/cbc:TotalAmount")),
            "cpv": _cpv(lot_project),
        })
    qualification = []
    if terms is not None:
        for req in terms.findall("cac:TendererQualificationRequest/cac:SpecificTendererRequirement", NS):
            if _text(req, "cbc:Description"):
                qualification.append({"type": "Declaración", "text": _text(req, "cbc:Description")})
        for tag, label in (("cac:TendererQualificationRequest/cac:TechnicalEvaluationCriteria", "Solvencia técnica"), ("cac:TendererQualificationRequest/cac:FinancialEvaluationCriteria", "Solvencia económica")):
            for crit in terms.findall(tag, NS):
                text = _text(crit, "cbc:Description")
                if text:
                    qualification.append({"type": label, "text": text})
    criteria = []
    if terms is not None:
        for crit in terms.findall("cac:AwardingTerms/cac:AwardingCriteria", NS):
            criteria.append({"text": _text(crit, "cbc:Description"), "weight": _number(_text(crit, "cbc:WeightNumeric")), "type": _text(crit, "cbc:AwardingCriteriaTypeCode"), "note": _text(crit, "cbc:Note")})
    deadline_date = _text(process, "cac:TenderSubmissionDeadlinePeriod/cbc:EndDate")
    deadline_time = _text(process, "cac:TenderSubmissionDeadlinePeriod/cbc:EndTime")
    record = {
        "source": "PLACSP",
        "external_id": external_id,
        "link": link_node.get("href") if link_node is not None else None,
        "folder_id": _text(cfs, "cbc:ContractFolderID"),
        "title": _text(project, "cbc:Name") or _text(entry, "a:title") or "(sin título)",
        "buyer": _text(party, "cac:PartyName/cbc:Name"),
        "buyer_nif": nif,
        "buyer_city": _text(party, "cac:PostalAddress/cbc:CityName"),
        "status_code": _text(cfs, "cbe:ContractFolderStatusCode"),
        "contract_type": _text(project, "cbc:TypeCode"),
        "procedure_code": _text(process, "cbc:ProcedureCode"),
        "cpv": _cpv(project),
        "nuts": _text(project, "cac:RealizedLocation/cbc:CountrySubentityCode"),
        "province": _text(project, "cac:RealizedLocation/cbc:CountrySubentity"),
        "amount_without_tax": _number(_text(project, "cac:BudgetAmount/cbc:TaxExclusiveAmount")),
        "amount_with_tax": _number(_text(project, "cac:BudgetAmount/cbc:TotalAmount")),
        "estimated_value": _number(_text(project, "cac:BudgetAmount/cbc:EstimatedOverallContractAmount")),
        "deadline_at": _deadline(deadline_date, deadline_time),
        "deadline_text": f"{deadline_date} {deadline_time or ''} (hora de Madrid)".strip() if deadline_date else None,
        "documents": _documents(cfs),
        "lots": lots,
        "criteria": criteria,
        "qualification": qualification,
        "source_updated_at": _text(entry, "a:updated"),
    }
    record["content_hash"] = content_hash(record)
    return record


def content_hash(record: dict) -> str:
    stable = {k: v for k, v in record.items() if k not in ("source_updated_at", "content_hash")}
    return hashlib.sha256(json.dumps(stable, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def diff(before: dict, after: dict) -> list[dict]:
    """Cambios relevantes entre dos versiones normalizadas (antes y después)."""
    changes = []
    for field in TRACKED_FIELDS:
        old, new = before.get(field), after.get(field)
        if field == "documents":
            old_set = {(d.get("kind"), d.get("name"), d.get("hash") or d.get("url")) for d in old or []}
            new_set = {(d.get("kind"), d.get("name"), d.get("hash") or d.get("url")) for d in new or []}
            if old_set != new_set:
                added = sorted(n for _, n, _ in new_set - old_set)
                removed = sorted(n for _, n, _ in old_set - new_set)
                changes.append({"field": "documents", "label": "Documentos", "before": ", ".join(removed) or "—", "after": ", ".join(added) or "—"})
        elif field == "lots":
            if len(old or []) != len(new or []):
                changes.append({"field": "lots", "label": "Lotes", "before": str(len(old or [])), "after": str(len(new or []))})
        elif old != new:
            label = {"title": "Objeto", "status_code": "Estado", "deadline_at": "Fin de presentación", "amount_without_tax": "Importe sin IVA", "amount_with_tax": "Importe con IVA", "buyer": "Órgano de contratación", "procedure_code": "Procedimiento"}[field]
            fmt = lambda v: STATUS_LABELS.get(v, v) if field == "status_code" else v  # noqa: E731
            changes.append({"field": field, "label": label, "before": fmt(old), "after": fmt(new)})
    return changes


class FeedPage:
    def __init__(self, entries: list[dict], deleted: list[tuple[str, str]], next_url: str | None, updated_range: tuple[str | None, str | None]):
        self.entries = entries
        self.deleted = deleted
        self.next_url = next_url
        self.oldest, self.newest = updated_range


def parse_feed(xml_bytes: bytes) -> FeedPage:
    root = ET.fromstring(xml_bytes)
    entries, deleted, updates = [], [], []
    for entry in root.findall("a:entry", NS):
        record = parse_entry(entry)
        if record:
            entries.append(record)
            if record["source_updated_at"]:
                updates.append(record["source_updated_at"])
    for tomb in root.findall("at:deleted-entry", NS):
        deleted.append((tomb.get("ref"), tomb.get("when")))
    next_url = None
    for link in root.findall("a:link", NS):
        if link.get("rel") == "next":
            next_url = link.get("href")
    parsed = sorted(updates, key=parse_time)
    return FeedPage(entries, deleted, next_url, (parsed[0] if parsed else None, parsed[-1] if parsed else None))


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def newest_per_tender(records: Iterable[dict]) -> Iterator[dict]:
    """Una licitación puede aparecer varias veces en una pasada: se conserva la versión más reciente."""
    best: dict[str, dict] = {}
    for record in records:
        current = best.get(record["external_id"])
        if current is None or parse_time(record["source_updated_at"] or "1970-01-01T00:00:00+00:00") > parse_time(current["source_updated_at"] or "1970-01-01T00:00:00+00:00"):
            best[record["external_id"]] = record
    return iter(best.values())
