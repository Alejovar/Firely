# Firely: detalles del proyecto

**NASA Space Apps Challenge 2026 · Reto "Harmonization of MODIS and VIIRS Hot Spots" · Saltillo, Coahuila**

> Firely rescata 25 años de historia de fuego que se perderían con el retiro de MODIS y la convierte en información que cualquier brigadista entiende.

---

## 1. El problema

Dos familias de satélites de la NASA detectan incendios activos desde el espacio:

| Sensor | Satélites | Desde | Pixel | Hora de paso |
|---|---|---|---|---|
| MODIS | Terra (mañana) y Aqua (tarde) | Terra 2000, Aqua julio de 2002 | ~1 km | 10:30 y 13:30 |
| VIIRS | Suomi-NPP, NOAA-20, NOAA-21 | S-NPP 2012, NOAA-20 2018, NOAA-21 2023 | 375 m | 13:30 (igual que Aqua) |

Por su pixel más fino, VIIRS descubre muchos fuegos pequeños que MODIS no ve: en 2013 cuenta entre 2.6 y 3.8 veces los puntos de MODIS. Al pegar los dos registros tal cual aparece un **salto falso en 2012**: parece que el fuego se triplicó, cuando lo único que cambió fue el sensor. VIIRS da además otros dos saltos en 2018 y 2023, cuando entran NOAA-20 y NOAA-21.

MODIS está por retirarse. Sin una corrección, los once años de 2001 a 2011 quedan incomparables con el presente, y con ellos cualquier medición de tendencias, de temporadas que se adelantan o de años extremos.

---

## 2. ¿Qué hace y cómo funciona?

Firely tiene tres capas:

1. **Un pipeline científico** que convierte los puntos de calor de NASA FIRMS en una serie mensual armonizada por celda hexagonal, la valida y genera tablas Parquet.
2. **Un backend de análisis** (API) que responde preguntas sobre cualquier área: qué pasó, si es normal, qué puede venir y dónde conviene actuar.
3. **Varios canales** sobre el mismo núcleo: app web, app Android, Gotita (asistente con IA), bot de Telegram, servidor MCP, API abierta, widget y estándares de SIG y emergencias.

### 2.1 Ingesta y limpieza (`pipeline/ingest.py`)

- Lee los ZIP anuales y las solicitudes personalizadas de FIRMS **sin descomprimirlos completos**: procesa un país y un año a la vez con DuckDB, para no cargar decenas de GB en memoria.
- Homologa los nombres de satélite de FIRMS (`T`, `A`, `N`, `J1`/`N20`, `J2`/`N21`) a Terra, Aqua, SNPP, NOAA20 y NOAA21.
- **Filtra** con las siguientes reglas:
  - solo detecciones de vegetación (`type = 0`), lo que descarta volcanes, fuentes industriales fijas y detecciones en el mar;
  - descarta coordenadas inválidas, fechas ilegibles y archivos cuyo satélite no coincide con el esperado;
  - descarta las detecciones de confianza baja: en MODIS, confianza menor a 30 en la escala 0–100; en VIIRS, la clase `l`.
- **Homologa la confianza** a tres niveles (baja, nominal y alta). MODIS usa la escala 0–100 y VIIRS las clases `l`/`n`/`h`.
- **Deduplica** por (satélite, instante, latitud, longitud). Esto quita la misma detección cuando aparece a la vez en el resumen anual y en una solicitud personalizada, con prioridad por fuente.
- **Calcula la fecha local** de cada detección a partir de la zona horaria de sus coordenadas, no de la hora UTC. Esto es indispensable para el análisis del día de la semana y para no partir un incendio nocturno en dos días.
- Guarda una tabla Parquet por país y año, con identificador estable (hash), sensor, satélite, confianza, FRP (potencia radiativa en MW) y bandera día/noche.

### 2.2 Malla hexagonal H3 (`pipeline/h3_cells.py`)

- Cada detección recibe su celda **H3 de resolución 6** (unos 36 km²), que es la unidad principal, y también la de **resolución 7** para el detalle local.
- Se usan hexágonos porque todas las celdas tienen el mismo tamaño y los mismos seis vecinos equidistantes. Eso permite usar la "vecindad" en la armonización y en el pronóstico.
- Se construye una tabla densa celda × mes de 2001 a hoy, **con ceros explícitos**. Un mes sin fuego es un dato, no un hueco.

