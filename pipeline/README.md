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

## Derived tables and daily updates

After `cell_month_harmonized`, `hotspots`, and `events` have been built, run:

```bash
.venv/bin/python -m pipeline.derived_tables
.venv/bin/python -m pipeline.animation_frames
```

These commands materialize `cell_day`, `cell_stats`, `climatology`, and
`animation_r4` under `FIRELY_DATA_PROCESSED` (default `data/processed`). The
current six-country build occupies approximately 75 MB, 3.4 MB, 29 MB, and
4.7 MB respectively. Rebuild with `--force` after scientific archive updates.

`cell_day` allocates a calibrated cell/month count over dates with observed
hotspots. In early MODIS years, the model may estimate a positive monthly
count in a cell with no observed hotspot on any date. No day is invented for
that estimate, so `sum(cell_day.count_harm)` can be smaller than
`cell_month_harmonized.count_harm`. Use the monthly table for period totals.

The scheduler runs `python -m pipeline.daily_update` with `FIRMS_MAP_KEY`.
It ingests NRT for Mexico and Argentina, the two countries with verified static
source masks and country cell membership. Provisional rows are written to
`nrt`, `cell_day_nrt`, `cell_month_nrt`, and `events_nrt`, each derivative
labelled `source=NRT`. Scientific SP tables remain unchanged. When newer SP
hotspots cover an NRT date, the next run removes that date from NRT derivatives
while keeping the raw NRT audit file. The API shows post-SP NRT months/days
and events with `is_provisional=true`.
