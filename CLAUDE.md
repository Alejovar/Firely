# Firely — contexto para Claude Code

Proyecto para **NASA Space Apps Challenge 2026**, reto **"Harmonization of MODIS and VIIRS Hot Spots"** (autora: Marina Compagnucci, CONAE). Evento local presencial en Saltillo, Coahuila. Hackathon de 48 h.

**Firely** armoniza los puntos de calor de MODIS (2000–hoy) y VIIRS (2012–hoy) en una sola serie comparable y la muestra como un **calendario de actividad de quemas** (años × meses) para cualquier área, con análisis para alerta temprana y una API abierta.

> Frase del proyecto: "Firely rescata 20 años de historia de fuego que se perderían con el retiro de MODIS, y la convierte en alertas que cualquier brigadista entiende."

## Documentos de referencia (leer antes de diseñar algo)

- `docs/firely-descripcion.md` — QUÉ es cada función y CÓMO funciona: metodología de armonización (§5), esquemas de tablas (§6), app (§7), módulos de análisis (§8), salidas (§9), alertas (§10), capa de IA (§11), API/widget/MCP (§12), arquitectura y stack (§13).
- `docs/firely-plan.md` — QUÉ se construye primero: niveles 0–3, criterios de "terminado", orden de recorte, guion de demo.
- `docs/reto/` — descripción oficial del reto y transcripción del video de la autora.

Las referencias tipo "§8.2" apuntan a secciones de `firely-descripcion.md`.

## Prioridades (no negociables)

1. **Nivel 0 primero, siempre.** Armonización + tablas Parquet + calendario + CSV + gráfica del "salto falso" de 2012. Nada de Nivel 1–2 antes de que el Nivel 0 funcione de punta a punta.
2. **Funcionando > completo.** Una función a medias se oculta, no se muestra rota.
3. Antes de construir una función, revisar su criterio de "terminado" en `docs/firely-plan.md` §2.

## Principios de diseño

- Las cifras salen **siempre** de la serie armonizada. El LLM nunca calcula ni inventa números ni coordenadas; solo interpreta, consulta y redacta.
- La incertidumbre se muestra (años estimados 2000–2011, celdas nubladas, bandas de error).
- Atribución a **NASA FIRMS** en app, API, widget y descargas.
- Cada salida lleva `methodology_version` y fecha de corte de datos.
- Nada se publica hacia la población sin aprobación humana. Alertas CAP de la demo con `status` de prueba (`Exercise`/`Test`), nunca `Actual`.

## Entorno de desarrollo

- **SO:** Arch Linux, shell **fish**. Los comandos que propongas deben funcionar en fish (variables con `set -x VAR valor`, no `export VAR=valor`; venv con `source .venv/bin/activate.fish`; sin `&&` en scripts complejos, usar `; and`).
- **Python del sistema: 3.14.** `pip install` global está bloqueado (externally-managed). Usar siempre un venv. Si algún paquete no tiene wheel para 3.14 (revisar `h3`, `pyogrio`, `lightgbm`, `duckdb`), usar `uv` con Python 3.12:
  `uv venv --python 3.12; source .venv/bin/activate.fish; uv pip install -r requirements.txt`
- **Red: los servidores de NASA se cuelgan por IPv6** en esta red (las conexiones se quedan en `SYN-SENT`). Todo código que descargue de NASA (FIRMS API, NCCS/GFWED, Earthdata, POWER) debe **forzar IPv4**:
  ```python
  import socket, urllib3.util.connection as urllib3_cn
  urllib3_cn.allowed_gai_family = lambda: socket.AF_INET
  ```
  Con `wget` usar `-4`; con `curl` usar `-4`.
- **Secretos** en `.env` (nunca en el código ni en git): `FIRMS_MAP_KEY`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, credenciales de nube, usuario de Earthdata. El autor hace live coding: nunca imprimir secretos en consola ni en logs.

## Estructura del repositorio