### 2.3 Cobertura del suelo (`pipeline/landcover.py`)

- Cada celda recibe su clase IGBP dominante de MODIS MCD12Q1 v061 (`LC_Type1`). Se toman 13 puntos de muestra por hexágono (el centro y dos anillos hacia los vértices) y se usa la moda de los pixeles válidos.
- Las 17 clases IGBP se agrupan en 5 biomas:

| Bioma | Clases IGBP |
|---|---|
| bosque | 1–5 |
| matorral | 6–7 |
| pastizal o sabana | 8–10 |
| cultivo | 12 y 14 |
| otros | 11, 13 y 15–17 |

### 2.4 La armonización (`pipeline/harmonize.py`, metodología `1.2.0-hybrid-biome`)

**Unidad de referencia: "un VIIRS Suomi-NPP".** Toda la serie se expresa como lo que habría detectado un solo satélite S-NPP. Por eso la serie no salta en 2018 ni en 2023: NOAA-20 y NOAA-21 no se suman encima de S-NPP.

**Qué hay en cada época:**

| Periodo | Qué se usa | Bandera |
|---|---|---|
| 2001-01 a 2002-07 | Estimado desde **solo Terra** (Aqua aún no existía), con su propio modelo calibrado | `is_estimated = true` |
| 2002-08 a 2012-01 | Estimado desde **Terra + Aqua** | `is_estimated = true` |
| 2012-02 a 2026-07 | **VIIRS S-NPP observado**, sin corrección: es la referencia | observado |
| Meses finales sin VIIRS (FIRMS publica MODIS antes que VIIRS) | Estimado desde MODIS con el mismo modelo | `is_estimated = true` |
| Tras el apagado de S-NPP (2 de noviembre de 2026) | NOAA-20 multiplicado por su razón contra S-NPP, medida en 2018–2025 | observado escalado |

**El estimador, paso a paso.** Se aprende la relación entre MODIS y S-NPP en los años en que ambos observaron a la vez, y se aplica a los años con solo MODIS. Todos los cálculos se hacen por **grupo de celdas `c`** y **mes del calendario `m`**: un marzo se calibra con marzos, porque la relación cambia con la temporada.

1. **Razones de calibración.** Para cada grupo `c` y mes `m`, con los años de calibración:
   - `r_tot(c, m)` = Σ detecciones S-NPP ÷ Σ detecciones MODIS (todas las celdas del grupo).
   - `r_pos(c, m)` = Σ detecciones S-NPP ÷ Σ MODIS, solo en las celdas donde MODIS sí detectó algo.
   - `fpd(c, m)` = FRP medio de S-NPP por detección.

2. **Total regional del mes.** El total armonizado del mes `t` es la suma, sobre los grupos, de la razón del grupo multiplicada por la actividad MODIS del grupo:

   `T(t) = Σ_c r_tot(c, m) × MODIS_c(t)`

   El total se calcula por grupo porque la razón cambia de un tipo de fuego a otro: los fuegos agrícolas pequeños son los que MODIS más "pierde".

3. **Reparto a las celdas, en dos partes:**
   - **Celdas con detecciones MODIS:** `e0 = MODIS_celda × r_pos(c, m)`.
   - **Celdas sin detecciones MODIS.** VIIRS suele ver fuegos pequeños donde MODIS no vio nada, así que estas celdas también reciben una parte: `e0 = z(c, m, vecindad) × MODIS_c(t) / n_celdas_c`.
     - `z` es cuánto S-NPP aparece, en la calibración, en celdas con cero MODIS, en relación con la actividad regional.
     - Se calcula por **clase de vecindad**: la suma de detecciones MODIS en los 6 hexágonos vecinos, agrupada en 0, 1–2, 3–6 y más de 6.
     - Así, una celda sin detección rodeada de fuego recibe más que una celda aislada.

4. **Reescalado.** Las estimaciones por celda se reescalan para que su suma sea exactamente el total regional `T(t)`:

   `estimado_celda = e0 × T(t) / Σ e0`

5. **FRP armonizado.** `FRP = estimado_celda × fpd(c, m)`, es decir, el conteo armonizado por el FRP típico de S-NPP por detección en ese grupo y mes. Así se armonizan dos métricas, **conteo y energía**.

