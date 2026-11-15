# Firely: project details

**NASA Space Apps Challenge 2026 · Challenge "Harmonization of MODIS and VIIRS Hot Spots" · Saltillo, Coahuila, Mexico**

> Firely rescues 25 years of fire history that would be lost when MODIS retires, and turns it into information any firefighter can understand.

---

## 1. The problem

Two families of NASA satellites detect active fires from space:

| Sensor | Satellites | Since | Pixel | Overpass time |
|---|---|---|---|---|
| MODIS | Terra (morning) and Aqua (afternoon) | Terra 2000, Aqua July 2002 | ~1 km | 10:30 and 13:30 |
| VIIRS | Suomi-NPP, NOAA-20, NOAA-21 | S-NPP 2012, NOAA-20 2018, NOAA-21 2023 | 375 m | 13:30 (same as Aqua) |

With its finer pixel, VIIRS finds many small fires that MODIS misses: in 2013 it counts 2.6 to 3.8 times as many points as MODIS. Joining the two records as they are creates a **false jump in 2012**: fire seems to triple, when the only thing that changed was the sensor. VIIRS adds two more jumps in 2018 and 2023, when NOAA-20 and NOAA-21 come online.

MODIS is about to retire. Without a correction, the eleven years from 2001 to 2011 can no longer be compared with the present, and neither can any measurement of trends, earlier fire seasons or extreme years.

---

## 2. What does it do and how does it work?

Firely has three layers:

1. **A scientific pipeline** that turns NASA FIRMS hotspots into a harmonized monthly series per hexagonal cell, validates it and writes Parquet tables.
2. **An analysis backend** (API) that answers questions about any area: what happened, whether it is normal, what may come next and where to act.
3. **Several channels** on the same core: web app, Android app, Gotita (AI assistant), Telegram bot, MCP server, open API, embeddable widget, and GIS and emergency standards.

### 2.1 Ingestion and cleaning (`pipeline/ingest.py`)

- Reads the FIRMS yearly ZIPs and custom requests **without fully unpacking them**: it processes one country and one year at a time with DuckDB, so tens of GB never sit in memory.
- Normalizes FIRMS satellite names (`T`, `A`, `N`, `J1`/`N20`, `J2`/`N21`) to Terra, Aqua, SNPP, NOAA20 and NOAA21.
- **Filters** with these rules:
  - vegetation detections only (`type = 0`), which drops volcanoes, fixed industrial sources and offshore detections;
  - drops invalid coordinates, unreadable dates and files whose satellite does not match the expected one;
  - drops low-confidence detections: confidence below 30 on the 0–100 scale for MODIS, class `l` for VIIRS.
- **Maps confidence** to three levels (low, nominal, high). MODIS uses a 0–100 scale and VIIRS the classes `l`/`n`/`h`.
- **Removes duplicates** by (satellite, timestamp, latitude, longitude). This removes the same detection when it appears in both a yearly summary and a custom request, with priority by source.
- **Computes the local date** of each detection from the time zone of its coordinates, not from UTC time. This is essential for the day-of-week analysis and to avoid splitting a night fire across two days.
- Writes one Parquet table per country and year, with a stable identifier (hash), sensor, satellite, confidence, FRP (fire radiative power in MW) and a day/night flag.

### 2.2 H3 hexagonal grid (`pipeline/h3_cells.py`)

- Each detection gets its **H3 resolution 6** cell (about 36 km²), the main unit, and its **resolution 7** cell for local detail.
- Hexagons are used because every cell has the same size and the same six equidistant neighbours. That makes "neighbourhood" usable in both the harmonization and the outlook.
- A dense cell × month table is built from 2001 to today, **with explicit zeros**. A month without fire is data, not a gap.

### 2.3 Land cover (`pipeline/landcover.py`)

- Each cell gets its dominant IGBP class from MODIS MCD12Q1 v061 (`LC_Type1`). Thirteen sample points are taken per hexagon (the centre and two rings toward the vertices), and the mode of the valid pixels is used.
- The 17 IGBP classes are grouped into 5 biomes:

