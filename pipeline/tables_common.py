"""Small helpers shared by the derived-table scripts (climatology, cell_stats, cell_day, animation, cloud correction).

Every script reads `--processed` (default $FIRELY_DATA_PROCESSED or data/processed), writes inside it, skips outputs
that already exist unless `--force` is given, and replaces files atomically (write to .tmp, then rename).
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

import duckdb


def q(path) -> str:
    """SQL string literal for a server-built path (never user input)."""
    return "'" + str(path).replace("'", "''") + "'"


def processed_default() -> Path:
    return Path(os.environ.get("FIRELY_DATA_PROCESSED", "data/processed"))


def countries(processed: Path, table: str = "cell_month_harmonized") -> list[str]:
    root = processed / table
    return sorted(p.name for p in root.iterdir() if p.is_dir() and any(p.glob("year=*/*.parquet"))) if root.is_dir() else []


def parser(description: str) -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=description, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--processed", type=Path, default=processed_default(),
                   help="processed tables root (default: $FIRELY_DATA_PROCESSED or data/processed)")
    p.add_argument("--country", nargs="+", default=None, help="countries (default: every country already harmonized)")
    p.add_argument("--force", action="store_true", help="rebuild outputs that already exist")
    p.add_argument("--memory-limit", default="2GB")
    return p


def connect(memory_limit: str = "2GB", processed: Path | None = None) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(":memory:")
    con.execute(f"SET memory_limit='{memory_limit}'")
    if processed is not None:
        tmp = processed / ".duckdb_tmp"
        tmp.mkdir(parents=True, exist_ok=True)
        con.execute(f"SET temp_directory={q(tmp)}")
    return con


def copy_atomic(con, select_sql: str, dest: Path, params=None) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".tmp")
    con.execute(f"COPY ({select_sql}) TO {q(tmp)} (FORMAT PARQUET, COMPRESSION ZSTD)", params or [])
    tmp.replace(dest)


def harmonized_glob(processed: Path, country: str) -> str:
    return str(processed / "cell_month_harmonized" / country / "year=*" / "*.parquet")


def last_full_year(con, glob: str) -> int | None:
    """Last year with all 12 months present (same rule as /calendar: incomplete years are not reference years)."""
    row = con.execute(f"""SELECT max(year) FROM (SELECT year FROM read_parquet({q(glob)}, hive_partitioning=true)
                          GROUP BY year HAVING count(DISTINCT month) = 12)""").fetchone()
    return row[0]