6. **Banda de incertidumbre.** El percentil 90 del error anual de la validación se usa como banda relativa, en las columnas `count_harm_lo` y `count_harm_hi`.

**Cómo se forman los grupos de celdas.** Cada país prueba cuatro configuraciones y se queda con la de menor error en la validación:

| Configuración | Grupos |
|---|---|
| simple | Un solo grupo por país (factor mensual), sin vecindad |
| regímenes de fuego + vecindad | 5 regímenes calculados **solo con MODIS** (ver abajo) |
| bioma IGBP + vecindad | Los 5 biomas de MCD12Q1 |
| bioma × régimen + vecindad | El producto de ambos |

Los **regímenes de fuego** salen de un k-means (k = 5) sobre el comportamiento de cada celda con al menos 20 detecciones MODIS. Las variables, estandarizadas, son:
- FRP medio (log);
- fracción nocturna;
- proporción de detecciones en primavera, invierno y verano;
- actividad total (log).

Las celdas con menos de 20 detecciones forman la clase 0. Los regímenes se calculan solo con MODIS, así que no usan información de VIIRS (no hay fuga del objetivo) y valen igual antes de 2012.

**Por qué Terra + Aqua y no solo Aqua.** Aqua pasa a la misma hora que S-NPP y parece el mejor predictor, pero lo probamos con la misma validación año-fuera: usar los dos satélites combinados da menos error en los seis países (México 2.84% contra 4.70%; Argentina 3.40% contra 4.46%).

**Deriva de órbita.** Desde alrededor de 2020, Terra y después Aqua se desplazan de su hora de paso original. La razón anual VIIRS/MODIS se probó con Mann-Kendall y pendiente de Sen. Por eso:
- las estimaciones de 2001–2011 se calibran **solo con los años de órbita estable (2012-02 a 2021-12)**;
- los meses finales de 2026, que ocurren en la etapa de deriva, se calibran con todos los años.

### 2.5 Validación de la armonización

**Validación año-fuera (2012–2025).** Se esconde un año completo, se calibra con los demás, se estima lo que VIIRS vio ese año a partir de MODIS y se compara con lo que VIIRS realmente vio. Se repite con cada año. La **línea base** es la corrección ingenua: multiplicar MODIS por un factor fijo (la razón media VIIRS/MODIS).

| País | Modelo elegido | Error anual del método | Error anual de la línea base | Mejora | Banda (p90) |
|---|---|---|---|---|---|
| México | regímenes + vecindad | 2.82% | 4.14% | **32% menos** | ±6.3% |
| Argentina | bioma IGBP + vecindad | 4.10% | 5.87% | **30% menos** | ±8.6% |
| Paraguay | regímenes + vecindad | 2.43% | 3.58% | **32% menos** | ±4.3% |
| Uruguay | regímenes + vecindad | 6.15% | 16.82% | **63% menos** | ±15.9% |
| Bolivia | regímenes + vecindad | 6.17% | 7.13% | **13% menos** | ±10.7% |
| Chile | regímenes + vecindad | 9.49% | 9.79% | **3% menos** | ±17.4% |

Además:
- **Mes pico.** En México se acierta el mes de máxima actividad exacto en el 93% de los años, y con tolerancia de un mes en el 100%.
- **Orden de los meses.** La correlación de Spearman entre los meses estimados y los observados es de 0.992.
- **Solo Terra (2001 a julio de 2002).** El error anual en México es de 2.45% contra 3.62% de la línea base.

**Validación hacia atrás.** Los años 2001–2011 son anteriores a VIIRS, así que no se pueden comparar con él. La prueba más cercana es calibrar con los años recientes (2018–2025) y predecir los anteriores (2012–2017), que es la misma dirección del tiempo que las estimaciones reales.
- México: 2.28% de error contra 4.75% de la línea base.
- Argentina: 4.68% contra 7.21%.

**Validaciones independientes** (no usan los datos de calibración):

