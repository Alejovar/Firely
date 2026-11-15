# Reporte del pronóstico de actividad de fuego a 1–3 meses

> Generado por `pipeline.forecast_report` el 2026-11-15 · `forecast-1.0`. No editar a mano: las cifras salen de `data/processed/forecast/`.

Qué predice: al cierre del mes *t*, las detecciones armonizadas (serie VIIRS S-NPP equivalente, H3 r6) de *t+1*, *t+2* y *t+3* en cada celda de México, Argentina, Bolivia, Chile, Paraguay y Uruguay, con intervalo 10–90 % y probabilidad de quedar por debajo / cerca / por encima de lo normal (terciles de la celda y el mes). No predice dónde empieza un incendio.

Partición: entrenamiento 2012–2021, validación 2022 (early stopping y calibración), **prueba 2023–2025, sin tocar hasta el final**. Skill = 1 − MSE_modelo / MSE_referencia sobre log1p(detecciones); positivo = le gana.

## 1. ¿Le gana a la climatología y a la persistencia?

| Horizonte | Celdas | Filas | vs climatología (B0) | vs persistencia (B1) | vs mismo mes año previo (B2) | RPSS terciles | Spearman por celda (mediana) |
|---|---|---|---|---|---|---|---|
| 1 | todas | 4,435,236 | +15.7% | +35.3% | +52.8% | 0.12 | — |
| 1 | activas | 786,888 | +18.1% | +40.7% | +53.4% | 0.14 | 0.41 |
| 2 | todas | 4,435,236 | +10.7% | +36.6% | +50.0% | 0.09 | — |
| 2 | activas | 786,888 | +12.4% | +42.9% | +50.2% | 0.10 | 0.37 |
| 3 | todas | 4,435,236 | +9.4% | +37.5% | +49.3% | 0.08 | — |
| 3 | activas | 786,888 | +11.0% | +44.1% | +49.4% | 0.09 | 0.36 |

Celdas *activas*: climatología de entrenamiento ≥ 12 detecciones al año. Las celdas sin una sola detección en los años de entrenamiento no se modelan: su perspectiva es lo normal (0).

Modelo elegido en validación por horizonte: h=1: LightGBM log1p (l2), h=2: LightGBM log1p (l2), h=3: LightGBM log1p (l2).

## 2. ¿Dónde funciona mejor y dónde no?

Skill contra la climatología por país (todas las celdas modeladas):

| País | h=1 | h=2 | h=3 |
|---|---|---|---|
| Argentina | +17.6% | +13.6% | +12.1% |
| Bolivia | +15.6% | +8.5% | +7.2% |
| Chile | +9.1% | +8.7% | +7.0% |
| Mexico | +13.2% | +9.4% | +8.9% |
| Paraguay | +18.4% | +13.5% | +11.8% |
| Uruguay | +9.5% | +9.6% | +11.0% |

Temporada alta (los 5 meses de mayor actividad normal en cada país) contra el resto:

| Meses | h=1 | h=2 | h=3 |
|---|---|---|---|
| alta | +16.1% | +11.0% | +9.8% |
| resto | +14.4% | +9.6% | +8.3% |

Temporada alta usada: Argentina: ene, jul, ago, sep, oct; Bolivia: jul, ago, sep, oct, nov; Chile: ene, feb, mar, abr, may; Mexico: feb, mar, abr, may, jun; Paraguay: jul, ago, sep, oct, nov; Uruguay: abr, may, jul, ago, sep.

**Totales mensuales por país** 2023–2025 (suma de las celdas; conteo esperado con los residuales de validación de cada tramo de predicción). Es otro producto que la celda: aunque el modelo gana por celda en todos los países, al sumar puede perder contra la climatología. Donde pierde, la API muestra lo normal para el total del país (`totals_beat_climatology`):

