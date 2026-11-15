"""Small DuckDB access layer for the processed, partitioned Parquet tables."""

import os
from pathlib import Path

import duckdb


def processed_root() -> Path:
    return Path(os.environ.get("FIRELY_DATA_PROCESSED", "data/processed"))


def state_root() -> Path:
    """Writable folder for app state (CAP drafts, API caches). The processed data can stay read-only."""
    return Path(os.environ.get("FIRELY_STATE_DIR") or processed_root())


def parquet_files(table: str) -> list[str]:
    root = processed_root() / table
    return sorted(str(p) for p in root.glob("*/year=*/*.parquet"))


def connection() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(":memory:")
    con.execute("SET memory_limit='1GB'")
    return con


def file_path(table: str, country: str | None = None) -> str | None:
    path = (processed_root() / "geo" / country / Path(table).name) if country else processed_root() / table
    return str(path) if path.is_file() else None


def table_sql(files: list[str]) -> str:
    # File names are passed as DuckDB parameters, never interpolated into SQL.
    return "read_parquet(?, hive_partitioning=true, union_by_name=true)"



# Events touching an area. Small areas compare each event's cell list (list_has_any); large drawn areas
# (thousands of cells) made that ~10x slower and timed out behind nginx, so they use a semi-join on the
# unnested lists. event_id repeats across files, hence the per-row id, which is only built when needed.
EVENT_AREA_JOIN_MIN_CELLS = 300


def events_in_area(source_sql: str, where: str, cells) -> tuple[str, list]:
    """SQL for a relation `e` of event rows (all columns) matching `where` and touching `cells` (None = anywhere).
    Returns (sql, params-after-the-source-params) to use as `WITH e AS (<sql>) SELECT ... FROM e`."""
    if cells is None:
        return f"SELECT * FROM {source_sql} WHERE {where}", []
    cells = list(cells)
    if len(cells) <= EVENT_AREA_JOIN_MIN_CELLS:
        return f"SELECT * FROM {source_sql} WHERE {where} AND list_has_any(cells, ?)", [cells]
    # one materialized scan, so the per-row id is the same in both references
    return (f"""WITH t AS MATERIALIZED (SELECT *, row_number() OVER () AS rid FROM {source_sql} WHERE {where})
               SELECT * EXCLUDE (rid) FROM t
               WHERE rid IN (SELECT DISTINCT rid FROM (SELECT rid, unnest(cells) AS c FROM t) x
                             JOIN (SELECT unnest(?::VARCHAR[]) AS c) a USING (c))""", [cells])
