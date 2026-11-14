"""Administrative names and cell membership from the processed geo tables."""

import unicodedata

from fastapi import HTTPException

from . import db

COUNTRIES = ("Mexico", "Argentina")


def _fold(value):
    return "".join(c for c in unicodedata.normalize("NFKD", value.casefold())
                   if not unicodedata.combining(c))


def units():
    result = []
    for country in COUNTRIES:
        path = db.file_path("geo/admin_units.parquet", country)
        if not path:
            continue
        with db.connection() as con:
            cols = ("bbox_west, bbox_south, bbox_east, bbox_north" if country == "Mexico"
                    else "bbox_min_lon, bbox_min_lat, bbox_max_lon, bbox_max_lat")
            rows = con.execute(f"SELECT level, code, name, parent_code, {cols} FROM read_parquet(?)",
                               [path]).fetchall()
        result.extend({"level": level, "code": code, "name": name,
                       "parent": parent, "country": country, "bbox": list(box)}
                      for level, code, name, parent, *box in rows)
    return result


def search(q):
    key = _fold(q.strip())
    if not key:
        return []
    return [u for u in units() if key in _fold(u["name"]) or key in _fold(u["code"])]


def resolve(value):
    key = _fold(value.strip())
    all_units = units()
    found = [u for u in all_units if key == _fold(u["code"]) or key == _fold(u["name"])]
    if not found and key:
        found = [u for u in all_units if _fold(u["name"]).startswith(key)]
    if not found:
        raise HTTPException(404, detail="Administrative unit not found")
    if len(found) > 1:
        raise HTTPException(300, detail={"candidates": found})
    return found[0]


def cells(unit):
    path = db.file_path("geo/admin_cells.parquet", unit["country"])
    if not path:
        return []
    with db.connection() as con:
        return [row[0] for row in con.execute(
            "SELECT h3_r6 FROM read_parquet(?) WHERE level=? AND code=?",
            [path, unit["level"], unit["code"]]).fetchall()]


def intersecting_states(cells):
    path = db.file_path("geo/admin_cells.parquet", "Mexico")
    if not path or not cells:
        return []
    with db.connection() as con:
        codes = [row[0] for row in con.execute(
            "SELECT DISTINCT code FROM read_parquet(?) WHERE level='ent' AND h3_r6 IN (SELECT unnest(?))",
            [path, cells]).fetchall()]
    return [u for u in units() if u["country"] == "Mexico" and u["level"] == "ent" and u["code"] in codes]