| País | h | r modelo | r climatología | error mediano modelo | error mediano climatología | suma pronóstico / observado |
|---|---|---|---|---|---|---|
| Argentina | 1 | 0.89 | 0.87 | 26% | 49% | 1.14 |
| Argentina | 2 | 0.89 | 0.87 | 47% | 49% | 1.30 |
| Argentina | 3 | 0.87 | 0.87 | 50% | 49% | 1.32 |
| Bolivia | 1 | 0.83 | 0.66 | 49% | 61% | 0.50 |
| Bolivia | 2 | 0.78 | 0.66 | 60% | 61% | 0.49 |
| Bolivia | 3 | 0.80 | 0.66 | 61% | 61% | 0.48 |
| Chile | 1 | 0.21 | 0.17 | 33% | 29% | 0.74 |
| Chile | 2 | 0.24 | 0.17 | 47% | 29% | 0.88 |
| Chile | 3 | 0.16 | 0.17 | 58% | 29% | 0.89 |
| Mexico | 1 | 0.98 | 0.97 | 31% | 17% | 1.18 |
| Mexico | 2 | 0.98 | 0.97 | 47% | 17% | 1.24 |
| Mexico | 3 | 0.98 | 0.97 | 67% | 17% | 1.24 |
| Paraguay | 1 | 0.80 | 0.70 | 34% | 40% | 1.12 |
| Paraguay | 2 | 0.78 | 0.70 | 36% | 40% | 1.20 |
| Paraguay | 3 | 0.76 | 0.70 | 46% | 40% | 1.26 |
| Uruguay | 1 | 0.32 | 0.51 | 113% | 74% | 2.02 |
| Uruguay | 2 | 0.37 | 0.51 | 201% | 74% | 2.68 |
| Uruguay | 3 | 0.40 | 0.51 | 136% | 74% | 2.10 |

## 3. ¿Qué tan confiables son las probabilidades?

RPSS contra la frecuencia climatológica de cada categoría en esa celda y mes (referencia más exigente que 1/3, porque con muchos meses en cero «por debajo» suele ser imposible). Confiabilidad de P(por encima de lo normal), h=1:

| P media | Frecuencia observada | Filas |
|---|---|---|
| 0.03 | 0.02 | 3,383,955 |
| 0.14 | 0.14 | 656,154 |
| 0.25 | 0.24 | 261,790 |
| 0.34 | 0.36 | 82,783 |
| 0.44 | 0.46 | 39,694 |
| 0.54 | 0.56 | 5,041 |
| 0.62 | 0.65 | 4,131 |
| 0.76 | 0.67 | 444 |
| 0.84 | 0.78 | 1,237 |
| 1.00 | 0.71 | 7 |

Las probabilidades se calibran con regresión isotónica en el año de validación (2022), en función de la distancia entre la predicción y el umbral del tercil.

Cobertura del intervalo 10–90 % en prueba: h=1: 86%, h=2: 86%, h=3: 86% (nominal 80 %).

## 4. ¿Qué variables pesan más?

h=1: `clim_t` (61%), `nb0` (5%), `l0` (4%), `s12` (3%), `nb_ly` (3%), `z0` (2%), `lon` (2%), `sd_t` (2%), `oni4` (2%), `ratio0` (1%).

h=2: `clim_t` (67%), `s12` (4%), `nb_ly` (4%), `oni4` (2%), `sd_t` (2%), `lon` (2%), `ly` (1%), `nb0` (1%), `oni1` (1%), `lat` (1%).

h=3: `clim_t` (72%), `nb_ly` (4%), `s12` (4%), `oni4` (3%), `sd_t` (2%), `lon` (2%), `ly` (2%), `oni1` (1%), `lat` (1%), `vpd_a` (1%).

| Variable | Qué es |
|---|---|
| `clim_t` | media de log1p(count_harm) del mes objetivo en años anteriores al año objetivo |
| `nb0` | media de log1p(count_harm) de las 6 celdas vecinas (h3 grid_ring 1) en t |
| `l0` | log1p(count_harm) en t |
| `s12` | log1p(suma de count_harm t-11..t) |
| `nb_ly` | media vecinal de log1p(count_harm) en t+h-12 |
| `z0` | anomalía estandarizada de log1p(count_harm) en t contra clim_i |
| `lon` | longitud del centroide de la celda |
| `sd_t` | desviación de la misma climatología expansiva del mes objetivo |
| `oni4` | ONI centrado en t-4 |
| `ratio0` | (conteo en t + 1) / (media de años previos del mismo mes + 1) |