| Biome | IGBP classes |
|---|---|
| forest | 1–5 |
| shrubland | 6–7 |
| grassland or savanna | 8–10 |
| cropland | 12 and 14 |
| other | 11, 13 and 15–17 |

### 2.4 The harmonization (`pipeline/harmonize.py`, methodology `1.2.0-hybrid-biome`)

**Reference unit: "one VIIRS Suomi-NPP".** The whole series is expressed as what a single S-NPP satellite would have detected. That is why the series does not jump in 2018 or 2023: NOAA-20 and NOAA-21 are not added on top of S-NPP.

**What is used in each period:**

| Period | What is used | Flag |
|---|---|---|
| 2001-01 to 2002-07 | Estimated from **Terra only** (Aqua did not exist yet), with its own calibrated model | `is_estimated = true` |
| 2002-08 to 2012-01 | Estimated from **Terra + Aqua** | `is_estimated = true` |
| 2012-02 to 2026-07 | **Observed VIIRS S-NPP**, uncorrected: it is the reference | observed |
| Final months without VIIRS (FIRMS publishes MODIS before VIIRS) | Estimated from MODIS with the same model | `is_estimated = true` |
| After S-NPP shut down (November 2, 2026) | NOAA-20 multiplied by its ratio to S-NPP, measured in 2018–2025 | observed, scaled |

**The estimator, step by step.** The relationship between MODIS and S-NPP is learned in the years when both observed at the same time, then applied to the MODIS-only years. Every calculation is done by **cell group `c`** and **calendar month `m`**: a March is calibrated with Marches, because the relationship changes with the season.

1. **Calibration ratios.** For each group `c` and month `m`, over the calibration years:
   - `r_tot(c, m)` = Σ S-NPP detections ÷ Σ MODIS detections (all cells in the group).
   - `r_pos(c, m)` = Σ S-NPP ÷ Σ MODIS, only in cells where MODIS did detect something.
   - `fpd(c, m)` = mean S-NPP FRP per detection.

2. **Regional monthly total.** The harmonized total for month `t` is the sum, over groups, of the group's ratio times the group's MODIS activity:

   `T(t) = Σ_c r_tot(c, m) × MODIS_c(t)`

   The total is computed per group because the ratio changes from one fire type to another: small agricultural fires are the ones MODIS "misses" the most.

3. **Allocation to cells, in two parts:**
   - **Cells with MODIS detections:** `e0 = MODIS_cell × r_pos(c, m)`.
   - **Cells without MODIS detections.** VIIRS often sees small fires where MODIS saw nothing, so these cells also get a share: `e0 = z(c, m, neighbourhood) × MODIS_c(t) / n_cells_c`.
     - `z` measures how much S-NPP appears, in the calibration years, in cells with zero MODIS, relative to regional activity.
     - It is computed per **neighbourhood class**: the sum of MODIS detections in the 6 neighbouring hexagons, binned as 0, 1–2, 3–6 and more than 6.
     - So a cell with no detection but surrounded by fire gets more than an isolated cell.

4. **Rescaling.** The cell estimates are rescaled so that they add up exactly to the regional total `T(t)`:

   `cell_estimate = e0 × T(t) / Σ e0`

5. **Harmonized FRP.** `FRP = cell_estimate × fpd(c, m)`: the harmonized count times the typical S-NPP FRP per detection for that group and month. So two metrics are harmonized: **count and energy**.

6. **Uncertainty band.** The 90th percentile of the annual validation error is used as a relative band, in the columns `count_harm_lo` and `count_harm_hi`.

**How cell groups are formed.** Each country tests four configurations and keeps the one with the lowest validation error:

| Configuration | Groups |
|---|---|
| plain | A single group per country (monthly factor), no neighbourhood |
| fire regimes + neighbourhood | 5 regimes computed **from MODIS only** (see below) |
| IGBP biome + neighbourhood | The 5 MCD12Q1 biomes |
| biome × regime + neighbourhood | The product of both |

**Fire regimes** come from k-means (k = 5) on the behaviour of each cell with at least 20 MODIS detections. The standardized variables are:
- mean FRP (log);
- night fraction;
- share of detections in spring, winter and summer;
- total activity (log).