```
firely/
├── CLAUDE.md
├── docs/                 # firely-descripcion.md, firely-plan.md, reto/
├── data/
│   ├── raw/              # datos descargados, SOLO LECTURA, fuera de git
│   ├── interim/          # CSV/Parquet limpios por fuente, fuera de git
│   └── processed/        # tablas finales Parquet (§6), fuera de git
├── pipeline/             # ingesta, limpieza, armonización, eventos, estadísticas
├── notebooks/            # exploración y validación reproducible
├── api/                  # FastAPI, OGC, CAP, herramientas compartidas
├── mcp/                  # servidor MCP
├── ai/                   # prompts, esquemas JSON, agentes
├── bot/                  # bot de Telegram
├── web/                  # frontend, PWA, widget
├── infra/                # Dockerfiles, CI/CD
└── tests/
```

Reglas:
- `data/raw/` nunca se modifica. Todo script lee de `raw/` y escribe en `interim/` o `processed/`.
- Los scripts reciben rutas por argumento o variable de entorno; nada de rutas absolutas hardcodeadas.
- Scripts del pipeline idempotentes: si la salida ya existe, se saltan (con opción `--force`).

## Estado del pipeline (México y Argentina, 2001–2026)

Orden de ejecución (todo en `.venv`, ver `docs/metodologia-armonizacion.md` §7):
`pipeline.ingest` → `pipeline.h3_cells` → `pipeline.landcover` → `pipeline.harmonize` → `pipeline.methodology_doc` (+ `pipeline.events`, `pipeline.star_chart`).

- Armonización v1.2 (`pipeline/harmonize.py`): referencia = **un VIIRS S-NPP**. 2012-02..2026-10 se usa S-NPP observado; 2001..2012-01 se estima desde MODIS con una razón mensual por grupo de celdas (régimen de fuego o bioma IGBP, el que menos error dé por país) y reparto a celdas con vecindad; solo-Terra antes de 2002-08; NOAA-20 escalado tras el apagado de S-NPP. Validación año-fuera 2012–2025 vs línea base de factor fijo; el error anual baja ~30% en ambos países. Las cifras viven en `data/processed/metadata/harmonization_summary.json`; **no escribir cifras a mano**, el doc y `web/public/data/harmonization.json` se generan con `pipeline.methodology_doc`.
- Tabla armonizada: `data/processed/cell_month_harmonized/<País>/year=*/` (densa: incluye ceros). `data/processed/cell_month/` es la versión cruda.
- Datos SP de FIRMS terminan en 2026-08 (`data_cutoff`); NRT no está ingerido.
- Datos externos locales: `data/external/landcover/` (MCD12Q1 2001/2010/2020) y `data/external/dem/coahuila/` (SRTM). Faltante conocido: GFWED 2020.
- Otras tablas (`data/processed/`): `events/` (clustering, §6.3; ~55% son de un solo punto: filtrar con n≥3), `geo/<País>/` (admin, localidades, ANP, `cell_geo`), `context/` (ONI, `clear_frac` y FWI de Coahuila; FWI solo en años completos: GFWED 2014/2019/2020/2021/2023 faltan o están incompletos), `reported/` (CONAFOR), `cell_class/`, `cell_biome/`.
- Análisis (`pipeline/analysis.py` + `api/app/analysis_routes.py`): temporada, años análogos, periodo de retorno, día de la semana (sobre EVENTOS, no puntos: los puntos están agrupados e inflan el chi-cuadrado) y proporción nocturna. La conclusión de tendencia usa solo años observados (VIIRS).
- Frontend: `web/` usa **Astryx** (`@astryxdesign/core`, tema 'firely' extiende neutral). Reglas en `web/AGENTS.md`: sin `<div>`/`<span>` crudos, sin CSS propio, colores de datos solo en `web/src/dataviz.ts`. Páginas: `#mapa` y `#metodo`.
- API en modo real: `api/app/main.py` monta todos los routers (extra, ai, analysis, pro, ogc, export, weather, reports, drill). Nuevos: `/weather` (NASA POWER, §8.10), `POST /reports/extract` (§11.2), `/drill` (simulacros), pesos `w_*` y componente FWI en `/risk`, feed Atom de CAP aprobados en `/alerts/cap`. Estado escribible (borradores CAP, caché POWER) en `FIRELY_STATE_DIR` (por defecto la carpeta de datos procesados). Estado detallado por nivel: `docs/firely-plan.md` §17.
- Pronóstico 1–3 meses (`pipeline/forecast_*.py`, ver `pipeline/README.md`): LightGBM log1p por horizonte, 6 países, clima NASA POWER mensual; tablas en `data/processed/forecast/`, ruta `GET /forecast`, herramienta MCP `outlook`, bot `/pronostico`, panel en la pestaña Riesgo. Reporte generado: `docs/reporte-pronostico.md`. Las climatologías que entran como variables son expansivas (años previos); una climatología fija o leave-one-out filtra el objetivo.
- Despliegue: `docker compose up --build` (API + nginx, ver `infra/README.md`); las imágenes no incluyen el pipeline de datos.
- Codex: usar `codex exec` directo (ver memoria); su sandbox no tiene red.

