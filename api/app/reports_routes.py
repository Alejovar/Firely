"""POST /reports/extract: official fire statistics (pasted text) -> validated records for `reported_fires` (§11.2).

Nothing is stored or published: the response is a review sheet. A person accepts the rows before they feed any
comparison (§8.15 detectados vs reportados).
"""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ai import reports
from .real import ATTRIBUTION, VERSION

router = APIRouter()


class ExtractRequest(BaseModel):
    text: str = Field(min_length=1, max_length=reports.MAX_TEXT)
    source_label: str | None = Field(None, max_length=200)
    use_llm: bool = True


def to_csv(records: list[dict]) -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow([*reports.FIELDS, "source_line", "needs_review", "issues"])
    for r in records:
        writer.writerow([*(r.get(f) for f in reports.FIELDS), r.get("source_line"), r["needs_review"], "; ".join(r["issues"])])
    return out.getvalue()


@router.post("/reports/extract")
def extract_report(req: ExtractRequest):
    try:
        result = reports.extract(req.text, use_llm=req.use_llm)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"methodology_version": VERSION, "attribution": ATTRIBUTION, "source_label": req.source_label,
            **result, "csv": to_csv(result["records"]), "stored": False,
            "note": "Registros copiados del documento y validados (tipos, rangos y sumas contra totales). "
                    "Los marcados needs_review requieren revisión humana antes de usarse; nada se guarda ni se publica."}