Cells with fewer than 20 detections form class 0. Regimes are computed from MODIS only, so they use no VIIRS information (no target leakage) and are equally valid before 2012.

**Why Terra + Aqua and not Aqua alone.** Aqua passes at the same time as S-NPP and looks like the best predictor, but we tested it with the same leave-one-year-out validation: using both satellites combined gives lower error in all six countries (Mexico 2.84% vs 4.70%; Argentina 3.40% vs 4.46%).

**Orbit drift.** Since around 2020, Terra and then Aqua have been drifting from their original overpass times. The yearly VIIRS/MODIS ratio was tested with Mann-Kendall and Sen's slope. As a result:
- the 2001–2011 estimates are calibrated **only on the stable-orbit years (2012-02 to 2021-12)**;
- the final months of 2026, which fall in the drift period, are calibrated on all years.

### 2.5 Validating the harmonization

**Leave-one-year-out validation (2012–2025).** A whole year is hidden, the model is calibrated on the others, what VIIRS saw that year is estimated from MODIS and compared with what VIIRS actually saw. This is repeated for every year. The **baseline** is the naive correction: multiplying MODIS by a fixed factor (the mean VIIRS/MODIS ratio).

| Country | Chosen model | Method's annual error | Baseline annual error | Improvement | Band (p90) |
|---|---|---|---|---|---|
| Mexico | regimes + neighbourhood | 2.82% | 4.14% | **32% lower** | ±6.3% |
| Argentina | IGBP biome + neighbourhood | 4.10% | 5.87% | **30% lower** | ±8.6% |
| Paraguay | regimes + neighbourhood | 2.43% | 3.58% | **32% lower** | ±4.3% |
| Uruguay | regimes + neighbourhood | 6.15% | 16.82% | **63% lower** | ±15.9% |
| Bolivia | regimes + neighbourhood | 6.17% | 7.13% | **13% lower** | ±10.7% |
| Chile | regimes + neighbourhood | 9.49% | 9.79% | **3% lower** | ±17.4% |

In addition:
- **Peak month.** In Mexico the exact peak month is right in 93% of the years, and within one month in 100%.
- **Month order.** The Spearman correlation between estimated and observed months is 0.992.
- **Terra only (2001 to July 2002).** The annual error in Mexico is 2.45% against 3.62% for the baseline.

**Backward validation.** The years 2001–2011 predate VIIRS, so they cannot be compared with it. The closest test is to calibrate on recent years (2018–2025) and predict the earlier ones (2012–2017), the same direction in time as the real estimates.
- Mexico: 2.28% error against 4.75% for the baseline.
- Argentina: 4.68% against 7.21%.

**Independent validations** (they do not use the calibration data):

1. **Did the 2012 jump disappear?** We fit `log(annual total) = a + b·year + d·[year ≥ 2012]` over 2003–2025, with the raw joined series and with the harmonized one.

   | Country | Jump in the raw series | Jump in the harmonized series |
   |---|---|---|
   | Mexico | +218% (p < 0.001) | −20% (p = 0.28, not significant) |
   | Argentina | +121% (p = 0.003) | −29% (p = 0.16) |
   | Chile | +209% | −2% |
   | Paraguay | +201% | −4% |
   | Uruguay | +127% | −23% |

   A residual break remains in Bolivia, which is why its series is flagged as low reliability.

2. **CONAFOR (Mexico).** Fires reported on the ground do not depend on any satellite. With 25 years of official totals (11 of them before 2012):

   | Test | Harmonized series | Raw series |
   |---|---|---|
   | Correlation with the **number of reported fires** | 0.80 | −0.00 |
   | Median Spearman by state (30 states) | 0.52 | 0.18 |

   87% of the states correlate better with the harmonized series. For burned area the result is more mixed, and we report it as it is.

3. **Comparison with a second, independent model** (a country-level analysis with an Aqua predictor). The 2001–2011 totals correlate at 0.994 in Mexico and 0.993 in Argentina, with a median ratio close to 1.

