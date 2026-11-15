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
