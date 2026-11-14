"""Datos simulados deterministas para desarrollo del frontend (no son datos reales)."""
import math
import random
from datetime import date

METHODOLOGY_VERSION = "0.0.0-mock"
DATA_CUTOFF = "2026-11-12"
ATTRIBUTION = "NASA FIRMS"
UNCERTAINTY = {"years_estimated": [2000, 2011], "median_rel_error": 0.18}

# Estacionalidad aproximada de Coahuila: pico marzo-mayo
_SEASON = [0.3, 0.5, 1.6, 2.2, 1.8, 0.7, 0.3, 0.3, 0.4, 0.4, 0.3, 0.3]


def _rng(*key):
    return random.Random("|".join(map(str, key)))


def calendar_rows(y0: int, y1: int, metric: str = "count", reference: str = "median"):
    rows = []
    for y in range(max(y0, 2001), y1 + 1):
        for m in range(1, 13):
            r = _rng("cal", y, m)
            base = 100 * _SEASON[m - 1]
            factor = r.lognormvariate(0, 0.45)
            if (y, m) == (2021, 3):
                factor = 3.4  # caso de la demo
            count = round(base * factor, 1)
            ref = round(base, 1)
            ratio = round(count / ref, 2) if ref else None
            pct = min(0.99, max(0.01, 0.5 + math.log(max(factor, 0.05)) / 2))
            rp = round(1 / (1 - pct), 1) if pct < 0.99 else 100
            val = count if metric == "count" else round(count * 14.2, 1)
            rows.append({
                "year": y, "month": m,
                "count_harm": val,
                "count_harm_lo": round(val * (0.82 if y <= 2011 else 0.95), 1),
                "count_harm_hi": round(val * (1.18 if y <= 2011 else 1.05), 1),
                "frp_harm": round(count * 14.2, 1),
                "anomaly_ratio": ratio,
                "percentile": round(pct, 2),
                "return_period_years": rp,
                "clear_frac": round(0.55 + 0.4 * r.random(), 2),
                "is_estimated": y <= 2011,
                "enso_phase": ["nino", "neutral", "nina"][(y + m) % 3],
            })
    return rows


def daily_rows(year: int, month: int):
    n = (date(year + (month == 12), month % 12 + 1, 1) - date(year, month, 1)).days
    out = []
    for d in range(1, n + 1):
        r = _rng("day", year, month, d)
        out.append({"date": date(year, month, d).isoformat(),
                    "count_harm": round(_SEASON[month - 1] * 10 * r.lognormvariate(0, 0.8), 1),
                    "clear_frac": round(0.5 + 0.45 * r.random(), 2)})
    return out


def events():
    names = [("2021-03-08", "2021-03-19", 412.5, 5870.0, 48.2), ("2019-04-02", "2019-04-09", 301.0, 4210.0, 35.1),
             ("2011-05-20", "2011-06-04", 560.3, 9100.0, 80.4), ("2023-05-14", "2023-05-18", 120.8, 1500.0, 14.0)]
    ev = []
    for i, (s, e, n, frp, area) in enumerate(sorted(names, key=lambda x: -x[2]), 1):
        ev.append({"event_id": f"MOCK-{s}", "start_date": s, "end_date": e,
                   "duration_days": (date.fromisoformat(e) - date.fromisoformat(s)).days + 1,
                   "n_hotspots_harm": n, "frp_total": frp, "area_approx_km2": area,
                   "night_ratio": 0.31, "burn_type": "forestal",
                   "centroid_lat": 25.35, "centroid_lon": -100.55, "rank": i})
    return ev