**Reliability per country.** Each country gets a label computed from its own validations:
- **high:** at least 20% improvement, the backward validation also beats the baseline, and there is no significant drift;
- **medium:** improves in both validations and the band is ±15% or less;
- **low:** any other case.

Mexico, Argentina and Paraguay are rated high; Uruguay, Chile and Bolivia low, with the reasons written out. **Low-reliability data are not hidden: they are shown flagged.**

**Everything is reproducible.** No figure in this section is written by hand. The pipeline generates them in `harmonization_summary.json`, and the methodology document and the app's "How we harmonize" page are regenerated from it.

### 2.6 Fire events (`pipeline/events.py`)

A large fire produces hundreds of hotspots. To compare **fires** and not just points, detections are grouped into events:

1. **One sensor per period.** From 2012, VIIRS only; before 2012, MODIS only, with those events flagged as estimated.
2. **Cross-satellite deduplication.** The same pixel, on the same local date and with the same day/night flag, collapses into one point, with a satellite preference (S-NPP > NOAA-20 > NOAA-21; Aqua > Terra).
3. **Space-time graph.** Nodes are (H3 r8 cell, local date) pairs. Two nodes are linked if they are within about 1.6 km (VIIRS) or 3.3 km (MODIS) and a few days apart. Connected components are found with vectorized union-find in NumPy.
4. **Year boundary.** 15 days of the neighbouring year are included so a fire that crosses December and January is not split in two.
5. **Attributes per event:** start, end, duration, number of points, total FRP, convex hull, approximate pixel area (not burned area) and FRP rank within the country.

### 2.7 Analyses (`pipeline/analysis.py` and API routes)

| Analysis | How it is computed |
|---|---|
| **Calendar** (years × months) | Sum of `count_harm` over the area's cells. Estimated years are shown hatched, with their band. |
| **Fire season** | Dates when 10%, 50% and 90% of the annual total have accumulated (start, peak, end). Trend with Sen's slope and the Mann-Kendall test. The conclusion uses **only years observed by VIIRS**: if a trend appears only when the estimated years are mixed in, the app warns that it could be an artifact of the method. |
| **Analog years** | The current year's cumulative curve up to today is compared with each earlier year (RMSE normalized by the median annual total). A penalty applies if the El Niño/La Niña phase (ONI) differs. The 3 closest years are kept and the range of how they ended is reported. It is a reference, not a forecast. |
| **Return period** | Empirical rank of the month against the same month in the other complete years, turned into "once every N years" (capped at 50). |
| **Day of the week** | Start day of VIIRS **events** with at least 3 points, in local date, with a chi-square test against a uniform distribution. Events are used instead of points because points from the same fire are not independent and would inflate significance. An excess of starts on certain days is the signature of human burning. |
| **Night fire** | Yearly share of night VIIRS detections, a sign of persistent fires. |
| **Fire regimes** | Map of the regimes per cell and where they changed. |
| **El Niño / La Niña** | NOAA's ONI index next to each year of the calendar. |
| **Weather context** | NASA POWER: precipitation, temperature, humidity and wind anomalies next to the fire anomaly, for example "the driest March since…". |
| **Detected vs reported** | The harmonized series against CONAFOR, by state. It reveals fire that is not being reported. |
| **Comparison** | Two areas or two periods on the same scale. |

### 2.8 Early warning and decision support

- **Prevention priority index (0–100)**, per area and per cell. It is a weighted average, with weights adjustable in the app, of five components:

  | Component | Default weight | What it measures |
  |---|---|---|
  | Anomaly | 0.35 | Percentile of the latest month against the same month in other years |
  | Recurrence | 0.25 | Years with fire in the previous 15 years |
  | Exposure | 0.25 | Population of the localities within about 10 km, on a log scale |
  | Season | 0.15 | Whether the month is among the three with the highest historical median |
  | Fire weather | 0.15 | Percentile of the NASA GFWED FWI, where data exist |

  The result is classified as low (< 30), medium (< 55), high (< 75) and extreme. Each component shows its explanation. **It is an aid for prioritizing, not a probability of fire.**