1. **¿Desapareció el salto de 2012?** Se ajusta `log(total anual) = a + b·año + d·[año ≥ 2012]` en 2003–2025, con la serie cruda pegada y con la armonizada.

   | País | Salto con la serie cruda | Salto con la armonizada |
   |---|---|---|
   | México | +218% (p < 0.001) | −20% (p = 0.28, no significativo) |
   | Argentina | +121% (p = 0.003) | −29% (p = 0.16) |
   | Chile | +209% | −2% |
   | Paraguay | +201% | −4% |
   | Uruguay | +127% | −23% |

   En Bolivia queda un quiebre residual, y por eso su serie se marca con confiabilidad baja.

2. **CONAFOR (México).** Los incendios reportados en campo no dependen de ningún satélite. Con 25 años de totales oficiales (11 de ellos antes de 2012):

   | Prueba | Serie armonizada | Serie cruda |
   |---|---|---|
   | Correlación con el **número de incendios** reportados | 0.80 | −0.00 |
   | Mediana de Spearman por estado (30 estados) | 0.52 | 0.18 |

   El 87% de los estados correlaciona mejor con la serie armonizada. Con la superficie quemada el resultado es más matizado, y lo reportamos igual.

3. **Contraste con un segundo modelo independiente** (un análisis por país con predictor Aqua). Los totales de 2001–2011 correlacionan a 0.994 en México y 0.993 en Argentina, con razón mediana cercana a 1.

**Confiabilidad por país.** Cada país recibe una etiqueta calculada con sus propias validaciones:
- **alta:** mejora al menos 20%, la validación hacia atrás también supera a la línea base y no hay deriva significativa;
- **media:** mejora en ambas validaciones y la banda es de ±15% o menos;
- **baja:** cualquier otro caso.

México, Argentina y Paraguay salen con confiabilidad alta; Uruguay, Chile y Bolivia, con baja, con sus motivos escritos. **Los datos de baja confiabilidad no se esconden: se muestran marcados.**

**Todo es reproducible.** Las cifras de esta sección no se escriben a mano. Las genera el pipeline en `harmonization_summary.json`, y de ahí se regeneran el documento de metodología y la página "Cómo armonizamos" de la app.

### 2.6 Eventos de fuego (`pipeline/events.py`)

Un incendio grande produce cientos de puntos de calor. Para comparar **incendios** y no solo puntos, las detecciones se agrupan en eventos:

1. **Un sensor por época.** Desde 2012 se usa solo VIIRS; antes de 2012, solo MODIS, con los eventos marcados como estimados.
2. **Deduplicación entre satélites.** El mismo pixel, en la misma fecha local y con la misma bandera día/noche, se colapsa en un punto, con preferencia por satélite (S-NPP > NOAA-20 > NOAA-21; Aqua > Terra).
3. **Grafo espacio-temporal.** Los nodos son pares (celda H3 r8, fecha local). Dos nodos se unen si están a menos de unos 1.6 km (VIIRS) o 3.3 km (MODIS) y a pocos días de distancia. Los componentes conexos se calculan con union-find vectorizado en NumPy.
4. **Fin de año.** Se incluyen 15 días del año vecino para no partir en dos un incendio que cruza diciembre y enero.
5. **Atributos por evento:** inicio, fin, duración, número de puntos, FRP total, envolvente convexa, área aproximada de pixeles (no es área quemada) y ranking por FRP dentro del país.

### 2.7 Análisis (`pipeline/analysis.py` y rutas de la API)

