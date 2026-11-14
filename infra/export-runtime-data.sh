#!/usr/bin/env bash
# Package ONLY the processed tables the API reads at runtime (not interim data, not raw FIRMS, not the raw cell_month).
# Usage: infra/export-runtime-data.sh [source_dir=data/processed] [out_file=firely-data.tar.gz]
set -euo pipefail
SRC="${1:-data/processed}"
OUT="${2:-firely-data.tar.gz}"
TABLES=(cell_month_harmonized events geo context reported metadata cell_biome cell_class static_sources hotspots)
for t in "${TABLES[@]}"; do [ -d "$SRC/$t" ] || { echo "falta $SRC/$t" >&2; exit 1; }; done
tar --exclude='.duckdb_tmp' -C "$SRC" -czf "$OUT" "${TABLES[@]}"
echo "listo: $OUT ($(du -h "$OUT" | cut -f1))"
