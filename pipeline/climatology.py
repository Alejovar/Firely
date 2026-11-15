"""`climatology` table (descripcion §6.5): per H3 r6 cell and calendar month, the distribution of the harmonized
monthly series over the complete years.

Reads  data/processed/cell_month_harmonized/<Country>/year=*/*.parquet  (dense: zeros are explicit)
Writes data/processed/climatology/<Country>/part.parquet

Columns: h3_r6, month, median, mean, p10, p25, p75, p90 (of count_harm), frp_median, frp_mean, frp_p10, frp_p25,
frp_p75, frp_p90 (of frp_harm), n_years, first_year, last_year.

* Reference years = 2001 .. last complete year of the country (all 12 months present), the same rule /calendar uses:
  a partial current year never enters the reference. Years 2001-2011 are MODIS-based estimates (is_estimated).
* Percentiles are linear (quantile_cont); the median equals the midpoint median /calendar computes.
* Per-cell values: the median of an AREA is not the sum of its cells' medians, so /calendar keeps computing the area
  reference from the area series; this table serves single-cell lookups, maps of "typical month" and /sql.

    python -m pipeline.climatology [--country Mexico Argentina] [--force]
"""
from __future__ import annotations

from .tables_common import connect, copy_atomic, countries, harmonized_glob, last_full_year, parser, q

STATS = {"median": 0.5, "p10": 0.1, "p25": 0.25, "p75": 0.75, "p90": 0.9}


def build(processed, country: str, force: bool = False, memory_limit: str = "2GB") -> dict:
    dest = processed / "climatology" / country / "part.parquet"
    if dest.is_file() and not force:
        return {"country": country, "skipped": True, "output": str(dest)}
    con = connect(memory_limit, processed)
    try:
        glob = harmonized_glob(processed, country)
        last = last_full_year(con, glob)
        if last is None:
            return {"country": country, "skipped": True, "reason": "no complete year"}
        cols = [f"quantile_cont(count_harm, {p}) AS {name}" for name, p in STATS.items()]
        cols.insert(1, "avg(count_harm) AS mean")
        cols += [f"quantile_cont(frp_harm, {p}) AS frp_{name}" for name, p in STATS.items()]
        cols.insert(len(STATS) + 2, "avg(frp_harm) AS frp_mean")
        sql = f"""SELECT h3_r6, month::TINYINT AS month, {', '.join(cols)},
                         count(DISTINCT year)::INTEGER AS n_years, min(year)::INTEGER AS first_year,
                         max(year)::INTEGER AS last_year
                  FROM read_parquet({q(glob)}, hive_partitioning=true)
                  WHERE year BETWEEN 2001 AND {int(last)} AND count_harm IS NOT NULL
                  GROUP BY 1, 2 ORDER BY 1, 2"""
        copy_atomic(con, sql, dest)
        n = con.execute(f"SELECT count(*) FROM read_parquet({q(dest)})").fetchone()[0]
    finally:
        con.close()
    return {"country": country, "rows": n, "years": [2001, int(last)], "output": str(dest)}


def main() -> None:
    a = parser(__doc__).parse_args()
    for country in a.country or countries(a.processed):
        print(build(a.processed, country, a.force, a.memory_limit), flush=True)


if __name__ == "__main__":
    main()
