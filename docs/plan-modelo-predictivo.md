# Plan: modelo predictivo de actividad de incendios (Nivel 2, México)

> Archivo de contexto para Claude Code. Explica qué se quiere predecir, con qué datos, cómo validar sin hacer trampa y qué entregar. Léelo completo antes de escribir código. Continúa el pipeline existente (pasos 01–08) y la convención de celdas de `INSTRUCCIONES_NIVEL2_MEXICO.md`.

---

## 1. Contexto y objetivo

El sistema ya tiene:
- **Nivel 1:** serie armonizada MODIS → VIIRS por país (2000–2025), validada (MAPE 5.6%, sin salto en 2012, correlación 0.83 con el número de incendios de CONAFOR).
- **Nivel 2:** detecciones armonizadas por celda de 0.25° en México (`mx_cell_month_harmonized.parquet`) y variables de contexto de Google Earth Engine por celda (clima, NDVI, área quemada, cobertura, relieve).

**Qué queremos:** una **perspectiva de temporada a 1–3 meses por celda**. Al cierre del mes *t*, el modelo predice la actividad de fuego de los meses *t+1*, *t+2* y *t+3*:
- **Como número:** detecciones armonizadas esperadas, con intervalo.
- **Como categoría:** probabilidad de que el mes quede **por debajo / cerca / por encima de lo normal** para esa celda y ese mes del año (terciles).

**Qué NO hacemos:** predecir dónde empieza un incendio ni dar alertas tácticas. Tampoco competimos con el pronóstico a 10 días por estado de la UJED: el nuestro es de mayor plazo y mayor resolución espacial, y se apoya en la serie larga armonizada.

**Usuarios:** gestores (planear recursos de la temporada) y brigadistas (posicionar bases con semanas de anticipación).

**Regla de oro:** el modelo solo vale si **le gana de forma medible a la climatología** ("lo normal para ese mes en esa celda"). Si no le gana, se reporta así y la app muestra la climatología.

---

## 2. Datos de entrada

| Archivo | Llaves | Uso |
|---|---|---|
| `outputs/tables/mexico/mx_cell_month_harmonized.parquet` | cell_id, year, month | Objetivo (`harm_n`, `harm_frp_mw`) y rezagos de fuego. Columna `source` para saber si el mes es VIIRS observado o relleno |
| `data/raw/aux/gee/mx_grid_025.csv` | cell_id | Malla: `row`, `col`, `lat_c`, `lon_c`, `area_km2`, `state` |
| `data/raw/aux/gee/mx_monthly_025_*.csv` | cell_id, year, month | `t2m_c`, `rh_pct`, `vpd_kpa`, `precip_mm`, `wind_ms`, `soil_w1`, `ndvi`, `burned_frac` |
| `data/raw/aux/gee/mx_landcover_025_*.csv` | cell_id, year | Fracciones `lc_*` (para años después del último disponible, repetir el último) |
| `data/raw/aux/gee/mx_static_025.csv` | cell_id | `elev_m`, `slope_deg` |
| `data/raw/aux/enso/oni.ascii.txt` | año, estación | Índice ONI de El Niño/La Niña. Fuente: NOAA CPC, https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt. Si no hay red, pide al usuario que lo descargue a esa ruta |
| `data/raw/aux/conafor/` | año × estado, semanal | Validación externa (igual que el paso 08) |

Recordatorios de `INSTRUCCIONES_NIVEL2_MEXICO.md`:
- La malla va primero en las uniones. Celda sin fila en la tabla FIRMS ese mes = **0 detecciones** (sí es cero).
- En las tablas de GEE, NaN = **sin dato** (no cero). Nunca rellenes clima faltante con 0.
- `area_km2` es solo tierra; úsalo para normalizar.

---

## 3. Decisiones de diseño (ya tomadas)

1. **Periodo de entrenamiento: 2012 en adelante.** Antes de 2012, el valor por celda viene de repartir el total nacional según las detecciones de Aqua. Sirve para el calendario, pero mete ruido al modelo. Opcional: un experimento con 2003+ como análisis de sensibilidad.
2. **Meses rellenados** (`source` = relleno con el modelo Aqua: ene 2012, jul–ago 2022, jul 2024): se pueden usar como **rezago** (variable de entrada), pero **no como objetivo** al evaluar.
3. **Unidad de predicción:** celda × mes objetivo × horizonte (h = 1, 2, 3). Un modelo por horizonte.
4. **Sin fuga de información:** toda variable de entrada debe estar disponible al cierre del mes *t*. Las únicas excepciones son las que se conocen de antemano: variables estáticas, el mes calendario objetivo y la climatología del mes objetivo calculada **solo con años de entrenamiento**.
5. **Climatologías y estandarizaciones** (medias, desviaciones, terciles por celda y mes) se calculan **solo con los años de entrenamiento** de cada partición. Para el modelo final que alimenta la app, se recalculan con todos los años.