- **Fire-weather danger for the next 8 days.** It uses the NASA GFWED GEOS-5 forecast:
  - the API downloads **only the rows of the global NetCDF that cross the area**, with HTTP Range requests, instead of 16 MB files;
  - it compares the forecast FWI with the 1981–2010 climatology;
  - if NASA does not respond, it serves the last stored run, flagged as stale.

- **1–3 month outlook** per cell (`pipeline/forecast_*`):
  - **Model:** LightGBM on `log1p(harmonized count)`, one model per horizon, trained on six countries at once.
  - **Features:**
    - **history:** lags of the count, FRP, activity in neighbouring cells and the same month one year earlier;
    - **NASA POWER climate:** 1, 3, 6 and 12-month precipitation, temperature, humidity, wind, soil moisture and vapour pressure deficit;
    - **El Niño/La Niña:** the ONI index;
    - **cell context:** nearby population, protected area, biome, coordinates and expanding climatologies.
  - **No information leakage:** climatologies used as features only see earlier years, and every feature reads months ≤ t (checked with asserts). Months estimated from MODIS are never training targets.
  - **Split:** training 2012–2021, validation 2022, **test 2023–2025, untouched until the end**.
  - **Test results at one month:** it beats climatology by 15.7% and persistence by 35.3% (skill on MSE). In active cells: 18.1% and 40.7%.
  - **Probabilities:** it gives a 10% to 90% interval and the probability of ending below, near or above normal (terciles).
  - **Golden rule:** if, for a country and horizon, the model did not beat climatology in the test, the app says so and shows the climatology.

- **Spread cone** from Open-Meteo wind, and **downwind localities**.
- **One-page situation sheet**, ready to print, with the calendar in colour, the traffic light and the latest month against its historical median.
- **Drills:** staged scenarios (detection → exposure → evolution → outcome) built from a real fire in the area.

### 2.9 Gotita, the AI assistant (`ai/`)

Gotita uses **Claude Haiku** (Anthropic API) with structured outputs, and is designed not to make anything up:

1. **Understanding the question** (`ai/intent.py`).
   - The model only extracts the place *name* and the time period; it never generates coordinates.
   - The place is resolved against a **local gazetteer** built from INEGI, GeoNames and geoBoundaries.
   - If there is no API key or the call fails, a rule-based extractor in Spanish, English and Portuguese takes over.
2. **Choosing the mode** (`ai/assistant.py`).
   - If the question needs new data, it goes back as a data query and the app queries the harmonized series. So "and in March?" becomes "Arteaga, Coahuila in March".
   - If it is a follow-up question (what a figure means, what to do), it answers in the voice of the chosen profile.
3. **Anti-hallucination rule.** In its answers, the model **may only repeat numbers that are already in the context** the app sends it. Every figure can be traced back to its query.
4. **Profiles.** A firefighter, an official or a scientist get the same data explained at their level. The app is available in Spanish, English and Portuguese.
5. **Safety.** Advice is general and always points to the authorities.
6. **Voice.** Edge neural voices with Piper as a local fallback. Every synthesized sentence is cached.

Other AI features:
- **Extraction of official reports** (`ai/reports.py`). It turns a PDF or a messy table into validated records. The document is treated as **data**, not instructions: any orders inside it are ignored, every record is re-validated, and anything not in the document stays empty and flagged for review.
- **Watch agent.** An automatic weekly bulletin for each subscribed area.

### 2.10 Channels

| Channel | What it offers |
|---|---|
| **Web app** (React) | 3D map with terrain and the Blue Marble basemap, detections shown as flames, area drawing, calendar, analysis, risk and context tabs, "How we harmonize" page, printable sheet, platform for professionals |
| **Android app** (Capacitor 8) | The same frontend compiled as a native app: satellite map, calendar, field mode and chat with Gotita |
| **Telegram bot** | Free text, shared location, voice notes (optional local transcription with faster-whisper), `/semaforo`, `/hoy`, `/pronostico` and spoken answers |
| **Subscription alerts** | A daily job evaluates each area with the real index. It only sends subscriptions **approved by an operator**, once per period, with messages marked EXERCISE/TEST |
| **CAP** (Common Alerting Protocol) | Drafts are created, reviewed and approved in the app. The Atom feed only publishes those **approved as exercises**, never with status `Actual` |
| **Open API** | REST documented with OpenAPI. Every response includes `methodology_version`, `data_cutoff`, the uncertainty and attribution to NASA FIRMS |
| **GIS** | OGC API Features (QGIS, ArcGIS) and CSV, GeoJSON and KML export |
| **Widget** | The calendar of any area, embeddable in another site |
| **SQL for scientists** | Read-only queries with CSV download |
| **MCP server** | 20 tools so any AI assistant can query the fire history |

