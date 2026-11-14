# FIRMS Nivel 0 ingestion

Install in a virtual environment, then run:

```fish
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python -m pipeline.ingest --country Mexico --years 2001-2025
```

`--raw` / `FIRELY_DATA_RAW` defaults to `data/raw`; `--interim` /
`FIRELY_DATA_INTERIM` defaults to `data/interim`. Use `--force` to replace
existing partitions and `--modis-min-confidence` to change the default 30.

Each run prints JSON counts by year and platform/sensor before and after
cleaning, plus source issues. Main output is
`hotspots/<country>/year=<year>/part-0.parquet`; rejected low-confidence
rows with their `confidence_h='baja'` flag go to
`hotspots_low_confidence/<country>/year=<year>/part-0.parquet`.
Both are under the interim root. The untouched schema columns are null.

The archive requests with download IDs 847107–847110 were checked against
their CSV samples to identify their country. The 8468xx country requests
contain Mexico 2026. World request files are excluded because bounding boxes
would include neighboring countries. NRT members are excluded because they
lack `type` and require the historical static-source mask. Archive members
without `type`, if encountered, are retained and reported; rows in a source
that has `type` must have `type=0`.

The MODIS confidence mapping uses `baja` below the configured threshold,
`nominal` from the threshold through 79, and `alta` from 80. VIIRS maps
`l/n/h` directly. `date_local` uses the coordinate's IANA time zone, including
historical daylight-saving rules. This step does not calculate H3 cells or
harmonization weights.