Lectura física: domina la memoria del fuego (lo normal de la celda en ese mes, el mismo mes del año anterior en la celda y su vecindad); el clima (lluvia acumulada, VPD, humedad de suelo) y ENSO ajustan la anomalía.

## 5. ¿Captura las celdas calientes mejor que la climatología?

Porcentaje de las detecciones reales que cae en el 10 % de celdas con mayor pronóstico (por país y mes):

| País | h=1 | h=2 | h=3 |
|---|---|---|---|
| Argentina | 60% (clim. 42%) | 54% (clim. 42%) | 51% (clim. 42%) |
| Bolivia | 38% (clim. 23%) | 29% (clim. 23%) | 27% (clim. 23%) |
| Chile | 51% (clim. 45%) | 50% (clim. 45%) | 48% (clim. 45%) |
| Mexico | 45% (clim. 40%) | 42% (clim. 40%) | 41% (clim. 40%) |
| Paraguay | 41% (clim. 26%) | 33% (clim. 26%) | 29% (clim. 26%) |
| Todos | 44% (clim. 31%) | 37% (clim. 31%) | 36% (clim. 31%) |
| Uruguay | 40% (clim. 32%) | 37% (clim. 32%) | 38% (clim. 32%) |

## Robustez: origen móvil

Entrenando hasta *Y−1* y probando en *Y* (skill contra climatología, todos los países):

| Año de prueba | h=1 | h=2 | h=3 |
|---|---|---|---|
| 2019 | +11.4% | +7.2% | +5.1% |
| 2020 | +12.9% | +6.6% | +4.6% |
| 2021 | +9.3% | +5.9% | +5.3% |
| 2022 | +11.6% | +6.7% | +5.4% |
| 2023 | +11.9% | +7.1% | +4.5% |
| 2024 | +13.1% | +6.3% | +6.1% |
| 2025 | +14.2% | +10.7% | +9.8% |

## 6. Datos en operación

El clima histórico viene de NASA POWER mensual (MERRA-2, 0.5° × 0.625°), que publica años completos; el año en curso se arma con POWER diario agregado a mes (la agregación reproduce el producto mensual de 2025 con diferencia media absoluta ≤ 0.0025). El fuego posterior a la tabla armonizada son conteos S-NPP observados (archivo SP hasta julio de 2026, NRT con máscara de fuentes estáticas hasta octubre); reproducen la tabla oficial de Argentina enero–julio de 2026 con diferencias mensuales de +0.5 % a +3.2 %. S-NPP terminó el 2 de noviembre de 2026: para emitir después hará falta NOAA-20/21 escalado a S-NPP.

Último mes de emisión por país: Uruguay 2026-10, Bolivia 2026-10, Chile 2026-10, Argentina 2026-10, Paraguay 2026-10, Mexico 2026-10.

### Prueba fuera de muestra 2026 (celdas)

Modelo final (entrenado con 2012–2025) emitido cada mes desde diciembre de 2025; meses objetivo de 2026 ya observados. Meses de 2026 posteriores a la tabla armonizada: conteos S-NPP observados (archivo SP hasta julio, NRT con máscara de fuentes estáticas después; pipeline.snpp_recent) y clima de NASA POWER diario agregado a mes. Provisionales.

| Horizonte | Filas | Meses | vs climatología |
|---|---|---|---|
| 1 | 1,322,900 | 2026-01 a 2026-10 | +21.9% |
| 2 | 1,190,610 | 2026-02 a 2026-10 | +17.8% |
| 3 | 1,058,320 | 2026-03 a 2026-10 | +17.0% |

### Prueba fuera de muestra 2026

Totales por país del pronóstico emitido con datos hasta diciembre de 2025 contra lo observado («Normal» = promedio 2012–2025 del mes):