The 20 MCP server tools are:
- **Area and calendar:** `resolve_area`, `calendar`.
- **Series analysis:** `season`, `analogs`, `return_period`, `weekday`, `night`, `regimes`.
- **Risk and outlook:** `risk`, `outlook`, `spread`, `wind_localities`.
- **Events and recent data:** `events`, `recent_hotspots`, `reported`.
- **Context:** `context`, `weather`.
- **Operations:** `bulletin`, `drill_scenario`, `watch`.

### 2.11 Near-real-time data

- A daily job downloads the FIRMS NRT detections of the last 48 h and stores them separately from the scientific archive.
- NRT data have no `type` column, so non-vegetation sources are filtered with a **fixed-source mask** (H3 r7) built from the archive.
- **The scientific harmonized series is never overwritten with provisional estimates.**

### 2.12 Architecture and deployment

- **Containers:** Docker Compose with five services: the API (FastAPI), nginx (which serves the web app), the MCP server, the Telegram bot and a scheduler.
- **Scheduler tasks:** NRT update at 06:10, alerts at 06:30 and the bulletin on Mondays at 07:00.
- **Server:** one AWS EC2 instance.
- **Data:** Parquet tables partitioned by country and year, queried with **DuckDB** straight from the files, with no database server.
- **Map:** layers are requested from the browser (NASA GIBS and Terrarium terrain).
- **Secrets:** only in environment variables, never in the code or the logs.
- **Network:** every download from NASA servers forces IPv4, because they hung over IPv6 on our network.

---

## 3. What benefits does it offer?

- **One comparable 25-year series.** It allows real trends to be measured without the 2012 artifact, and it survives the retirement of MODIS.
- **Honest uncertainty.** Every estimated year has its band and every country its reliability level. Users know how much to trust it.
- **From data to decisions.** It goes from "there were 300 hotspots" to "this season is running above normal, it looks like 2021, next month will probably stay high, and these are the priority cells".
- **Accessible to people in the field.** Firefighters, civil protection and local authorities use it without knowing anything about satellites: from a phone, through Telegram or on a printed sheet.
- **Useful for science.** Harmonized, versioned data with a cutoff date, with the methodology and validation published, ready for other models.
- **Interoperable.** It speaks emergency standards (CAP) and GIS standards (OGC, KML), and connects to AI assistants (MCP).
- **Low cost.** It uses free public data, open software and a single cloud instance.

## 4. What is the intended impact?

- **Better-targeted prevention.** Crews and resources assigned based on the real fire history, the outlook and the population at risk, not only on intuition.
- **Fire memory beyond MODIS.** An open method that preserves 2001–2011 and extends to other countries and sensors. The pipeline is global; six countries are processed today: Mexico, Argentina, Bolivia, Chile, Paraguay and Uruguay.
- **Evidence for public policy.** Knowing whether the season is starting earlier, which years were exceptional and where fire is going unreported.
- **Responsible early warning.** There is always a human in the loop before anything is communicated to the public.
- **Pilot cases:**
  - Sierra de Arteaga, Coahuila, the demo region in Saltillo;
  - Chilecito, La Rioja (Argentina), site of the July 2026 fire mentioned by the challenge author.

## 5. Tools, programming languages, hardware and software