| Análisis | Cómo se calcula |
|---|---|
| **Calendario** años × meses | Suma de `count_harm` de las celdas del área. Los años estimados se muestran rayados, con su banda. |
| **Temporada** | Fechas en que se acumula el 10%, 50% y 90% del total anual (inicio, pico, fin). Tendencia con pendiente de Sen y prueba de Mann-Kendall. La conclusión usa **solo años observados por VIIRS**: si una tendencia aparece únicamente al mezclar los años estimados, se avisa que podría ser un artefacto del método. |
| **Años análogos** | Se compara la curva acumulada del año actual hasta la fecha contra la de cada año anterior (RMSE normalizado por la mediana anual). Hay una penalización si la fase de El Niño/La Niña (ONI) es distinta. Se toman los 3 más parecidos y se reporta el rango de cómo cerraron. Es una referencia, no un pronóstico. |
| **Periodo de retorno** | Rango empírico del mes contra el mismo mes de los demás años completos, convertido a "una vez cada N años" (tope de 50). |
| **Día de la semana** | Día de inicio de los **eventos** VIIRS con al menos 3 puntos, en fecha local, con prueba chi-cuadrado contra una distribución uniforme. Se usan eventos y no puntos porque los puntos de un mismo incendio no son independientes e inflarían la significancia. Un exceso de inicios en ciertos días es la firma de quemas humanas. |
| **Fuego nocturno** | Fracción anual de detecciones VIIRS nocturnas, que indica fuegos persistentes. |
| **Regímenes de fuego** | Mapa de los regímenes por celda y de dónde cambiaron. |
| **El Niño / La Niña** | El índice ONI de NOAA junto a cada año del calendario. |
| **Contexto meteorológico** | NASA POWER: anomalías de precipitación, temperatura, humedad y viento junto a la anomalía de fuego, por ejemplo "el marzo más seco desde…". |
| **Detectados contra reportados** | La serie armonizada frente a CONAFOR, por estado. Revela fuego que no se está reportando. |
| **Comparador** | Dos áreas o dos periodos con la misma escala. |

### 2.8 Alerta temprana y decisión

- **Índice de prioridad de prevención (0–100)**, por área y por celda. Es un promedio ponderado, con pesos ajustables desde la app, de cinco componentes:

  | Componente | Peso por defecto | Qué mide |
  |---|---|---|
  | Anomalía | 0.35 | Percentil del último mes contra el mismo mes de otros años |
  | Recurrencia | 0.25 | Años con fuego en los 15 años anteriores |
  | Exposición | 0.25 | Población de las localidades a unos 10 km, en escala logarítmica |
  | Temporada | 0.15 | Si el mes está entre los tres de mayor mediana histórica |
  | Peligro meteorológico | 0.15 | Percentil del FWI de NASA GFWED, donde hay datos |

  El resultado se clasifica en baja (< 30), media (< 55), alta (< 75) y extrema. Cada componente muestra su explicación. **Es una ayuda para priorizar, no una probabilidad de incendio.**

- **Peligro meteorológico de los próximos 8 días.** Se usa el pronóstico GEOS-5 de NASA GFWED:
  - la API descarga **solo las filas del NetCDF global que cruzan el área**, con peticiones HTTP Range, en lugar de archivos de 16 MB;
  - compara el FWI pronosticado con la climatología 1981–2010;
  - si NASA no responde, sirve la última corrida guardada, marcada como desactualizada.

- **Pronóstico a 1–3 meses** por celda (`pipeline/forecast_*`):
  - **Modelo:** LightGBM sobre `log1p(conteo armonizado)`, un modelo por horizonte, entrenado con seis países a la vez.
  - **Variables:**
    - **historia:** los rezagos del conteo, el FRP, la actividad de las celdas vecinas y el mismo mes del año anterior;
    - **clima de NASA POWER:** precipitación de 1, 3, 6 y 12 meses, temperatura, humedad, viento, humedad del suelo y déficit de presión de vapor;
    - **El Niño/La Niña:** el índice ONI;
    - **contexto de la celda:** población cercana, área protegida, bioma, coordenadas y climatologías expansivas.
  - **Sin fuga de información:** las climatologías usadas como variables solo ven años anteriores, y cada variable lee meses ≤ t (verificado con asserts). Los meses estimados desde MODIS nunca son objetivo de entrenamiento.
  - **Partición:** entrenamiento 2012–2021, validación 2022, **prueba 2023–2025 sin tocar hasta el final**.
  - **Resultados en la prueba a un mes:** supera a la climatología en 15.7% y a la persistencia en 35.3% (skill sobre el MSE). En las celdas activas: 18.1% y 40.7%.
  - **Probabilidades:** da un intervalo del 10% al 90% y la probabilidad de quedar por debajo, cerca o por encima de lo normal (terciles).
  - **Regla de oro:** si en un país y horizonte el modelo no le ganó a la climatología en la prueba, la app lo dice y muestra la climatología.

- **Cono de propagación** según el viento de Open-Meteo, y **localidades a favor del viento**.
- **Ficha de situación** de una página, lista para imprimir, con el calendario a color, el semáforo y el último mes contra su mediana histórica.
- **Simulacros**: escenarios por etapas (detección → exposición → evolución → desenlace) construidos con un incendio real del área.

