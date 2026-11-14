"""Descriptive analyses of the processed Firely tables.

Monthly harmonized counts are spread uniformly within each calendar month when a
within-month date is needed. This is an interpolation, not observed daily timing.
All full-year comparisons exclude incomplete years and zero-activity seasons.
"""

from calendar import monthrange
from datetime import date, timedelta
from math import erfc, exp, sqrt

import numpy as np

from api.app import db


def _query(files, cells, select, where=""):
    if not files or cells == []:
        return []
    clauses = []
    params = [files]
    if cells is not None:
        clauses.append("h3_r6 IN (SELECT unnest(?))")
        params.append(list(cells))
    if where:
        clauses.append(where)
    projection, _, suffix = select.partition(" GROUP BY ")
    sql = f"SELECT {projection} FROM {db.table_sql(files)}"
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    if suffix:
        sql += " GROUP BY " + suffix
    with db.connection() as con:
        con.execute("SET memory_limit='1GB'")
        return con.execute(sql, params).fetchall()


def _monthly(cells):
    rows = _query(db.parquet_files("cell_month_harmonized"), cells,
                  "year, month, sum(count_harm), bool_or(is_estimated) "
                  "GROUP BY year, month ORDER BY year, month")
    by_year = {}
    for year, month, count, estimated in rows:
        by_year.setdefault(year, {})[month] = (float(count or 0), bool(estimated))
    return by_year


def _full_years(by_year):
    return {y: months for y, months in by_year.items() if set(months) == set(range(1, 13))}


def _cutoff(by_year):
    return max((date(y, m, monthrange(y, m)[1]) for y, months in by_year.items()
                for m in months), default=None)


def _quantile_date(year, months, fraction):
    total = sum(v for v, _ in months.values())
    if total <= 0:
        return None
    target = total * fraction
    cumulative = 0.0
    for month in range(1, 13):
        value = months[month][0]
        if value > 0 and cumulative + value >= target:
            days = monthrange(year, month)[1]
            offset = min(days - 1, max(0, int((target - cumulative) / value * days)))
            return date(year, month, 1) + timedelta(days=offset)
        cumulative += value
    return date(year, 12, 31)


def _calendar_day(d):
    # A fixed non-leap calendar avoids an artificial one-day step every leap year.
    return (date(2001, d.month, d.day if (d.month, d.day) != (2, 29) else 28)
            - date(2001, 1, 1)).days + 1


def _trend(points):
    if len(points) < 3:
        return {"n": len(points), "sen_days_per_decade": None, "p_value": None}
    xs = np.array([p[0] for p in points], dtype=float)
    ys = np.array([p[1] for p in points], dtype=float)
    slopes = [(ys[j] - ys[i]) / (xs[j] - xs[i]) for i in range(len(xs))
              for j in range(i + 1, len(xs))]
    slope = float(np.median(slopes) * 10)
    s = sum(int(np.sign(ys[j] - ys[i])) for i in range(len(xs)) for j in range(i + 1, len(xs)))
    n = len(xs)
    _, ties = np.unique(ys, return_counts=True)
    var_s = (n * (n - 1) * (2 * n + 5)
             - sum(t * (t - 1) * (2 * t + 5) for t in ties)) / 18
    z = (s - np.sign(s)) / sqrt(var_s) if var_s > 0 and s else 0.0
    return {"n": n, "sen_days_per_decade": slope,
            "p_value": erfc(abs(z) / sqrt(2))}