---

## 4. Variables (features)

Todas referidas al mes de emisión *t*, salvo donde se indica.

**Fuego (de `mx_cell_month_harmonized`)**
- `log1p(harm_n)` en *t*, *t−1*, *t−2*; sumas de los últimos 3 y 12 meses.
- Valor del mismo mes objetivo el año anterior: `harm_n` en *t+h−12*.
- Climatología del mes objetivo para la celda (media de `log1p(harm_n)` en años de entrenamiento) y su desviación.
- Anomalía en *t*: z contra la climatología de ese mes.
- `log1p(harm_frp_mw)` en *t*.
- **Vecindad:** media de `log1p(harm_n)` de las 8 celdas vecinas en *t* (por `row`/`col`).

**Clima y vegetación (GEE)**
- Precipitación acumulada de 1, 3 y 6 meses hasta *t*, y su anomalía estandarizada por celda y mes (tipo SPI simple).
- `vpd_kpa`, `t2m_c`, `soil_w1`, `rh_pct` en *t* y sus anomalías.
- Anomalía de `ndvi` en *t* (combustible verde o seco).
- `burned_frac` acumulada de los últimos 12 meses: lo que ya se quemó ya no tiene combustible.

**Estáticas**
- `elev_m`, `slope_deg`, `area_km2`, `lat_c`, `lon_c`; fracciones `lc_*` del año de *t*.
- No uses `state` como categoría (riesgo de sobreajuste). Úsalo solo para reportar.

**Calendario y gran escala**
- Mes objetivo (seno y coseno del mes, o categórica).
- ONI en *t* y en *t−3*.

Documenta cada variable en `outputs/tables/forecast/feature_dictionary.csv` (nombre, descripción, rezago, fuente).

---

## 5. Modelos

**Líneas base (obligatorias):**
- **B0, climatología:** predice la media o mediana del mes objetivo en esa celda.
- **B1, persistencia de la anomalía:** climatología del mes objetivo × razón observado/normal en *t* (acotada, por ejemplo entre 0.25 y 4).
- **B2, ingenuo estacional:** el valor del mismo mes del año anterior.

**Modelo principal:**
- **M1, LightGBM de regresión** por horizonte. Objetivo recomendado: `tweedie` sobre conteos (muchos ceros, cola larga). Alternativa: `l2` sobre `log1p`. Compara las dos y quédate con la mejor en validación.
- **M2, LightGBM de cuantiles** (0.1, 0.5, 0.9) para el intervalo. Si es más simple, deriva el intervalo de los residuales de validación por celda y mes.
- **M3, LightGBM multiclase de terciles** (debajo / cerca / encima, con terciles de entrenamiento por celda y mes) → `p_below`, `p_near`, `p_above`.

Hiperparámetros: búsqueda pequeña y razonable en el año de validación, con early stopping. No hagas búsquedas enormes: el riesgo es sobreajustar al año de validación.

---

## 6. Validación (sin trampa)

**Partición temporal principal** (por mes objetivo):
- Entrenamiento: 2012–2021
- Validación (early stopping e hiperparámetros): 2022
- **Prueba, intocable hasta el final:** 2023–2025

**Robustez:** origen móvil con ventana creciente. Entrena hasta *Y−1* y prueba en *Y*, para *Y* = 2019 … 2025. Reporta la métrica por año, para ver si el desempeño depende de un año particular.

**Métricas** (en prueba, por horizonte):
- MAE y RMSE sobre `log1p`; skill score contra B0 y B1: `1 − MSE_modelo / MSE_ref`. **Positivo = le gana.**
- Spearman por celda a lo largo del tiempo (mediana entre celdas activas).
- **Total nacional:** suma de las predicciones por celda contra el observado mensual. Correlación y error de las temporadas 2023–2025.
- **Terciles:** acierto de categoría, **RPSS** (ranked probability skill score) contra probabilidades climatológicas de 1/3 y diagrama de confiabilidad.
- **Útil para brigadas:** de las 10% de celdas con mayor predicción, ¿qué porcentaje de las detecciones reales capturan? (captura@10%, comparada con B0).
- **Desglose:** temporada alta (feb–jun) contra el resto, cobertura dominante (bosque, matorral, agrícola…) y estado.

**Celdas activas:** muchas celdas casi nunca tienen fuego. Reporta las métricas para todas las celdas y aparte para las activas (por ejemplo, media de entrenamiento ≥ 12 detecciones por año). Deja el umbral en una constante.

**Validación externa:** suma las predicciones por estado y año (2023–2025) y compáralas con CONAFOR, reutilizando las funciones del paso 08. Para la temporada 2025, compara la forma mensual con los datos semanales.