### 2.9 Gotita, la asistente con IA (`ai/`)

Gotita usa **Claude Haiku** (API de Anthropic) con salidas estructuradas, y está diseñada para no inventar nada:

1. **Entender la pregunta** (`ai/intent.py`).
   - El modelo solo extrae el *nombre* del lugar y el periodo; nunca genera coordenadas.
   - El lugar se resuelve contra un **gazetteer local** construido con INEGI, GeoNames y geoBoundaries.
   - Si no hay clave de API o la llamada falla, un extractor por reglas en español, inglés y portugués toma el relevo.
2. **Decidir el modo** (`ai/assistant.py`).
   - Si la pregunta necesita datos nuevos, regresa como consulta de datos y la app consulta la serie armonizada. Así "¿y en marzo?" se convierte en "Arteaga, Coahuila en marzo".
   - Si es una pregunta de seguimiento (qué significa una cifra, qué hacer), responde con la voz del perfil elegido.
3. **Regla anti-alucinación.** En sus respuestas, el modelo **solo puede repetir números que ya están en el contexto** que la app le envía. Cada cifra tiene trazabilidad hasta su consulta.
4. **Perfiles.** Brigadista, autoridad o científico reciben el mismo dato explicado a su nivel. La app está en español, inglés y portugués.
5. **Seguridad.** Los consejos son generales y remiten siempre a las autoridades.
6. **Voz.** Voces neuronales de Edge con Piper como respaldo local. Cada frase sintetizada se guarda en caché.

Otras funciones con IA:
- **Extracción de reportes oficiales** (`ai/reports.py`). Convierte un PDF o una tabla desordenada en registros validados. El documento se trata como **dato**, no como instrucciones: se ignoran las órdenes que traiga dentro, cada registro se revalida, y lo que no está en el documento queda vacío y marcado para revisión.
- **Agente vigía.** Un boletín semanal automático por área suscrita.

### 2.10 Canales

| Canal | Qué ofrece |
|---|---|
| **App web** (React) | Mapa 3D con relieve y mapa base Blue Marble, detecciones como flamas, dibujo de áreas, calendario, pestañas de análisis, riesgo y contexto, página "Cómo armonizamos", ficha imprimible, plataforma para profesionales |
| **App Android** (Capacitor 8) | El mismo frontend compilado como app nativa: mapa satelital, calendario, modo campo y chat con Gotita |
| **Bot de Telegram** | Texto libre, ubicación compartida, notas de voz (transcripción local opcional con faster-whisper), `/semaforo`, `/hoy`, `/pronostico` y respuestas habladas |
| **Alertas por suscripción** | Un job diario evalúa cada área con el índice real. Envía solo suscripciones **aprobadas por un operador**, una vez por periodo, con mensajes marcados EJERCICIO/PRUEBA |
| **CAP** (Common Alerting Protocol) | Borradores que se crean, revisan y aprueban en la app. El feed Atom publica solo los **aprobados para ejercicio**, nunca con estado `Actual` |
| **API abierta** | REST documentada con OpenAPI. Cada respuesta lleva `methodology_version`, `data_cutoff`, la incertidumbre y la atribución a NASA FIRMS |
| **SIG** | OGC API Features (QGIS, ArcGIS) y exportación CSV, GeoJSON y KML |
| **Widget** | El calendario de cualquier área embebible en otro sitio |
| **SQL para científicos** | Consultas de solo lectura con descarga en CSV |
| **Servidor MCP** | 20 herramientas para que cualquier asistente de IA consulte el historial de fuego |

Las 20 herramientas del servidor MCP son:
- **Área y calendario:** `resolve_area`, `calendar`.
- **Análisis de la serie:** `season`, `analogs`, `return_period`, `weekday`, `night`, `regimes`.
- **Riesgo y pronóstico:** `risk`, `outlook`, `spread`, `wind_localities`.
- **Eventos y datos recientes:** `events`, `recent_hotspots`, `reported`.
- **Contexto:** `context`, `weather`.
- **Operación:** `bulletin`, `drill_scenario`, `watch`.

### 2.11 Datos casi en tiempo real

