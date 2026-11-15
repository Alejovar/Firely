"""Aggregate harmonized H3 r6 months to r4 for the continental animation."""
from __future__ import annotations

import json

import h3
import pandas as pd

from .tables_common import connect, copy_atomic, countries, harmonized_glob, parser, q


def build(processed, country: str, force=False, memory_limit="2GB") -> dict:
    out = processed / "animation_r4" / country / "part.parquet"
    if out.exists() and not force:
        return {"country": country, "skipped": True, "output": str(out)}
    con = connect(memory_limit, processed)
    try:
        glob = harmonized_glob(processed,country)
        cells = [r[0] for r in con.execute(f"SELECT DISTINCT h3_r6 FROM read_parquet({q(glob)})").fetchall()]
        mapping = pd.DataFrame({"h3_r6": cells, "h3_r4": [h3.cell_to_parent(c,4) for c in cells]})
        con.register("mapping",mapping)
        sql = f"""SELECT x.h3_r4,m.year::INTEGER AS year,m.month::INTEGER AS month,
          sum(m.count_harm) AS count_harm,bool_or(m.is_estimated) AS is_estimated
          FROM read_parquet({q(glob)},hive_partitioning=true) m
          JOIN mapping x USING(h3_r6) GROUP BY 1,2,3 ORDER BY 2,3,1"""
        copy_atomic(con,sql,out)
        n = con.execute(f"SELECT count(*) FROM read_parquet({q(out)})").fetchone()[0]
        return {"country":country,"rows":n,"cells":len(set(mapping.h3_r4)),"output":str(out)}
    finally:
        con.close()


def main():
    a=parser(__doc__).parse_args()
    for country in a.country or countries(a.processed):
        print(json.dumps(build(a.processed,country,a.force,a.memory_limit),ensure_ascii=False),flush=True)


if __name__ == "__main__":
    main()