**Lista anti-fuga** (verificar con asserts en el código):
- [ ] Ninguna variable usa datos posteriores a *t* (salvo estáticas, mes objetivo y climatología de entrenamiento).
- [ ] Climatologías, terciles y estandarizaciones calculados solo con años de entrenamiento de cada partición.
- [ ] El año de prueba no participa en early stopping ni en la selección de hiperparámetros.
- [ ] Los meses rellenados no se usan como objetivo en la evaluación.

---

## 7. Explicabilidad

- Importancia de variables (gain) y, si está disponible, SHAP sobre una muestra del set de prueba.
- Dependencia parcial para: anomalía de precipitación de 3 y 6 meses, VPD, anomalía de NDVI, ONI y fuego del mismo mes del año anterior.
- Un par de casos concretos: una celda y temporada donde el modelo acertó un año fuera de lo normal, y una donde falló, con las variables que más pesaron.

---

## 8. Nota operativa: retraso de los datos

ERA5-Land se publica con unos **3 meses de retraso**. En la prueba con años pasados no importa, pero en tiempo real el clima del mes *t* aún no existiría al cierre de *t*.

**Experimento obligatorio (ablación):** entrena una variante "operativa" donde las variables de ERA5-Land y NDVI usan rezago ≥ 3 meses (es decir, hasta *t−2*). Reporta cuánto skill se pierde contra la versión completa. Así sabremos si en producción conviene cambiar a fuentes más rápidas (ERA5 normal, CHIRPS para lluvia).

---

## 9. Prueba de fuego opcional: temporada 2026

La solicitud a FIRMS incluye datos hasta noviembre de 2026 (NRT; S-NPP terminó el 2 de nov de 2026, y NOAA-20/21 empalman con razón ≈ 1.00).
- Si el paso 07 se puede extender a 2026 y existe la exportación de GEE de 2026 (`--start-year 2026 --end-year 2026`, con NaN en los meses que ERA5-Land aún no publica), emite pronósticos con datos hasta dic 2025 para ene–mar 2026, y compáralos con lo observado.
- Esto es una prueba verdaderamente fuera de muestra. Marca claramente que 2026 es NRT.

---

## 10. Lineamientos técnicos

- Entorno: `.venv` del proyecto. Agrega `lightgbm` y `scikit-learn` (y `shap` si se usa) a `requirements.txt`.
- DuckDB para uniones y armado del panel. El panel cabe en memoria (~3,000 celdas × 168 meses × 3 horizontes).
- Semillas fijas, scripts reproducibles, rutas desde `common.py`, figuras con `plot_style.py` (mismo estilo que los pasos anteriores).
- Conteos de filas y decisiones en `outputs/logs/`.

### Scripts

```
scripts/09_build_features.py     # panel celda × mes de emisión × horizonte + diccionario de variables
scripts/10_train_forecast.py     # líneas base, LightGBM (regresión, cuantiles, terciles), partición temporal y origen móvil
scripts/11_evaluate_forecast.py  # métricas, desgloses, CONAFOR, explicabilidad, ablación operativa
scripts/12_export_forecast.py    # tablas para la app (modelo final reentrenado con todos los años)
```

---

## 11. Entregables

```
outputs/tables/forecast/
  feature_dictionary.csv
  metrics_by_horizon.csv          # modelo vs B0/B1/B2, todas y activas
  metrics_rolling_origin.csv      # por año de prueba 2019–2025
  metrics_breakdown.csv           # temporada, cobertura, estado
  tercile_reliability.csv
  conafor_forecast_check.csv
  feature_importance.csv
  ablation_operational.csv
  mx_forecast_cell.parquet        # para la app (ver abajo)
  mx_forecast_state.parquet
outputs/figures/fig09_* … fig12_*
outputs/REPORTE_PRONOSTICO.md
```

**`mx_forecast_cell.parquet`:** `cell_id, issue_year, issue_month, target_year, target_month, horizon, pred_median, pred_lo, pred_hi, clim_median, p_below, p_near, p_above, model_version`. Incluye los pronósticos de prueba (2023–2025) y el pronóstico más reciente que permitan los datos.

**`mx_forecast_state.parquet`:** lo mismo agregado por estado. Las probabilidades de terciles a nivel estado se calculan sobre la suma, no promediando probabilidades de celdas.

### `REPORTE_PRONOSTICO.md` debe responder en lenguaje claro