## Ubicación real de los datos

Los datos descargados viven en `~/Proyectos/Personales/Hackathons/spaceapps/` (fuera del repo). Los scripts leen la ruta de la variable `FIRELY_DATA_RAW` (ver `.env.example`); `data/raw/` puede ser un enlace simbólico a esa carpeta. `spaceapps/country_factors.zip` es un análisis por país ya limpio (factores k, series armonizadas por país, validación, CONAFOR); sirve de referencia/validación cruzada, no sustituye la armonización por celda H3.

Contratos congelados tras la hora 2: `data/schemas/tables.json` (tablas §6) y `api/openapi.yaml` (§12.1).

## Inventario de datos (`data/raw/`)

> Las rutas exactas pueden diferir: si una no existe, **pregúntame o búscala** antes de asumir. Antes de escribir un parser, **inspecciona** columnas, encoding y formato reales del archivo.

### Puntos de calor — NASA FIRMS (`raw/firms/`)

| Fuente | Contenido | Periodo | Formato |
|---|---|---|---|
| Resúmenes anuales MODIS | `modis_YYYY_all_countries.zip` → `modis/YYYY/modis_YYYY_<País>.csv` | 2000–2025 | CSV por país, todos los países |
| Resúmenes anuales NOAA-20 | `viirs-jpss1_YYYY_all_countries.zip` → `viirs-jpss1/YYYY/viirs-jpss1_YYYY_<País>.csv` | 2018–2025 | CSV por país |
| Solicitud personalizada S-NPP | México y Argentina | 2012-01-20 → 2025-12-31 | CSV |
| Solicitud personalizada NOAA-21 | México y Argentina | 2023-03-01 → 2025-12-31 | CSV |
| Solicitud 2026 México | MODIS, S-NPP, NOAA-20, NOAA-21 | 2026-01-01 → 2026-11-14 | CSV |
| Solicitud 2026 mundo | MODIS, S-NPP, NOAA-20, NOAA-21 | 2026-01-01 → 2026-11-14 | CSV (grande; de aquí sale Argentina 2026) |

Detalles importantes:
- **Nomenclatura FIRMS:** `jpss1`/`J1` = NOAA-20; `jpss2`/`J2` = NOAA-21; `suomi`/`snpp` = Suomi-NPP; `MODIS C6.1` = MODIS (Terra + Aqua, columna `satellite` = `T`/`A`).
- **Los resúmenes anuales por país NO incluyen S-NPP ni NOAA-21**; esos vienen de las solicitudes personalizadas.
- Cada ZIP anual trae un `AttributesReadme.txt` con la definición de columnas: **leerlo**.
- Nombres de país con guiones bajos (`Trinidad_and_Tobago`). Solo necesitamos `Mexico` y `Argentina`; extraer solo esos CSV.
- **MODIS 2000** solo tiene noviembre–diciembre (inicio de Terra). Aqua desde 2002-07. La serie útil del calendario arranca en **2001**.
- **Suomi-NPP dejó de entregar datos el 2 de noviembre de 2026.** Para lo reciente usar NOAA-20 y NOAA-21. Intercalibrar S-NPP ↔ NOAA-20 es obligatorio para la continuidad.
- Datos SP (archivo estándar) incluyen la columna `type` (0 = vegetación, 1 = volcán, 2 = fuente estática, 3 = offshore). Usar solo `type == 0`. **Los datos NRT no traen `type`**: filtrar con una máscara de fuentes estáticas construida del histórico. Verificar si los CSV de las solicitudes personalizadas traen `type`.
- MODIS: `confidence` 0–100. VIIRS: `confidence` `l`/`n`/`h`. Homologar según §5.2.
- Columnas VIIRS de brillo: `bright_ti4`, `bright_ti5`; MODIS: `brightness`, `bright_t31`.
- Duplicados posibles entre resúmenes anuales y solicitudes en años que se traslapan: deduplicar por (satélite, fecha, hora, lat, lon).