| País | h | Mes | Pronóstico | Normal | Observado |
|---|---|---|---|---|---|
| Argentina | 1 | ene 2026 | 6603 | 14962 | 6600 |
| Argentina | 2 | feb 2026 | 9688 | 11420 | 6438 |
| Argentina | 3 | mar 2026 | 10154 | 8819 | 4649 |
| Bolivia | 1 | ene 2026 | 1466 | 3160 | 2529 |
| Bolivia | 2 | feb 2026 | 1697 | 1477 | 1254 |
| Bolivia | 3 | mar 2026 | 2008 | 1638 | 449 |
| Chile | 1 | ene 2026 | 1278 | 4247 | 4889 |
| Chile | 2 | feb 2026 | 2326 | 4620 | 1406 |
| Chile | 3 | mar 2026 | 3547 | 3577 | 3242 |
| Mexico | 1 | ene 2026 | 10525 | 7295 | 7677 |
| Mexico | 2 | feb 2026 | 16877 | 9626 | 14165 |
| Mexico | 3 | mar 2026 | 29992 | 22449 | 14699 |
| Paraguay | 1 | ene 2026 | 3949 | 8996 | 4367 |
| Paraguay | 2 | feb 2026 | 6650 | 7891 | 5927 |
| Paraguay | 3 | mar 2026 | 7401 | 7667 | 5028 |
| Uruguay | 1 | ene 2026 | 165 | 155 | 145 |
| Uruguay | 2 | feb 2026 | 226 | 109 | 115 |
| Uruguay | 3 | mar 2026 | 259 | 144 | 150 |

## 7. Validación externa

México, suma por estado y año 2023–2025 (90 estado-años) contra el número de incendios que reportó CONAFOR (Spearman). «observed» es la detección armonizada real y sirve de techo: si la observación sigue poco a los reportes, el pronóstico no puede seguirlos mejor.

| Serie | h=1 | h=2 | h=3 |
|---|---|---|---|
| climatology | 0.26 | 0.26 | 0.26 |
| forecast | 0.21 | 0.21 | 0.21 |
| observed | 0.26 | 0.26 | 0.26 |

Por estado, las detecciones satelitales siguen poco a los incendios forestales reportados (muchas son quemas agrícolas y un incendio grande produce muchas detecciones): esta comparación no discrimina entre modelos. La concordancia nacional anual de la serie armonizada con CONAFOR está en `docs/metodologia-armonizacion.md`.

## 8. Recomendación para la app

- h=1: el modelo le gana a la climatología (MSE y RPSS) en 6 de 6 países.
- h=2: el modelo le gana a la climatología (MSE y RPSS) en 6 de 6 países.
- h=3: el modelo le gana a la climatología (MSE y RPSS) en 6 de 6 países.

Formato: mostrar **terciles** (por debajo / cerca / por encima de lo normal) como mensaje principal y el número esperado con su intervalo como detalle, siempre junto a lo normal del mes. El horizonte de 1 mes es el más hábil; 2–3 meses sirven para planear la temporada.

## Cambios respecto al plan original

- Un modelo por horizonte para los seis países juntos (`country` como variable categórica), malla H3 r6.
- Clima de NASA POWER en lugar de ERA5-Land/GEE; sin NDVI ni área quemada (no disponibles por celda).
- Las climatologías que entran como **variables** son expansivas (mismo mes de años previos): la climatología fija de entrenamiento contiene el propio objetivo dentro de las filas de entrenamiento y una versión leave-one-out también filtra; con ellas el modelo se sobreajustaba (detectado y corregido). La climatología fija de entrenamiento se conserva para la línea base B0 y los terciles.
- Intervalo y terciles calibrados en validación (residuales por tramo e isotónica) en lugar de LightGBM de cuantiles y multiclase.
- Filas con objetivo cero submuestreadas 1 de 8 con peso 8 en entrenamiento (memoria); validación y prueba usan todas las filas.

## Limitaciones

- Hereda las limitaciones de la armonización y de FIRMS (incluye quemas agrícolas; nubes).
- 14 años por celda es poco para extremos: puede subestimar temporadas récord.
- Clima mensual a 0.5°: no resuelve topografía fina ni eventos de viento.
- Un pronóstico de actividad no es de daño: no considera población ni valores en riesgo.


Atribución: NASA FIRMS (MODIS C6.1, VIIRS), NASA POWER, NOAA CPC (ONI).