1. ¿Le gana el modelo a la climatología y a la persistencia? ¿Por cuánto y en qué horizonte?
2. ¿En qué meses, coberturas y estados funciona mejor y dónde no sirve?
3. ¿Qué tan confiables son las probabilidades de terciles (RPSS, diagrama de confiabilidad)?
4. ¿Qué variables pesan más? ¿Tiene sentido físico (sequía previa, VPD, combustible acumulado, ENSO)?
5. ¿Captura las celdas calientes mejor que la climatología (captura@10%)?
6. ¿Cuánto skill se pierde en la versión operativa con rezago de datos?
7. ¿Cómo se ve contra CONAFOR en 2023–2025 (y 2026, si se hizo)?
8. Recomendación final: ¿qué horizonte y qué formato (número o terciles) mostrar en la app?

### Figuras mínimas
- Skill contra B0 y B1 por horizonte (todas y activas)
- Skill por año del origen móvil
- Diagrama de confiabilidad de terciles
- Total nacional mensual 2023–2025: observado vs. pronóstico h = 1 y h = 3, con intervalo
- Mapa de celdas: probabilidad "por encima de lo normal" para un mes de temporada alta de prueba, junto al observado
- Importancia de variables y dependencias parciales

---

## 12. Limitaciones a reportar

- El objetivo hereda las limitaciones del Nivel 2: el factor VIIRS/MODIS es nacional y las detecciones incluyen quemas agrícolas.
- 14 años de datos por celda es poco para eventos extremos: el modelo puede subestimar temporadas récord.
- Las variables mensuales de viento y humedad son aproximaciones (medias mensuales).
- Un pronóstico de actividad no es un pronóstico de daño: no considera población ni valores en riesgo.

---

## 13. Referencias del proyecto

- `REPORTE_TRASLAPE.md` (Nivel 1), `INSTRUCCIONES_NIVEL2_MEXICO.md`
- `outputs/logs/08_conafor_validation.json`, `outputs/logs/05b_sensitivity.json`
- Fu et al. (2020), Remote Sensing 12(18), 2870 · Li et al. (2018), JGR Atmospheres 123(9), 4545–4563

---

## 14. Adaptación a Firely (leer antes que lo anterior)

El plan de arriba se escribió para otro pipeline (celdas de 0.25°, `scripts/09–12`, `outputs/`, exportaciones de Google Earth Engine). En este repositorio se aplica así:

| Plan original | En Firely |
|---|---|
| `mx_cell_month_harmonized.parquet` (0.25°, solo México) | `data/processed/cell_month_harmonized/<País>/year=*/` (H3 r6, **6 países**: Mexico, Argentina, Bolivia, Chile, Paraguay, Uruguay). Objetivo `count_harm`, `frp_harm`; `is_estimated` marca 2001–2012-01 (estimado desde MODIS) |
| Columna `source` (meses rellenados) | `is_estimated`; entrenar desde 2012-02 (VIIRS observado), igual que la decisión 3.1 |
| Vecindad por `row`/`col` | `h3.grid_ring(cell, 1)` |
| Climatología por celda y mes | Ya existe `data/processed/climatology/` (recalcular solo con años de entrenamiento en cada partición: decisión 3.5) |
| Estáticas (`elev_m`, `slope_deg`, `lc_*`) | `data/processed/cell_stats/` (cobertura dominante, población a 10 km, ANP, distancia a localidad), `cell_biome/`, `cell_class/` (régimen). DEM solo para Coahuila |
| ONI | `data/processed/context/oni.parquet` |
| Clima GEE/ERA5-Land por celda (`precip`, `vpd`, `t2m`, `soil_w1`, `ndvi`, `burned_frac`) | **No existe.** Opciones: NASA POWER regional mensual (0.5°, IPv4 forzado, ya hay cliente en `api/app/weather_routes.py`) agregado a H3; o pedir al compañero la exportación GEE. FWI GFWED solo Coahuila |
| `scripts/09…12`, `outputs/` | `pipeline/forecast_features.py`, `forecast_train.py`, `forecast_evaluate.py`, `forecast_export.py`; tablas en `data/processed/forecast/`; reporte en `docs/reporte-pronostico.md`; cifras generadas, nunca a mano |
| Validación externa CONAFOR (paso 08) | `pipeline/validation_extra.py` (`conafor_check`) y `data/processed/reported/` |
| `lightgbm` | Agregar a `requirements.txt` (revisar wheel en el Python del `.venv`) |

**Dónde se usa el pronóstico** (el plan solo dice "para la app"): API `GET /forecast` (celda/área, h = 1–3, terciles e intervalo; siempre con climatología al lado y `model_version`); panel "Perspectiva 1–3 meses" en el Explorador y la pestaña Riesgo; componente del índice de prioridad (§8.16) y del boletín del vigía; herramienta del asistente, del bot de Telegram (`/pronostico`) y del servidor MCP. Regla anti-alucinación: el LLM solo narra lo que devuelve `/forecast`. Regla de oro del plan: si no le gana a la climatología en un país u horizonte, la app muestra la climatología y lo dice.