### Cobertura del suelo — MCD12Q1 v061 (`raw/landcover/`)

- AppEEARS, capa **`LC_Type1`** (clasificación IGBP, 17 clases), 500 m, anual, GeoTIFF, EPSG:4326, nombres con fecha de calendario.
- México y Argentina (rectángulos que incluyen algo de países vecinos), 2001 → último año disponible.
- Valor 255 = sin dato. Clases IGBP: 1–5 bosques, 6–7 matorral, 8–9 sabana, 10 pastizal, 11 humedal, 12 cultivo, 13 urbano, 14 mosaico cultivo/vegetación, 15 nieve, 16 suelo desnudo, 17 agua.

### Elevación — SRTMGL1 v003 (`raw/dem/`)

- AppEEARS, 30 m, GeoTIFF, EPSG:4326, solo **Coahuila** (región piloto, para superresolución §5.7).

### Fracción de nubes — MYD08_M3 v6.1 (`raw/clouds/`)

- Giovanni, variable *Cloud Fraction from Cloud Mask, Mean of Daily Mean* (día + noche), Aqua, mensual, 1°.
- 292 NetCDF, **2002-07 → 2026-10**, recortados a Coahuila (lon −104 a −99.8, lat 24.5 a 29.9).
- Nombres: `g4.subsetted.MYD08_M3_6_1_Cloud_Fraction_Mean_Mean.YYYYMMDD.104W_24N_99W_29N.nc`.
- Uso: corrección por nubes en la región piloto (§5.6).

### Peligro meteorológico de incendio — GFWED (`raw/gfwed/`)

- Producto `fwiCalcs.MERRA2/Default/MERRA2.CORRECTED`, ya recortado a Coahuila (margen de una celda).
- `gfwed_coahuila_YYYY.nc`: diario, 2017–2026 (y quizá 2012–2016). Datos hasta ~mediados de 2026 (latencia del producto).
- `gfwed_coahuila_longtermmean_1981_2010.nc`: promedio mensual de largo plazo (dimensión `month`).
- Malla 0.5° lat × 0.625° lon. Las variables vienen con prefijo de la fuente de precipitación: **inspeccionar nombres reales** (`ncdump -h` o `xarray`). La de interés es el **FWI**; también FFMC, DMC, DC, ISI, BUI.
- Pronóstico de 8 días (para riesgo próximo, se baja en vivo):
  `https://portal.nccs.nasa.gov/datashare/GlobalFWI/v2.0/fwiCalcs.GEOS-5/Default/GEOS-5/YYYY/YYYYMMDD00/FWI.GEOS-5.Daily.Default.YYYYMMDD00.yyyymmdd.nc`
- Diario histórico (por si hay que bajar más):
  `https://portal.nccs.nasa.gov/datashare/GlobalFWI/v2.0/fwiCalcs.MERRA2/Default/MERRA2.CORRECTED/YYYY/FWI.MERRA2.CORRECTED.Daily.Default.YYYYMMDD.nc`
- Script de descarga existente: `descargar_gfwed.py` (fuerza IPv4, recorta y borra globales).

### México — INEGI (`raw/inegi/`)

- **Marco Geoestadístico, Censo 2020** (shapefile). Usar solo capas de estados (`ent`), municipios (`mun`) y localidades (`l`/`lpr`). Claves `CVE_ENT`, `CVE_MUN`, `CVE_LOC`, `CVEGEO`. Proyección original: **Lambert Conformal Conic (ITRF2008)**; reproyectar a EPSG:4326.
- **ITER 2020** (Principales resultados por localidad), CSV nacional. Población total: `POBTOT`. Coordenadas en `LATITUD`/`LONGITUD` posiblemente como texto en grados-minutos-segundos: **verificar y convertir**. Encoding probablemente latin-1/cp1252. Valores censurados como `*`. Filas de totales estatales/municipales (`LOC` = 0000, 9998, 9999) que hay que excluir.