- Un job diario baja las detecciones NRT de FIRMS de las últimas 48 h y las guarda separadas del archivo científico.
- Como los datos NRT no traen la columna `type`, las fuentes no vegetales se filtran con una **máscara de fuentes fijas** (H3 r7) construida del histórico.
- **La serie armonizada científica nunca se sobrescribe con estimaciones provisionales.**

### 2.12 Arquitectura y despliegue

- **Contenedores:** Docker Compose con cinco servicios: la API (FastAPI), nginx (que sirve la web), el servidor MCP, el bot de Telegram y un scheduler.
- **Tareas del scheduler:** actualización NRT a las 06:10, alertas a las 06:30 y boletín los lunes a las 07:00.
- **Servidor:** una instancia AWS EC2.
- **Datos:** tablas Parquet particionadas por país y año, consultadas con **DuckDB** directamente desde los archivos, sin servidor de base de datos.
- **Mapa:** las capas se piden desde el navegador (NASA GIBS y relieve Terrarium).
- **Secretos:** solo en variables de entorno, nunca en el código ni en los registros.
- **Red:** todas las descargas de servidores de NASA fuerzan IPv4, porque en nuestra red se colgaban por IPv6.

---

## 3. ¿Qué beneficios ofrece?

- **Una sola serie de 25 años comparable.** Permite medir tendencias reales sin el artefacto de 2012 y sobrevive al retiro de MODIS.
- **Incertidumbre honesta.** Cada año estimado lleva su banda y cada país su nivel de confiabilidad. El usuario sabe cuánto puede confiar.
- **De datos a decisiones.** Pasa de "hubo 300 puntos de calor" a "esta temporada va por encima de lo normal, se parece a 2021, el próximo mes probablemente siga alta y estas son las celdas prioritarias".
- **Accesible para quien está en campo.** Brigadistas, protección civil y autoridades municipales lo usan sin saber de satélites: desde el celular, por Telegram o con una hoja impresa.
- **Útil para la ciencia.** Datos armonizados, versionados y con fecha de corte, con la metodología y la validación publicadas, listos para otros modelos.
- **Interoperable.** Habla los estándares de emergencias (CAP) y de SIG (OGC, KML), y se conecta a asistentes de IA (MCP).
- **Bajo costo.** Usa datos públicos y gratuitos, software abierto y una sola instancia en la nube.

## 4. ¿Cuál es el impacto previsto?

- **Prevención mejor dirigida.** Brigadas y recursos asignados con base en la historia real del fuego, el pronóstico y la exposición de la población, no solo en la intuición.
- **Memoria del fuego más allá de MODIS.** Un método abierto que conserva 2001–2011 y se extiende a otros países y sensores. El pipeline es global; hoy están procesados seis países: México, Argentina, Bolivia, Chile, Paraguay y Uruguay.
- **Evidencia para políticas públicas.** Saber si la temporada se adelanta, qué años fueron excepcionales y dónde hay fuego que no se reporta.
- **Alerta temprana responsable.** Siempre hay un humano en el circuito antes de comunicar algo a la población.
- **Casos piloto:**
  - Sierra de Arteaga, Coahuila, la región de la demo en Saltillo;
  - Chilecito, La Rioja (Argentina), donde ocurrió el incendio de julio de 2026 que menciona la autora del reto.

## 5. Herramientas, lenguajes, hardware y software

| Área | Tecnología |
|---|---|
| Datos de fuego | NASA FIRMS: MODIS C6.1 (Terra, Aqua), VIIRS S-NPP, NOAA-20, NOAA-21; archivo estándar y casi en tiempo real |
| Otros datos de NASA | MCD12Q1 (cobertura del suelo), MYD08_M3 (nubes), GFWED (índice meteorológico de incendio FWI, histórico y pronóstico GEOS-5), POWER (clima), GIBS/Blue Marble (mapa base), SRTM (elevación) |
| Otros datos | INEGI (marco geoestadístico, censo 2020), CONANP, CONAFOR, geoBoundaries, GeoNames, WDPA, NOAA ONI, Open-Meteo |
| Lenguajes | Python, TypeScript, SQL, HTML/CSS |
| Pipeline y ciencia | Python 3.12, DuckDB, Parquet (ZSTD), H3, NumPy, pandas, xarray, netCDF4, GeoPandas, Shapely, rasterio, pyproj, scikit-learn (k-means), SciPy, LightGBM |
| Backend | FastAPI, OpenAPI, OGC API Features, CAP 1.2, Atom |
| Frontend web | React 19, TypeScript, Vite, MapLibre GL (terreno 3D), Terra Draw, Recharts, h3-js, sistema de diseño Astryx con StyleX |
| App móvil | Capacitor 8 (Android), compilada desde el mismo código web |
| IA | Claude Haiku (API de Anthropic) con salidas estructuradas; Model Context Protocol (MCP); Edge TTS y Piper (voz); faster-whisper opcional (transcripción local) |
| Mensajería | API de bots de Telegram |
| Infraestructura | Docker, Docker Compose, nginx, AWS EC2, cron |
| Pruebas | pytest (157 pruebas) y Vitest |
| Material de presentación | HyperFrames (video desde HTML) y ElevenLabs (voz y efectos de sonido) |
| Hardware | Laptops con Arch Linux, un teléfono Android para pruebas y una instancia de AWS EC2 |

