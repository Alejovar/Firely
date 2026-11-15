"""Turn official fire statistics (text pasted from a PDF, CSV or a messy table) into validated records (§11.2).

Two extractors share one validator:
- ``rules``: deterministic table parser (delimiters, header synonyms in ES/EN/PT, number formats, total rows).
- LLM (optional, ``ANTHROPIC_API_KEY``): structured output through a forced tool call. The document is DATA:
  the system prompt tells the model to ignore any instruction inside it, and every record is re-validated.

Nothing is invented: a value that is not in the document stays ``None`` and the record is flagged for review.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from .intent import MONTH_INDEX, fold, llm_model, setting

FIELDS = ("state", "municipality", "year", "month", "fires", "area_ha", "cause")
HEADERS = {
    "state": ("estado", "entidad", "entidad federativa", "provincia", "state", "province", "uf"),
    "municipality": ("municipio", "departamento", "partido", "municipality", "county", "localidad"),
    "year": ("ano", "anio", "year", "ejercicio"),
    "month": ("mes", "month", "mes de inicio"),
    "period": ("periodo", "fecha", "fecha de inicio", "date", "data", "inicio"),
    "fires": ("incendios", "numero de incendios", "no de incendios", "num incendios", "n incendios", "cantidad",
              "fires", "number of fires", "ocurrencias", "eventos", "incendios forestales"),
    "area_ha": ("superficie", "superficie afectada", "superficie ha", "hectareas", "ha", "area", "area ha",
                "area afectada", "burned area", "hectares", "area queimada"),
    "cause": ("causa", "causas", "cause", "origen"),
}
MAX_TEXT = 60_000
MAX_ROWS = 2_000


def _norm_header(cell: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", fold(cell)).strip()


def _column_role(cell: str) -> str | None:
    h = re.sub(r"\s+", " ", _norm_header(cell))
    for role, names in HEADERS.items():
        if h in names:
            return role
    for role, names in HEADERS.items():  # "superficie (ha)", "no. de incendios forestales"
        if any(len(n) > 3 and n in h for n in names):
            return role
    return None


def _split(line: str) -> list[str]:
    for sep in ("\t", "|", ";"):
        if sep in line:
            return [c.strip() for c in line.strip().strip("|").split(sep)]
    if re.search(r"\S {2,}\S", line):
        return [c.strip() for c in re.split(r" {2,}", line.strip())]
    if "," in line and not re.search(r"\d,\d{3}\b", line):
        return [c.strip() for c in line.split(",")]
    return [line.strip()]


def parse_number(text) -> float | None:
    """'1,234.5', '1.234,5', '1 234', '12 ha' -> float. Empty, '-', 'n/d' -> None."""
    if text is None:
        return None
    if isinstance(text, (int, float)):
        return float(text)
    s = fold(str(text)).replace(" ", " ").strip()
    s = re.sub(r"(ha|hectareas|has)\.?$", "", s).strip()
    if not s or s in {"-", "--", "n/d", "nd", "s/d", "na", "n/a", "..."}:
        return None
    s = s.replace(" ", "")
    if re.fullmatch(r"-?\d{1,3}(\.\d{3})+(,\d+)?", s):  # 1.234,5
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"-?\d{1,3}(,\d{3})+(\.\d+)?", s):  # 1,234.5
        s = s.replace(",", "")
    elif re.fullmatch(r"-?\d+,\d+", s):  # 12,5
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _period(text: str) -> tuple[int | None, int | None]:
    s = fold(text or "")
    iso = re.search(r"\b((?:19|20)\d{2})[-/](\d{1,2})\b", s) or None
    if iso:
        return int(iso[1]), int(iso[2])
    dmy = re.search(r"\b(\d{1,2})[-/](\d{1,2})[-/]((?:19|20)\d{2})\b", s)
    if dmy:
        return int(dmy[3]), int(dmy[2])
    year = re.search(r"\b(?:19|20)\d{2}\b", s)
    month = next((n for w, n in MONTH_INDEX.items() if re.search(rf"\b{w}\b", s)), None)
    return (int(year[0]) if year else None), month


def rules(text: str) -> dict:
    lines = [ln for ln in (text or "").splitlines() if ln.strip()]
    header_idx, roles = None, []
    for i, line in enumerate(lines[:50]):
        cells = _split(line)
        found = [_column_role(c) for c in cells]
        if sum(r is not None for r in found) >= 2 and ("fires" in found or "area_ha" in found):
            header_idx, roles = i, found
            break
    if header_idx is None:
        return {"records": [], "totals": [], "header": None,
                "warning": "No se encontró una fila de encabezados reconocible (p. ej., 'Municipio', 'Incendios', 'Superficie (ha)')."}
    records, totals = [], []
    for n, line in enumerate(lines[header_idx + 1:header_idx + 1 + MAX_ROWS], start=header_idx + 2):
        cells = _split(line)
        if len(cells) < 2:
            continue
        rec = {f: None for f in FIELDS}
        period_text = None
        for role, cell in zip(roles, cells):
            if role is None:
                continue
            if role in ("state", "municipality", "cause"):
                rec[role] = cell or None
            elif role == "year":
                v = parse_number(cell)
                rec["year"] = int(v) if v is not None and v == int(v) else None
            elif role == "month":
                v = parse_number(cell)
                rec["month"] = int(v) if v is not None and v == int(v) else MONTH_INDEX.get(fold(cell).strip())
            elif role == "period":
                period_text = cell
            elif role == "fires":
                rec["fires"] = parse_number(cell)
            elif role == "area_ha":
                rec["area_ha"] = parse_number(cell)
        if period_text:
            y, m = _period(period_text)
            rec["year"] = rec["year"] or y
            rec["month"] = rec["month"] or m
        label = fold(" ".join(c for c in cells if c))
        rec["source_line"] = n
        if re.match(r"^\s*(total|totales|suma|nacional|grand total)\b", label) or re.search(r"\btotal\b", fold(rec.get("state") or "")) \
                or re.search(r"\btotal\b", fold(rec.get("municipality") or "")):
            totals.append(rec)
        else:
            records.append(rec)
    return {"records": records, "totals": totals, "header": [r for r in roles]}


def validate(records: list[dict], totals: list[dict]) -> tuple[list[dict], list[dict]]:
    """Adds ``issues`` and ``needs_review`` to each record; returns (records, document-level checks)."""
    out = []
    for rec in records:
        issues = []
        y, m, fires, area = rec.get("year"), rec.get("month"), rec.get("fires"), rec.get("area_ha")
        if not (rec.get("state") or rec.get("municipality")):
            issues.append("sin entidad ni municipio")
        if y is None:
            issues.append("sin año")
        elif not 1990 <= y <= 2035:
            issues.append(f"año fuera de rango ({y})")
        if m is not None and not 1 <= m <= 12:
            issues.append(f"mes inválido ({m})")
        if fires is None and area is None:
            issues.append("sin número de incendios ni superficie")
        if fires is not None and (fires < 0 or fires != int(fires)):
            issues.append(f"número de incendios no entero o negativo ({fires})")
        if area is not None and area < 0:
            issues.append(f"superficie negativa ({area})")
        if fires and area is not None and area / fires > 50_000:
            issues.append("superficie por incendio inusualmente alta: revisar unidades")
        out.append({**rec, "fires": int(fires) if fires is not None and fires == int(fires) and fires >= 0 else fires,
                    "issues": issues, "needs_review": bool(issues)})
    checks = []
    for total in totals:
        for field, label in (("fires", "incendios"), ("area_ha", "superficie")):
            expected = total.get(field)
            if expected is None:
                continue
            got = sum(r[field] for r in out if isinstance(r.get(field), (int, float)))
            ok = abs(got - expected) <= max(0.5, 0.005 * abs(expected))
            checks.append({"check": f"suma de {label} = fila de total (línea {total.get('source_line')})",
                           "expected": expected, "computed": round(got, 2), "ok": ok})
    return out, checks


def _llm(text: str, client=None) -> dict | None:
    key = setting("ANTHROPIC_API_KEY")
    if not key and client is None:
        return None
    try:
        if client is None:
            import anthropic
            client = anthropic.Anthropic(api_key=key, timeout=20.0)
        schema = json.loads((Path(__file__).parent / "prompts" / "report.schema.json").read_text(encoding="utf-8"))
        system = (Path(__file__).parent / "prompts" / "report.md").read_text(encoding="utf-8")
        # Structured output (JSON schema) instead of a forced tool call: current models reject forced tool_choice.
        response = client.messages.create(
            model=llm_model(), max_tokens=16000, system=system,
            messages=[{"role": "user", "content": f"<documento>\n{text}\n</documento>"}],
            output_config={"format": {"type": "json_schema", "schema": schema}})
        if getattr(response, "stop_reason", None) in ("refusal", "max_tokens"):
            return None
        for block in response.content:
            if getattr(block, "type", None) == "text":
                data = json.loads(block.text)
                data = data if isinstance(data, dict) else {}
                recs = [{f: r.get(f) for f in FIELDS} | {"source_line": r.get("source_line")}
                        for r in data.get("records", []) if isinstance(r, dict)][:MAX_ROWS]
                tots = [{f: r.get(f) for f in FIELDS} | {"source_line": r.get("source_line")}
                        for r in data.get("totals", []) if isinstance(r, dict)]
                for r in recs + tots:  # types are re-checked: the model may return strings
                    for f in ("fires", "area_ha"):
                        r[f] = parse_number(r[f])
                    for f in ("year", "month"):
                        v = parse_number(r[f])
                        r[f] = int(v) if v is not None and v == int(v) else None
                return {"records": recs, "totals": tots, "header": None}
    except Exception:
        return None
    return None


def extract(text: str, *, use_llm: bool = True, client=None) -> dict:
    if not text or not text.strip():
        raise ValueError("text is required")
    if len(text) > MAX_TEXT:
        raise ValueError(f"text too long (max {MAX_TEXT} characters)")
    parsed, source = None, "rules"
    if use_llm:
        parsed = _llm(text, client)
        source = "llm" if parsed and parsed["records"] else "rules"
    if not parsed or not parsed["records"]:
        parsed = rules(text)
    records, checks = validate(parsed["records"], parsed["totals"])
    return {"source": source, "records": records, "checks": checks, "header": parsed.get("header"),
            "warning": parsed.get("warning"),
            "n_records": len(records), "n_needs_review": sum(r["needs_review"] for r in records),
            "all_checks_ok": all(c["ok"] for c in checks) if checks else None}