def season(cells):
    by_year = _monthly(cells)
    years = _full_years(by_year)
    rows = []
    for year, months in sorted(years.items()):
        total = sum(v for v, _ in months.values())
        if total <= 0:
            continue
        dates = [_quantile_date(year, months, q) for q in (0.1, 0.5, 0.9)]
        rows.append({"year": year, "onset": dates[0].isoformat(),
                     "peak": dates[1].isoformat(), "end": dates[2].isoformat(),
                     "annual_count_harm": total,
                     "is_estimated": any(est for _, est in months.values())})
    trends = {key: _trend([(r["year"], _calendar_day(date.fromisoformat(r[key])))
                            for r in rows]) for key in ("onset", "peak")}
    observed_trends = {key: _trend([(r["year"], _calendar_day(date.fromisoformat(r[key])))
                                     for r in rows if not r["is_estimated"]])
                       for key in ("onset", "peak")}
    # The headline claim uses OBSERVED (VIIRS-era) years only: a trend that appears only when the
    # MODIS-estimated 2001-2011 are mixed in can be an artifact of the harmonization, not of the fire.
    obs, full = observed_trends["onset"], trends["onset"]
    n_obs = sum(1 for r in rows if not r["is_estimated"])
    if obs["p_value"] is not None and obs["p_value"] < 0.1:
        direction = "antes" if obs["sen_days_per_decade"] < 0 else "después"
        summary = (f"Con los años observados ({n_obs} años de VIIRS), la temporada empieza "
                   f"{abs(obs['sen_days_per_decade']):.1f} días {direction} por década (p={obs['p_value']:.3f}).")
    else:
        pv = f" (p={obs['p_value']:.3f})" if obs["p_value"] is not None else ""
        summary = f"Con los años observados ({n_obs} años de VIIRS) no hay una tendencia clara en el inicio de la temporada{pv}."
    if full["p_value"] is not None and full["p_value"] < 0.1 and (obs["p_value"] is None or obs["p_value"] >= 0.1):
        direction = "antes" if full["sen_days_per_decade"] < 0 else "después"
        summary += (f" Si se incluyen los años estimados desde MODIS (2001–2011) aparece un cambio de "
                    f"{abs(full['sen_days_per_decade']):.1f} días {direction} por década (p={full['p_value']:.3f}), "
                    f"que podría deberse al método de armonización y no al fuego.")
    return {"rows": rows, "trend": trends, "trend_observed_only": observed_trends,
            "summary_es": summary,
            "method": "Monthly counts distributed uniformly within each month; 10/50/90% of annual total; Sen slope and two-sided Mann-Kendall test.",
            "data_cutoff": _cutoff(by_year).isoformat() if by_year else None}


def _partial(months, through):
    return sum(months.get(m, (0, False))[0] for m in range(1, through.month)) + \
        months.get(through.month, (0, False))[0] * through.day / monthrange(through.year, through.month)[1]


def _oni():
    path = db.processed_root() / "context" / "oni.parquet"
    if not path.is_file():
        return {}
    with db.connection() as con:
        con.execute("SET memory_limit='1GB'")
        return {(y, m): (value, phase) for y, m, value, phase in con.execute(
            "SELECT year, month, oni, phase FROM read_parquet(?)", [str(path)]).fetchall()}


def analogs(cells, through):
    by_year = _monthly(cells)
    cutoff = _cutoff(by_year)
    if cutoff is None or through > cutoff:
        raise ValueError("date is beyond the harmonized data cutoff")
    current = by_year.get(through.year, {})
    if through.month not in current:
        raise ValueError("no harmonized data for the requested month")
    full = _full_years(by_year)
    current_curve = np.array([_partial(current, date(through.year, m, min(through.day, monthrange(through.year, m)[1])))
                              if m == through.month else sum(current.get(k, (0, False))[0] for k in range(1, m + 1))
                              for m in range(1, through.month + 1)])
    oni = _oni()
    current_phase = oni.get((through.year, through.month), (None, None))[1]
    scale = max(float(np.median([sum(v for v, _ in ms.values()) for ms in full.values()])), 1.0)
    ranked = []
    for year, months in full.items():
        if year >= through.year:
            continue
        curve = np.array([sum(months[k][0] for k in range(1, m + 1)) if m < through.month
                          else sum(months[k][0] for k in range(1, m)) +
                          months[m][0] * through.day / monthrange(year, m)[1]
                          for m in range(1, through.month + 1)])
        distance = float(np.sqrt(np.mean(((current_curve - curve) / scale) ** 2)))
        phase = oni.get((year, through.month), (None, None))[1]
        if current_phase and phase and current_phase != phase:
            distance += 0.1
        total = sum(v for v, _ in months.values())
        ranked.append({"year": year, "similarity": 1 / (1 + distance),
                       "year_end_count_harm": total,
                       "is_estimated": any(e for _, e in months.values()),
                       "oni_phase": phase})
    top = sorted(ranked, key=lambda r: (-r["similarity"], r["year"]))[:3]
    totals = [r["year_end_count_harm"] for r in top]
    projection = {f"p{q}": float(np.percentile(totals, q)) if totals else None
                  for q in (10, 50, 90)}
    return {"date": through.isoformat(), "current_count_harm": float(current_curve[-1]),
            "current_oni_phase": current_phase, "analogs": top,
            "estimated_analog_years": [r["year"] for r in top if r["is_estimated"]],
            "projection": projection, "confidence": "low" if current_curve[-1] < 10 or not top or top[0]["similarity"] < 0.5 else "descriptive",
            "method": "RMSE of monthly cumulative counts divided by median annual total; 0.1 distance penalty for differing ONI phase; unscaled historical year-end totals; reference, not forecast.",
            "data_cutoff": cutoff.isoformat()}