| Area | Technology |
|---|---|
| Fire data | NASA FIRMS: MODIS C6.1 (Terra, Aqua), VIIRS S-NPP, NOAA-20, NOAA-21; standard archive and near real time |
| Other NASA data | MCD12Q1 (land cover), MYD08_M3 (clouds), GFWED (Fire Weather Index, historical and GEOS-5 forecast), POWER (climate), GIBS/Blue Marble (basemap), SRTM (elevation) |
| Other data | INEGI (geostatistical framework, 2020 census), CONANP, CONAFOR, geoBoundaries, GeoNames, WDPA, NOAA ONI, Open-Meteo |
| Languages | Python, TypeScript, SQL, HTML/CSS |
| Pipeline and science | Python 3.12, DuckDB, Parquet (ZSTD), H3, NumPy, pandas, xarray, netCDF4, GeoPandas, Shapely, rasterio, pyproj, scikit-learn (k-means), SciPy, LightGBM |
| Backend | FastAPI, OpenAPI, OGC API Features, CAP 1.2, Atom |
| Web frontend | React 19, TypeScript, Vite, MapLibre GL (3D terrain), Terra Draw, Recharts, h3-js, Astryx design system with StyleX |
| Mobile app | Capacitor 8 (Android), built from the same web code |
| AI | Claude Haiku (Anthropic API) with structured outputs; Model Context Protocol (MCP); Edge TTS and Piper (voice); optional faster-whisper (local transcription) |
| Messaging | Telegram Bot API |
| Infrastructure | Docker, Docker Compose, nginx, AWS EC2, Cloudflare, cron |
| Testing | pytest (157 tests) and Vitest |
| Presentation material | HyperFrames (video from HTML) and ElevenLabs (voice and sound effects) |
| Hardware | Laptops running Arch Linux, an Android phone for testing and an AWS EC2 instance |

## 6. How is the project creative?

- **It makes the harmonization visible.** Instead of hiding the correction, the app shows the 2012 "false jump" and how it disappears, with the validation published inside the tool itself.
- **It calibrates by fire regime, not with a global factor.** Each kind of landscape is corrected according to its own behaviour, and regimes are learned from MODIS only so they remain valid before 2012.
- **It uses the hexagonal neighbourhood** to estimate fire where MODIS saw nothing but VIIRS probably would have.
- **It is validated against reality on the ground.** CONAFOR reports, independent of any satellite, confirm that the harmonized series tracks real fires (0.80 against −0.00 for the raw series).
- **The calendar as a way to read fire.** Years × months turns 25 years into one image that can be understood at a glance.
- **Uncommon analyses** for a fire tool: analog years, return periods, the human "signature" in the day of the week, and night fire.
- **Trustworthy AI by design.** Gotita has a personality, but she cannot make up numbers.
- **One core, many doors.** The same tools serve the web, the Android app, Telegram, the API and any assistant through MCP.

## 7. What factors did the team consider?

- **Scientific rigour:**
  - validation against a naive baseline;
  - independent validations (2012 break, CONAFOR, a second model);
  - visible uncertainty and reliability per country;
  - methodology version and cutoff date in every output;
  - no figure written by hand.
- **Avoiding information leakage in the outlook:** a strict time split, expanding climatologies and a test period left untouched until the end.
- **Responsible use of AI:**
  - the model does not generate figures or coordinates;
  - external documents are treated as data, not instructions;
  - alerts require human approval and are marked as exercises.
- **Real users:**
  - firefighters with poor signal and busy hands (Telegram, voice notes, mobile app);
  - decision makers who need a printed sheet;
  - scientists who need data and SQL.
- **Accessibility:** colour-blind-safe colour ramps, Spanish, English and Portuguese, spoken answers, and text that stays readable when printed.
- **Attribution:** NASA FIRMS is credited in the app, the API, the widget and the downloads.
- **Cost and openness:** free data, open software and small infrastructure that an institution can replicate.
- **Privacy and security:** secrets kept out of the code, masked Telegram identifiers and logs without message text.
- **Hackathon time (48 h):**
  - the essentials first, end to end (harmonization, calendar and the 2012 chart);
  - anything unfinished was hidden instead of being shown broken.
- **Stated limits:**
  - 2001–2011 cannot be validated directly against VIIRS;
  - biomes come from a single year;
  - a hotspot is not burned area;
  - Chile, Uruguay and Bolivia have low reliability;
  - the "virtual VIIRS" super-resolution and the GOES geostationary layer remain future work.