## 6. ¿En qué sentido es creativo?

- **Hace visible la armonización.** La app muestra el "salto falso" de 2012 y cómo desaparece, con la validación publicada dentro de la propia herramienta, en lugar de esconder la corrección.
- **Calibra por régimen de fuego, no con un factor global.** Cada tipo de paisaje se corrige según su propio comportamiento, y los regímenes se aprenden solo de MODIS para que valgan antes de 2012.
- **Usa la vecindad hexagonal** para estimar fuego donde MODIS no vio nada pero VIIRS probablemente sí.
- **Se valida contra la realidad en tierra.** Los reportes de CONAFOR, independientes de cualquier satélite, confirman que la serie armonizada sigue a los incendios reales (0.80 contra −0.00 de la serie cruda).
- **El calendario como forma de leer el fuego.** Años × meses convierte 25 años en una imagen que se entiende de un vistazo.
- **Análisis poco comunes** en una herramienta de fuego: años análogos, periodo de retorno, la "firma humana" del día de la semana y el fuego nocturno.
- **IA confiable por diseño.** Gotita tiene personalidad, pero no puede inventar números.
- **Un solo núcleo, muchas puertas.** Las mismas herramientas sirven a la web, la app Android, Telegram, la API y cualquier asistente vía MCP.

## 7. ¿Qué factores tuvo en cuenta el equipo?

- **Rigor científico:**
  - validación contra una línea base ingenua;
  - validaciones independientes (quiebre de 2012, CONAFOR, segundo modelo);
  - incertidumbre visible y confiabilidad por país;
  - versión del método y fecha de corte en cada salida;
  - ninguna cifra escrita a mano.
- **Evitar fugas de información en el pronóstico:** partición temporal estricta, climatologías expansivas y un periodo de prueba que no se tocó hasta el final.
- **Uso responsable de la IA:**
  - el modelo no genera cifras ni coordenadas;
  - los documentos externos se tratan como datos, no como instrucciones;
  - las alertas requieren aprobación humana y van marcadas como ejercicio.
- **Usuarios reales:**
  - brigadistas con poca señal y manos ocupadas (Telegram, notas de voz, app móvil);
  - tomadores de decisiones que necesitan una hoja impresa;
  - científicos que necesitan datos y SQL.
- **Accesibilidad:** rampas de color aptas para daltonismo, español, inglés y portugués, respuestas habladas, y texto legible también al imprimir.
- **Atribución:** NASA FIRMS citado en la app, la API, el widget y las descargas.
- **Costo y apertura:** datos gratuitos, software abierto e infraestructura pequeña que una institución puede replicar.
- **Privacidad y seguridad:** secretos fuera del código, identificadores de Telegram enmascarados y registros sin el texto de los mensajes.
- **Tiempo de la hackathon (48 h):**
  - primero lo esencial de punta a punta (armonización, calendario y gráfica de 2012);
  - lo que no estaba completo se ocultó en lugar de mostrarse roto.
- **Límites declarados:**
  - 2001–2011 no se puede validar directamente contra VIIRS;
  - los biomas son de un solo año;
  - un punto de calor no es área quemada;
  - Chile, Uruguay y Bolivia tienen confiabilidad baja;
  - la superresolución "VIIRS virtual" y la capa geoestacionaria GOES quedan como trabajo futuro.