def return_period(cells, year, month):
    if month not in range(1, 13):
        raise ValueError("month must be 1..12")
    by_year = _monthly(cells)
    target = by_year.get(year, {}).get(month)
    refs = [months[month][0] for y, months in _full_years(by_year).items()
            if y != year]
    if target is None or not refs:
        return {"year": year, "month": month, "count_harm": target[0] if target else None,
                "percentile": None, "return_period_years": None, "n_reference_years": len(refs),
                "data_cutoff": _cutoff(by_year).isoformat() if by_year else None}
    value = target[0]
    greater = sum(x > value for x in refs)
    equal = sum(x == value for x in refs)
    rank = greater + (equal + 1) / 2 if equal else greater + 1
    percentile = 1 - rank / (len(refs) + 1)
    return {"year": year, "month": month, "count_harm": value,
            "percentile": percentile, "return_period_years": min(50.0, 1 / (1 - percentile)),
            "n_reference_years": len(refs),
            "method": "Descending empirical midrank against other complete years; period capped at 50 years.",
            "data_cutoff": _cutoff(by_year).isoformat()}


def _viirs_files():
    return [f for f in db.parquet_files("hotspots") if int(f.split("year=")[1][:4]) >= 2012]


def _viirs_rows(cells, select, group):
    return _query(_viirs_files(), cells, select + " " + group,
                  "sensor = 'VIIRS' AND platform IN ('SNPP', 'NOAA20') AND daynight IN ('D', 'N')")


def _viirs_cutoff(cells):
    rows = _viirs_rows(cells, "max(date_local)", "")
    return rows[0][0].isoformat() if rows and rows[0][0] else None


def weekday(cells):
    """Day-of-week of fire EVENT starts (not raw detections).

    A single fire produces hundreds of detections on the same day (and S-NPP + NOAA-20 see it twice), so a
    chi-square on raw points treats strongly dependent rows as independent and gives absurdly small p-values.
    Events already group those detections: one fire = one observation. Only VIIRS-era events (not estimated)
    with at least 3 hotspots are used."""
    import duckdb
    files = str(db.processed_root() / "events" / "*" / "year=*" / "part-0.parquet")
    where = "NOT estimated AND n_hotspots_harm >= 3"
    params = []
    if cells is not None:
        where += " AND list_has_any(cells, ?)"
        params.append(list(cells))
    con = duckdb.connect()
    con.execute("SET memory_limit='1GB'")
    try:
        rows = con.execute(f"SELECT dayofweek(start_date) AS dow, count(*) FROM read_parquet(?, union_by_name=true) "
                           f"WHERE {where} GROUP BY 1", [files] + params).fetchall()
    except duckdb.IOException:
        rows = []
    counts = [0] * 7
    for dow, n in rows:
        counts[(dow - 1) % 7] = n  # DuckDB dayofweek: Sunday=0; output Monday first
    total = sum(counts)
    chi2 = sum((n - total / 7) ** 2 / (total / 7) for n in counts) if total else None
    x = chi2 / 2 if chi2 is not None else None
    p = exp(-x) * (1 + x + x * x / 2) if x is not None else None  # exact chi-square survival, df=6
    if total < 30:
        summary = "Hay muy pocos incendios en el área para evaluar un efecto del día de la semana."
    elif p is not None and p < 0.01:
        summary = "El inicio de los incendios varía significativamente entre días de la semana."
    else:
        summary = "Sin evidencia suficiente de un efecto del día de la semana."
    return {"counts_monday_first": counts, "n_events": total, "chi_square": chi2, "p_value": p,
            "summary_es": summary, "data_cutoff": _viirs_cutoff(cells),
            "method": "Start weekday of VIIRS-era fire events (>=3 hotspots), local date; chi-square versus "
                      "uniform, df=6. Events, not raw detections, are the unit because detections are clustered."}


def night_ratio(cells):
    rows = _viirs_rows(cells, "year(date_local) AS year, count(*) AS total, "
                       "sum(CASE WHEN daynight = 'N' THEN 1 ELSE 0 END) AS night",
                       "GROUP BY 1 ORDER BY 1")
    return {"data_cutoff": _viirs_cutoff(cells),
            "rows": [{"year": y, "night_detections": night, "total_detections": total,
                      "night_ratio": night / total} for y, total, night in rows],
            "method": "Raw VIIRS SNPP/NOAA20 detections since 2012; night share among records with D/N flag."}