### México — otras fuentes

- **CONANP** áreas naturales protegidas 2024 (shapefile, WGS84) — `raw/conanp/`.
- **CONAFOR** incendios reportados — `raw/conafor/`:
  - Incendios 2010–2019 (SINASIC v2, EPSG:4326)
  - Incendios 2015–2020 (puntos, 41,420 registros)
  - Polígonos de incendios forestales 2021, 2022, 2023, 2024
  - Esquemas distintos entre años: inspeccionar y homologar (año, fecha, estado, municipio, superficie, tipo de vegetación, causa).

### Argentina (`raw/argentina/`)

- **geoBoundaries ARG**: ADM1 (provincias, 2006) y ADM2 (departamentos, IGN 2020). Chilecito está en La Rioja.
- **GeoNames `AR.zip`**: TSV **sin encabezado**, 19 columnas (geonameid, name, asciiname, alternatenames, latitude, longitude, feature_class, feature_code, country_code, cc2, admin1, admin2, admin3, admin4, population, elevation, dem, timezone, modification_date). Localidades: `feature_class == 'P'`.
- **WDPA / Protected Planet ARG**: shapefile, puede venir dividido en varias partes y en polígonos + puntos. Usar polígonos. Citar WDPA.

### Clima — NOAA ONI (`raw/oni/`)

- `oni.txt` (formato `SEAS YR TOTAL ANOM`). El Niño si ANOM ≥ 0.5, La Niña si ≤ −0.5 (5 trimestres consecutivos para episodio oficial).

### Se consultan por API, no se descargan

- **NASA POWER** (meteorología mensual por punto/región).
- **FIRMS API de área** con `FIRMS_MAP_KEY` (NRT 24/48 h). Límite: 1–10 días por consulta; 5,000 transacciones / 10 min.
- **Nominatim** (geocodificación, 1 consulta/s, identificarse con User-Agent).
- Pronóstico de viento (p. ej., Open-Meteo).

## Regiones de la demo

| Región | Uso | Notas |
|---|---|---|
| Sierra de Arteaga / sureste de Coahuila | Demo presencial (Saltillo), región piloto de Nivel 2 | Coahuila: lon −104 a −99.8, lat 24.5 a 29.9 |
| Chilecito, La Rioja, Argentina | Video y página para el jurado global | Incendio de julio de 2026 mencionado por la autora del reto |

## Decisiones técnicas tomadas

- Malla **H3**: resolución 6 principal, 7 para detalle local, 5 para mapas continentales.
- Tablas en **Parquet**, consultadas con **DuckDB** (servidor) y **DuckDB-WASM** (navegador).
- Armonización: pares **Aqua ↔ S-NPP** (mismo horario de paso) para calibrar; Terra aparte; intercalibración NOAA-20/21 ↔ S-NPP; **quantile mapping por bioma (IGBP agrupado) y mes**, con tratamiento de ceros en dos partes (ocurrencia + intensidad). Plan B: quantile mapping global por mes.
- Dos métricas armonizadas: **conteo** y **FRP**.
- Validación: dejando un año fuera; comparar contra línea base ingenua (factor fijo). La cifra de mejora es entregable clave.
- Backend: FastAPI. Frontend: MapLibre GL + deck.gl (capa H3), gráficas con D3/Observable Plot/ECharts, Terra Draw para dibujar áreas.
- LLM: API de Anthropic con tool use y salidas estructuradas; las mismas herramientas se exponen en API, asistente, bot y servidor MCP.

## Cómo trabajar conmigo

- Trabajo en español; código, nombres de variables y commits pueden ir en inglés.
- Antes de cambios grandes, propón el plan en pocas líneas.
- Ante un dato que no conoces (columna, ruta, formato), **inspecciona el archivo real** en vez de suponer.
- Los archivos de datos son grandes: usar polars o DuckDB en lugar de pandas para FIRMS; procesar por año; nunca cargar los 26 ZIP completos en memoria.
- Al terminar una pieza, dime cómo probarla en una línea.
- No hagas commit ni push sin que te lo pida.
