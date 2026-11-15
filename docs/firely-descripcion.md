# Firely — Descripción detallada del proyecto

**NASA Space Apps Challenge 2026 · Reto: Armonización de puntos de calor de MODIS y VIIRS**

> Firely rescata 20 años de historia de fuego que se perderían con el retiro de MODIS, y la convierte en alertas que cualquier brigadista entiende.

El nombre combina *fire* (fuego) con la terminación amigable *-ly*: una herramienta cercana y fácil de usar para un problema serio. Funciona igual en inglés y en español, que es justo el público de la demo local (Saltillo) y del jurado global.

> Nota de marca: ya existe una empresa llamada Firely (software de salud, estándar FHIR) y el dominio `firely.com` está ocupado. No compite con el proyecto, pero el repositorio y la URL de la demo deben usar un identificador propio (por ejemplo, `firely-fire` o `getfirely`). En este documento `firely.app` es un marcador de posición.

Este documento describe **qué es** Firely y **cómo funciona** cada parte. El orden de construcción, los responsables y los tiempos están en `firely-plan.md`.

---

## Índice

0. Resumen ejecutivo
0.1 Factores diferenciadores
1. El problema
2. Usuarios y casos de uso
3. Principios de diseño
4. Datos de entrada
5. Metodología de armonización
6. Modelo de datos
7. La aplicación
8. Módulos de análisis
9. Salidas y descargas
10. Alertas
11. Capa de inteligencia artificial
12. Plataforma
13. Arquitectura, stack y entorno
14. Accesibilidad
15. Ciencia abierta
16. Fuentes de datos y licencias
17. Limitaciones conocidas
18. Glosario

---

## 0. Resumen ejecutivo

Firely es una aplicación web y una plataforma de datos que:

1. **Armoniza** los puntos de calor de MODIS (2000–hoy) y VIIRS (2012–hoy) en una sola serie consistente, donde el sensor de origen deja de importar.
2. **Presenta** esa serie como un calendario de actividad de quemas (años × meses) para cualquier área del mundo, seleccionada con lenguaje natural, dibujo en mapa, coordenadas o división administrativa.
3. **Analiza** el calendario para responder seis preguntas: qué pasó, si es normal, qué incendio es y cómo se compara, por qué, a quién afecta y qué podría venir.
4. **Ayuda a decidir** con un semáforo del mes actual, un índice de prioridad de prevención y una ficha de situación de una página.
5. **Se abre como plataforma**: API documentada, widget embebible, servidor MCP para asistentes de IA, alertas en el estándar CAP y datos abiertos con DOI.

Lo que lo distingue, en resumen (la lista completa está en §0.1):

- Una armonización científicamente defendible y **visible**: pares de satélites con el mismo horario de paso, quantile mapping por bioma y mes, dos métricas (conteo y FRP), corrección por nubes, superresolución y validación publicada contra una corrección ingenua.
- Análisis que responden lo que pide el reto y más: comparación de incendios, años análogos, temporada que se mueve, periodo de retorno, firma humana, regímenes de fuego.
- Alerta temprana real: semáforo, riesgo próximo, cono de propagación, exposición, índice de prioridad, alertas CAP.
- Una capa de IA que **nunca inventa cifras**: selección de área por lenguaje natural, asistente, agente vigía y comunicados con aprobación humana.
- Plataforma abierta: API, widget, servidor MCP, OGC y datos con DOI.
- Pensado para campo y para todos: bot con notas de voz, modo offline, sonificación, multilenguaje y accesibilidad.

---

## 0.1 Factores diferenciadores

Todo lo que distingue a Firely de un dashboard de puntos de calor, agrupado por tipo de ventaja. La columna "Sección" indica dónde está el detalle técnico.

### Ciencia y armonización

| Diferenciador | Por qué es diferente | Sección |
|---|---|---|
| Razón mensual VIIRS/MODIS por grupos de celdas | Calibración por régimen de fuego o bioma, elegida por validación año-fuera frente a un factor fijo | §5.3–5.4 |
| Dos métricas armonizadas: conteo y FRP | La energía radiativa depende menos de la resolución; si ambas coinciden, se validan entre sí | §5.5 |
| Corrección por nubes | Distingue "no hubo fuego" de "no se pudo ver" | §5.6 |
| Superresolución "VIIRS virtual" | Reconstruye 2000–2011 con el detalle del sensor nuevo | §5.7 |
| Validación contra una línea base ingenua | Demuestra con una cifra que el método es mejor que multiplicar por un factor fijo | §5.8 |
| Incertidumbre visible | Bandas de error en los años estimados, en lugar de ocultarlas | §5.8, §7.3 |
| Página "Cómo armonizamos" | El método explicado y validado dentro de la propia app | §5.10 |
| Versionado metodológico | Cada dato dice con qué versión del método se produjo | §5.11 |

### Análisis que nadie más va a tener

| Diferenciador | Por qué es diferente | Sección |
|---|---|---|
| Comparar incendios, no solo puntos | Responde la frase del reto "cómo se compara un incendio actual con los anteriores" | §8.1 |
| Años análogos | Pronóstico de cierre de temporada usando solo la historia armonizada | §8.2 |
| La temporada se mueve | "La temporada empieza X días antes": clima y fuego en una frase | §8.3 |
| Periodo de retorno | Lenguaje de protección civil: "una vez cada 25 años" | §8.4 |
| Agrícola vs forestal | Separa quemas agrícolas de incendios forestales, como menciona el reto | §8.5 |
| Efecto día de la semana | Detecta la firma humana del fuego | §8.6 |
| Fuego nocturno | Señala fuegos persistentes y peligrosos | §8.7 |
| Recurrencia | Dónde vuelve a arder y dónde se acumula combustible | §8.8 |
| Regímenes y cambio de régimen | Mapa de tipos de comportamiento del fuego y dónde cambiaron | §8.9 |
| Contexto meteorológico con NASA POWER | Explica el porqué, no solo el qué | §8.10 |
| El Niño / La Niña | Explica las anomalías interanuales del calendario | §7.3 |
| Detectados vs reportados | Revela fuego que no se está reportando | §8.15 |

### Alerta temprana y decisión

| Diferenciador | Por qué es diferente | Sección |
|---|---|---|
| Semáforo del mes actual | Compara el presente con la historia de forma inmediata | §7.4 |
| Curva de ritmo de temporada | "Vamos por encima del percentil 90 para esta fecha" en una gráfica | §7.4 |
| Riesgo próximo con NASA GFWED | Pasa de "qué pasó" a "qué puede pasar esta semana" | §8.11 |
| Cono de propagación | Hacia dónde podría avanzar el fuego, como describe la autora del reto | §8.12 |
| Exposición y localidades a favor del viento | Traduce detecciones a riesgo para personas | §8.13, §8.14 |
| Índice de prioridad de prevención | Toda la información sintetizada en "dónde poner a las brigadas" | §8.16 |
| Ficha de situación en PDF | Lista para una reunión de coordinación en 30 segundos | §9 |
| Alertas por suscripción y en formato CAP | Habla el idioma de los sistemas de emergencia | §10 |
| Capa geoestacionaria GOES (visión) | Detección en minutos y método abierto a más sensores | §7.4 |

### Inteligencia artificial confiable

| Diferenciador | Por qué es diferente | Sección |
|---|---|---|
| Área y fechas por lenguaje natural | Una frase define área, periodo y pregunta; ninguna herramienta de fuego funciona así | §7.2 |
| Regla anti-alucinación | El LLM nunca calcula cifras ni genera coordenadas; todo viene de la serie armonizada | §11.1 |
| "Ver datos" en cada cifra | Trazabilidad total de cada número | §11.1 |
| Asistente analista con UI generativa | Responde con componentes de la app, no solo con texto | §11.2 |
| Explicaciones según perfil | Brigadista y científico reciben el mismo dato a su nivel | §11.2 |
| Agente vigía con boletín semanal | La herramienta avisa sin que nadie pregunte | §11.2 |
| Extracción de reportes oficiales | Hace viable comparar con estadísticas en PDF | §11.2 |
| Borradores de comunicados con aprobación humana | Uso responsable de IA en emergencias | §11.2 |
| Consultas SQL para científicos | Profundidad sin perder transparencia | §11.2 |
| Escenarios de simulacro | Usa la historia real del área para entrenar brigadas, etapa por etapa | §11.2 |

### Plataforma abierta

| Diferenciador | Por qué es diferente | Sección |
|---|---|---|
| API documentada | Cualquier institución puede usar los datos armonizados | §12.1 |
| OGC API Features y GeoJSON/KML | Directo a QGIS, ArcGIS y Google Earth | §12.2, §9 |
| Widget embebible | Cualquier sitio muestra el calendario con dos líneas de código | §12.3 |
| Servidor MCP | Cualquier asistente de IA puede consultar el historial de fuego | §12.4 |
| Consultas en el navegador con DuckDB-WASM | 25 años de datos consultados al instante, sin servidor de base de datos | §13 |
| Ciencia abierta con DOI | Dataset y método reproducibles y citables | §15 |

### Acceso, accesibilidad y experiencia

| Diferenciador | Por qué es diferente | Sección |
|---|---|---|
| Bot con notas de voz | Llega a brigadistas en campo con mala conexión y manos ocupadas | §11.2 |
| Modo offline móvil (pendiente) | Consulta sin señal en la sierra | §12.5 |
| Descripciones accesibles automáticas | Gráficas comprensibles con lector de pantalla | §14 |
| Sonificación del calendario | 25 años de fuego que se escuchan; accesibilidad y momento memorable | §7.6 |
| Multilenguaje ES/EN/PT | Toda Latinoamérica, incluido Brasil | §11.2 |
| Rampas de color accesibles | Aptas para daltonismo, como pide el reto | §14 |
| Modo historia | Cualquier área convertida en un relato | §7.6 |
| Animación de 25 años en 30 segundos | El fuego del planeta en movimiento | §7.6 |
| Comparador lado a lado | Dos áreas o periodos con la misma escala | §7.3 |

Los factores de ejecución que ayudan a ganar (validación con un usuario real, la cifra de validación, un hallazgo propio, materiales de envío pulidos, identidad visual y transmisión en vivo) están en `firely-plan.md`, §14.

---

## 1. El problema

### 1.1 Contexto

Los satélites de observación de la Tierra detectan anomalías térmicas (puntos de calor) causadas por incendios forestales, quemas agrícolas, actividad volcánica y procesos industriales. Con más de dos décadas de detecciones es posible construir **calendarios de actividad de quemas**: matrices que muestran cuántos puntos de calor hubo en cada mes de cada año en un área. Estos calendarios permiten identificar temporadas críticas, anomalías y tendencias, y comparar la actividad actual con la historia.

### 1.2 Los sensores

| Satélite | Sensor | Datos desde | Resolución de detección | Paso aproximado (hora local) | Situación |
|---|---|---|---|---|---|
| Terra | MODIS | 2000 | ~1 km | ~10:30 y ~22:30 | Al final de su vida operativa, con deriva orbital |
| Aqua | MODIS | 2002 | ~1 km | ~13:30 y ~01:30 | Al final de su vida operativa, con deriva orbital |
| Suomi-NPP | VIIRS | 2012-01-20 | 375 m | ~13:30 y ~01:30 | **Dejó de entregar datos el 2 de noviembre de 2026** |
| NOAA-20 | VIIRS | 2018-04-01 | 375 m | ~13:30 y ~01:30 (desfasado ~50 min de S-NPP) | Operativo |
| NOAA-21 | VIIRS | 2023-03-01 | 375 m | ~13:30 y ~01:30 | Operativo |

Fechas de disponibilidad según el formulario de descarga de FIRMS: MODIS Terra desde el 1 de noviembre de 2000, MODIS Aqua desde el 4 de julio de 2002.

> **Contexto de noviembre de 2026.** NOAA anunció que Suomi-NPP dejó de entregar nuevos datos científicos el 2 de noviembre de 2026, y recomienda migrar a NOAA-20 y NOAA-21. Su archivo 2012–2026 sigue disponible y sigue siendo la serie VIIRS más larga. Esto refuerza el problema del reto: no hay una sola transición de sensores sino varias, y un método de armonización tiene que estar preparado para todas. Firely está diseñado así.

### 1.3 Por qué no se pueden comparar directamente

- **Resolución:** un píxel MODIS cubre ~1 km²; uno VIIRS de 375 m cubre ~0.14 km². VIIRS detecta incendios mucho más pequeños y un mismo incendio produce más puntos.
- **Sensibilidad:** los algoritmos y las bandas son distintos, así que el umbral mínimo de detección no es el mismo.
- **Horarios de observación:** Terra pasa a media mañana; Aqua y VIIRS al inicio de la tarde. El fuego tiene un ciclo diario (más activo por la tarde), así que el horario cambia cuánto se detecta.
- **Número de satélites:** desde 2018 hay dos VIIRS, desde 2023 tres, y desde noviembre de 2026 vuelven a ser dos (NOAA-20 y NOAA-21); el número de oportunidades de observación cambia con el tiempo.
- **Deriva orbital:** en sus últimos años, Terra y Aqua han dejado de corregir su órbita y su hora de paso se ha ido desplazando.

### 1.4 La consecuencia

Si se unen las series sin corregir, la actividad de fuego parece **multiplicarse de golpe en 2012**, cuando en realidad solo cambió el sensor. Con el retiro de MODIS, sin un método de armonización se pierde la comparabilidad de la serie histórica y los gestores se quedan sin un calendario confiable.

**Analogía para el pitch:** es como comparar fotos de una cámara vieja de 1 megapixel con las de un celular nuevo. El celular "ve" más incendios, pero no porque haya más fuego.

---

## 2. Usuarios y casos de uso

### 2.1 Perfiles

| Perfil | Necesita | Cómo lo usa en Firely |
|---|---|---|
| Brigadista / bombero forestal | Saber si la temporada viene fuerte y dónde enfocarse, desde campo y con mala conexión | Bot con notas de voz, app móvil offline, semáforo, índice de prioridad |
| Protección civil / respuesta a emergencias | Comparar la situación actual con la historia y comunicar | Calendario, periodo de retorno, ficha PDF, alertas CAP, borradores de comunicados |
| Científico | Series consistentes, metodología transparente, datos descargables | Metodología, incertidumbre, CSV, API, SQL avanzado, notebook reproducible |
| Gestor de tierras / áreas protegidas | Patrones de largo plazo, recurrencia, tendencias | Recurrencia, regímenes, temporada que se mueve, agrícola vs forestal |
| Desarrollador / otra institución | Integrar los datos en sus sistemas | API, widget, MCP, OGC API Features, CAP |

### 2.2 Escenarios

**Escenario 1 — Inicio de temporada.** Una coordinadora de protección civil escribe "¿cómo va la temporada de incendios en el sureste de Coahuila?". Firely resuelve el área, muestra que marzo va 2.8 veces sobre la mediana, que la temporada se adelantó y que los tres años más parecidos cerraron con actividad alta. Descarga la ficha PDF para la reunión de coordinación.

**Escenario 2 — Incendio activo.** Un brigadista manda una nota de voz al bot: "¿hay fuego cerca de la sierra de Arteaga?". Recibe las detecciones de las últimas 24 horas, el ranking del evento frente a incendios históricos y la dirección probable de propagación.

**Escenario 3 — Investigación.** Una investigadora consulta si la temporada de fuego en pastizales del norte de México se ha adelantado. Usa el módulo de temporada, revisa la incertidumbre de los años solo-MODIS y descarga los agregados con su versión metodológica.

**Escenario 4 — Integración.** El sitio web de una dependencia incrusta el widget del calendario de su estado con dos líneas de código.

---

## 3. Principios de diseño

1. **El sensor de origen deja de importar.** Toda vista usa la serie armonizada; el origen queda disponible como dato, no como obstáculo.
2. **Cifras con contexto.** Nunca "347 puntos" solo; siempre "347 puntos, 3.4 veces la mediana de marzo".
3. **La incertidumbre se muestra, no se esconde.** Años estimados, celdas nubladas y bandas de error son visibles.
4. **Lenguaje de quien decide.** Periodos de retorno, semáforos y prioridades en lugar de jerga estadística, con el detalle técnico disponible para quien lo pida.
5. **El LLM no inventa.** Interpreta, consulta y redacta; los números y las coordenadas siempre vienen de datos verificables.
6. **Humano en el circuito.** Nada se publica hacia la población sin aprobación de una persona.
7. **Accesible por diseño.** Colores aptos para daltonismo, lectores de pantalla, sonido, varios idiomas.
8. **Abierto.** API, widget, estándares (CAP, OGC) y datos con DOI.
9. **Atribución.** NASA FIRMS y cada fuente se citan en la app, la API, el widget y las descargas.

---

## 4. Datos de entrada

### 4.1 Puntos de calor (NASA FIRMS)

FIRMS ofrece dos tipos de datos:

- **Archivo científico (Standard Processing, SP):** la serie histórica procesada con la mejor calidad. Base de la armonización.
- **Casi tiempo real (NRT):** detecciones disponibles horas después del paso del satélite. Base de la capa de 24/48 h y de la actualización diaria.

Formas de acceso (todas requieren cuenta de Earthdata o código por correo):

- **Resúmenes anuales por país** (*Country Yearly Summary*): un ZIP por año e instrumento con un CSV por país de todo el mundo, más un `AttributesReadme.txt` que define las columnas. Solo existen para **MODIS** (2000–2025) y **VIIRS NOAA-20** (2018–2025). **No hay resúmenes anuales de S-NPP ni de NOAA-21.**
- **Solicitudes personalizadas** (*Archive Download*): por país, región dibujada o área protegida; por fuente, rango de fechas y formato (CSV, shapefile, JSON). El equipo de FIRMS las revisa y aprueba; llegan por correo en minutos u horas. Se usan para S-NPP, NOAA-21 y el año en curso. Opción de *buffer* alrededor del país: se usa 0 km para que la definición del área sea idéntica en todos los años.
- **API de área** con una MAP_KEY gratuita, por fuente (`MODIS_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, productos SP, etc.), rectángulo y rango de 1 a 10 días por consulta. Cada día consultado cuenta como una transacción; el límite es de 5,000 transacciones por cada 10 minutos. Se usa solo para lo reciente (capa 24/48 h e ingesta diaria), nunca para la historia.

**Nomenclatura de FIRMS** (aparece en nombres de archivo y en la columna `satellite`):

| Nombre en FIRMS | Satélite |
|---|---|
| `MODIS C6.1`, `modis` (columna `satellite` = `Terra`/`Aqua` o `T`/`A`) | Terra y Aqua |
| `SUOMI VIIRS C2`, `suomi`, `snpp`, `N` | Suomi-NPP |
| `J1 VIIRS C2`, `viirs-jpss1`, `N20` | NOAA-20 |
| `J2 VIIRS C2`, `viirs-jpss2`, `N21` | NOAA-21 |

Los datos de casi tiempo real se reemplazan por datos de calidad científica (SP) unos meses después; el pipeline debe preferir SP cuando exista y deduplicar.

**Campos principales**

| Campo | MODIS | VIIRS | Uso en Firely |
|---|---|---|---|
| `latitude`, `longitude` | Centro del píxel | Centro del píxel | Ubicación, asignación a celda H3 |
| `acq_date`, `acq_time` | Fecha y hora UTC | Fecha y hora UTC | Serie temporal, día/noche, día de la semana |
| `satellite` | Terra / Aqua | N (S-NPP), N20, N21 | Separación por plataforma para calibrar |
| `confidence` | 0–100 | low / nominal / high | Filtrado y homologación |
| `frp` | MW | MW | Segunda métrica armonizada |
| `brightness` / `bright_ti4` | K | K | Control de calidad |
| `scan`, `track` | Tamaño real del píxel | Tamaño real del píxel | Corrección por geometría de observación |
| `daynight` | D / N | D / N | Fuego nocturno |
| `type` (archivo) | 0–3 | 0–3 | Excluir no-vegetación |

**Valores de `type`:** 0 = presunto fuego de vegetación, 1 = volcán activo, 2 = otra fuente estática terrestre, 3 = detección offshore. Firely solo usa `type = 0`. Los datos NRT no incluyen `type`; para ellos se usa una máscara de fuentes estáticas construida con el archivo (celdas que históricamente tienen `type = 2`).

### 4.2 Datos complementarios

| Dato | Fuente | Para qué |
|---|---|---|
| Cobertura del suelo | MODIS Land Cover (MCD12Q1, 500 m, anual, clasificación IGBP) | Biomas de la armonización, clasificación agrícola/forestal |
| Fracción de nubes | MODIS-Aqua nivel 3 mensual (MYD08_M3 v6.1, *Cloud Fraction from Cloud Mask, Mean of Daily Mean*, 1°), recortado con NASA Giovanni; a futuro, máscara de fuego diaria (MOD14A1/MYD14A1, 1 km) | Corrección por nubes |
| Meteorología histórica | NASA POWER (precipitación, temperatura, humedad, viento) | Contexto meteorológico |
| Peligro meteorológico de incendio | NASA GISS GFWED (sistema FWI), versión MERRA2.CORRECTED, servida por el NCCS Dataportal; pronóstico de 8 días con GEOS-5 | Riesgo próximo |
| Viento pronosticado | Servicio de pronóstico abierto (por ejemplo, Open-Meteo) | Cono de propagación, localidades a favor del viento |
| El Niño / La Niña | Índice ONI de NOAA | Contexto interanual |
| Geoestacionario | NOAA GOES-East/West, producto ABI de detección de fuego (FDC), datos abiertos | Capa casi en vivo (visión) |
| Límites administrativos | INEGI Marco Geoestadístico (México), GADM o geoBoundaries (mundo) | Selección de área |
| Geocodificación | OpenStreetMap / Nominatim | Selección por lenguaje natural |
| Localidades y población | INEGI localidades, GeoNames, GHSL o WorldPop | Exposición |
| Áreas protegidas | CONANP (México), Protected Planet / WDPA (mundo) | Exposición |
| Incendios reportados | CONAFOR y otras fuentes oficiales | Detectados vs reportados |
| Relieve | Modelo digital de elevación (por ejemplo, SRTM) | Superresolución |

### 4.3 Datos obtenidos para el proyecto

Estado al 14 de noviembre de 2026. Todo lo que sigue ya está descargado (ver el detalle técnico de cada archivo en `CLAUDE.md`).

| Fuente | Cobertura | Periodo | Cómo se obtuvo |
|---|---|---|---|
| FIRMS MODIS | Mundo (todos los países) | 2000–2025 | Resúmenes anuales por país |
| FIRMS VIIRS NOAA-20 | Mundo | 2018–2025 | Resúmenes anuales por país |
| FIRMS VIIRS S-NPP | México y Argentina | 2012-01-20 → 2025-12-31 | Solicitud personalizada |
| FIRMS VIIRS NOAA-21 | México y Argentina | 2023-03-01 → 2025-12-31 | Solicitud personalizada |
| FIRMS 2026, cuatro fuentes | México, y mundo completo | 2026-01-01 → 2026-11-14 | Solicitudes personalizadas |
| MCD12Q1 v061, capa `LC_Type1` | México y Argentina | 2001 → último año publicado | AppEEARS, GeoTIFF, EPSG:4326 |
| SRTMGL1 v003 (elevación, 30 m) | Coahuila | Levantamiento de 2000 | AppEEARS, GeoTIFF |
| MYD08_M3 fracción de nubes | Coahuila (lon −104 a −99.8, lat 24.5 a 29.9) | 2002-07 → 2026-10 (292 meses) | NASA Giovanni, NetCDF |
| GFWED FWI diario (MERRA2.CORRECTED) | Coahuila con margen | 2017 → ~mediados de 2026 (ampliable a 2012) | NCCS Dataportal, script propio que recorta y borra los globales |
| GFWED promedio de largo plazo | Coahuila | 1981–2010, por mes | NCCS Dataportal |
| Marco Geoestadístico, Censo 2020 | México | 2020 | INEGI, shapefile |
| ITER 2020 (población por localidad) | México | 2020 | INEGI, CSV nacional |
| Áreas Naturales Protegidas | México | 2024 | CONANP vía IDEFOR, shapefile |
| Incendios reportados | México | 2010–2024 | CONAFOR vía IDEFOR (2010–2019, 2015–2020, 2021, 2022, 2023, 2024) |
| Límites administrativos | Argentina | ADM1 2006, ADM2 2020 | geoBoundaries |
| Localidades con población | Argentina | Vigente | GeoNames (`AR.zip`) |
| Áreas protegidas | Argentina | Vigente | Protected Planet / WDPA, shapefile |
| Índice ONI | Global | 1950–hoy | NOAA CPC |

**Lecciones de la descarga que afectan al desarrollo:**

- Los servidores de NASA (Giovanni, NCCS, Earthdata) **se quedan colgados por IPv6** en la red del equipo: las conexiones se quedan en `SYN-SENT`. Todo código que descargue de NASA debe forzar IPv4 (ver §13.5).
- El Data Library de Columbia (IRI) también sirve GFWED, pero sus datos terminan en 2015 y el servicio está por cerrar; por eso se usa el NCCS Dataportal.
- GFWED se distribuye como un archivo global diario de ~4 MB; bajar la serie completa son decenas de GB de tráfico. La estrategia es descargar, recortar el área y borrar el global en el mismo paso.

---

## 5. Metodología de armonización

El objetivo es producir, para cada celda y cada periodo, un valor de actividad de fuego **en unidades equivalentes a VIIRS**, de modo que 2003 y 2023 sean comparables.

### 5.1 Unidad espacial: malla H3

Todos los puntos se asignan a hexágonos del sistema H3 de Uber:

| Resolución H3 | Área promedio | Uso |
|---|---|---|
| 5 | ~250 km² | Mapas continentales, regímenes, agregados globales |
| 6 | ~36 km² | Unidad principal de armonización y calendario |
| 7 | ~5 km² | Detalle local, recurrencia, exposición |

Los hexágonos tienen vecinos equidistantes y área casi uniforme, lo que facilita agregaciones y suavizados. Un área seleccionada por el usuario se convierte en el conjunto de celdas H3 que la cubren.

### 5.2 Limpieza

1. Excluir `type` ≠ 0 (volcanes, fuentes estáticas, offshore).
2. Homologar confianza:
   - MODIS: confianza ≥ 30 se considera válida (umbral configurable).
   - VIIRS: `nominal` y `high` válidas; `low` excluida en la serie principal.
   - Se guarda una bandera de confianza homologada (`baja`, `nominal`, `alta`) para análisis de sensibilidad.
3. Eliminar duplicados exactos (mismo satélite, fecha, hora y ubicación).
4. Para NRT, aplicar la máscara histórica de fuentes estáticas.

### 5.3 Calibración en el periodo de traslape

Desde 2012 MODIS y VIIRS observan simultáneamente. Ese traslape (2012 en adelante) es el conjunto de entrenamiento.

**Versión implementada (v1.2).** La referencia es un satélite S-NPP VIIRS. La calibración usa los totales mensuales de S-NPP y MODIS Terra+Aqua en el traslape; no requiere pares de pasos casi coincidentes. Por cada mes del año y grupo de celdas calcula la razón entre detecciones de ambos sensores. Los grupos son regímenes de fuego derivados solo de MODIS, biomas IGBP o su combinación, según el país. Los años anteriores a 2012 se estiman con los factores aprendidos de 2012–2021, etapa elegida para limitar el efecto de deriva orbital. La selección del modelo se valida ocultando un año completo a la vez entre 2012 y 2025 y comparando el error anual con una corrección fija simple. Los resultados y limitaciones por país están en [Cómo armonizamos](metodologia-armonizacion.md).

**Terra se calibra por separado para enero de 2001 a julio de 2002**, cuando Aqua todavía no aportaba una serie completa. Desde agosto de 2002, el predictor es Terra+Aqua: tuvo menor error anual que Aqua sola en los seis países evaluados.

**NOAA-20 y NOAA-21** no se suman a S-NPP en la serie histórica, para evitar saltos al entrar nuevos satélites. Cuando S-NPP ya no está disponible y NOAA-20 sí, NOAA-20 se escala con su razón frente a S-NPP medida en el traslape. NOAA-21 queda como fuente de apoyo; su sustitución requerirá calibración adicional.

**Continuidad tras el apagado de S-NPP.** S-NPP fue la referencia VIIRS de 2012 a noviembre de 2026. Para que la serie no salte al dejar de existir, NOAA-20 se intercalibra contra S-NPP en su periodo común y toma su lugar como referencia cuando falta S-NPP. NOAA-21 sigue siendo una fuente de apoyo; antes de usarlo como referencia hará falta validar su calibración contra NOAA-20. El mismo procedimiento de traslape puede aplicarse a un sensor futuro.

**Deriva orbital.** La relación VIIRS/MODIS se revisa por año y la calibración retrospectiva se restringe a 2012–2021. No hay una corrección explícita del cambio de horario de paso; se informa como limitación.

### 5.4 Razón mensual por grupo de celdas y reparto en dos partes

Para cada combinación de **grupo de celdas** y **mes del año**:

1. Se calcula la razón de conteos S-NPP/MODIS del grupo durante el traslape.
2. La actividad MODIS mensual del grupo se multiplica por esa razón para estimar un total en unidades de S-NPP.
3. Ese total se reparte entre celdas con actividad MODIS, proporcionalmente a sus conteos, y entre celdas con cero MODIS según la actividad del grupo y de sus vecinas H3.

**Tratamiento de ceros.** Los conteos tienen muchísimos ceros (celdas sin fuego). El reparto usa dos partes:

- **Con detección MODIS:** los conteos se ponderan por la razón positiva del grupo.
- **Sin detección MODIS:** reciben una asignación estimada con el total regional del mes y, cuando aplica, la actividad de las seis celdas vecinas.

El resultado se normaliza para conservar el total estimado del grupo. No se aplica quantile mapping de distribuciones empíricas: esa era la propuesta inicial, sustituida por el método v1.2 tras la validación.

Se prueban cuatro agrupaciones: factor mensual por país, régimen de fuego con vecindad, bioma IGBP con vecindad y bioma × régimen con vecindad. Se publica la elegida para cada país y su incertidumbre; el [notebook reproducible](../notebooks/armonizacion-coahuila.ipynb) ejecuta el método y la validación sobre una región de ejemplo.

### 5.5 Dos métricas armonizadas

- **Conteo de puntos de calor** en unidades VIIRS equivalentes. Es la métrica del calendario por defecto.
- **FRP acumulado** (Fire Radiative Power, en MW, sumado por celda y periodo). Al ser energía radiativa, depende menos de la resolución que el conteo, aunque también requiere calibración por la diferencia en fuegos pequeños no detectados.

Si ambas métricas muestran la misma tendencia y estacionalidad tras armonizar, se validan mutuamente. Si divergen, se reporta y se investiga.

### 5.6 Corrección por nubes

Un mes con pocos puntos puede ser tranquilo o nublado. Firely distingue entre "no hubo fuego" y "no se pudo observar".

- **Versión implementada (región piloto, Coahuila):** fracción de nubes mensual de MODIS-Aqua (MYD08_M3 v6.1, variable *Cloud Fraction from Cloud Mask, Mean of Daily Mean*, día y noche combinados), a 1°, de julio de 2002 a octubre de 2026. Cada celda H3 toma el valor de la celda de 1° que la contiene, y la fracción de cielo despejado es `1 − fracción de nubes`. Se usa la versión día + noche porque los satélites detectan fuego en ambos pasos. Antes de julio de 2002 (sin Aqua) la bandera de visibilidad no se calcula y se indica así.
- **Versión global:** el mismo producto se puede pedir en Giovanni para cualquier región, siempre recortado (el archivo global mensual pesa cientos de MB).
- **Versión precisa (siguiente fase):** la máscara de fuego diaria de MODIS (MOD14A1/MYD14A1), que clasifica cada píxel como nube, agua, tierra sin fuego o fuego y permite contar exactamente cuántas observaciones válidas hubo.

Uso:

- **Bandera de visibilidad:** si la fracción observada está por debajo de un umbral, la celda del calendario se marca con un patrón rayado ("dato poco confiable").
- **Valor corregido opcional:** conteo dividido entre la fracción observada, con un tope para evitar amplificar ruido. Se presenta como vista alternativa, nunca sustituye silenciosamente el valor observado.

### 5.7 Superresolución histórica ("VIIRS virtual")

Extensión experimental para una región piloto.

- **Objetivo:** estimar, a resolución H3 7 u 8, dónde habría detectado VIIRS en 2000–2011.
- **Entrenamiento:** en el traslape, la variable a predecir es si VIIRS detectó fuego en la celda fina; las variables de entrada son las detecciones MODIS en la celda gruesa y sus vecinas, FRP MODIS, cobertura del suelo, elevación, pendiente, mes e historial de fuego de la celda.
- **Modelo:** gradient boosting (LightGBM o XGBoost).
- **Evaluación:** años completos fuera del entrenamiento; métricas AUC y error en conteos agregados.
- **Presentación:** mapa de antes/después en la región piloto, con su métrica de desempeño. Se rotula claramente como estimación.

### 5.8 Validación

**Diseño:** validación cruzada dejando un año fuera en el traslape. Se calibra con todos los años menos uno, se armoniza MODIS de ese año y se compara contra lo que realmente vio VIIRS.

**Métricas:**

| Métrica | Qué mide |
|---|---|
| Sesgo medio | Si se sobreestima o subestima sistemáticamente |
| Error absoluto medio (MAE) y RMSE | Tamaño del error por celda-mes |
| Correlación de Spearman | Si se preserva el orden (meses más y menos activos) |
| Error en el pico estacional | Si el mes de máxima actividad coincide |
| Error por bioma | Dónde funciona mejor o peor el método |

**Línea base ingenua:** multiplicar MODIS por un factor fijo global (la razón media VIIRS/MODIS). La cifra clave del proyecto es cuánto reduce el error Firely frente a esa línea base.

**Incertidumbre:** de la dispersión de errores en la validación se derivan bandas para los valores estimados de 2000–2011, que se muestran en el calendario y en las gráficas.

### 5.9 Gráfica estrella

Serie anual de una región con tres líneas: MODIS sin armonizar, VIIRS y la serie armonizada de Firely. Sin armonizar se ve un escalón abrupto en 2012; armonizada, la serie es continua y coherente con VIIRS en el traslape.

### 5.10 Página "Cómo armonizamos"

Dentro de la app. Explica el método en pocos pasos visuales, muestra la gráfica estrella, publica las métricas de validación y la mejora frente a la línea base, describe las limitaciones y enlaza al dataset y notebook abiertos. Debe convencer a un científico y entenderse por un brigadista.

### 5.11 Versionado

Cada ejecución del pipeline tiene un `methodology_version` (por ejemplo, `1.0.0-qm-biome-month`) y una fecha de corte de datos. Ambos aparecen en la app, la API, las descargas y el dataset publicado.

---

## 6. Modelo de datos

Formato Parquet, particionado por año (y región en el archivo global), consultable con DuckDB en servidor y en navegador.

### 6.1 `hotspots`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | string | Identificador único |
| `ts_utc` | timestamp | Fecha y hora de adquisición |
| `date_local` | date | Fecha local aproximada (por longitud) |
| `lat`, `lon` | double | Ubicación |
| `h3_r6`, `h3_r7` | string | Celdas H3 |
| `sensor` | string | `MODIS` / `VIIRS` |
| `platform` | string | `Terra`, `Aqua`, `SNPP`, `NOAA20`, `NOAA21` |
| `confidence_h` | string | Confianza homologada |
| `frp_mw` | double | FRP observado |
| `daynight` | string | `D` / `N` |
| `burn_type` | string | `agricola`, `forestal`, `otro` |
| `event_id` | string | Evento al que pertenece |
| `harm_weight` | double | Peso de armonización (equivalente VIIRS) |
| `source` | string | `SP` / `NRT` |

### 6.2 `cell_month` y `cell_day`

| Columna | Tipo | Descripción |
|---|---|---|
| `h3_r6` | string | Celda |
| `year`, `month` (`date` en la versión diaria) | int / date | Periodo |
| `count_raw_modis`, `count_raw_viirs` | int | Conteos originales |
| `count_harm` | double | Conteo armonizado |
| `count_harm_lo`, `count_harm_hi` | double | Banda de incertidumbre |
| `frp_harm` | double | FRP armonizado |
| `clear_frac` | double | Fracción observada sin nubes |
| `is_estimated` | bool | Periodo solo-MODIS |
| `count_agricola`, `count_forestal` | double | Desglose por tipo |

### 6.3 `events`

| Columna | Tipo | Descripción |
|---|---|---|
| `event_id` | string | Identificador |
| `start_date`, `end_date` | date | Inicio y fin |
| `duration_days` | int | Duración |
| `n_hotspots_harm` | double | Puntos armonizados |
| `frp_total` | double | FRP total |
| `area_approx_km2` | double | Extensión aproximada (no es área quemada) |
| `night_ratio` | double | Proporción de detecciones nocturnas |
| `burn_type` | string | Tipo dominante |
| `centroid_lat`, `centroid_lon` | double | Centro |
| `geometry` | WKB | Envolvente de los puntos |
| `cells` | list<string> | Celdas H3 que toca |

### 6.4 `cell_stats`

| Columna | Tipo | Descripción |
|---|---|---|
| `h3_r6` | string | Celda |
| `years_with_fire` | int | Años con al menos un evento |
| `last_fire_year` | int | Último año con fuego |
| `trend_sen_slope`, `trend_p_value` | double | Tendencia de actividad |
| `season_onset_trend_days` | double | Cambio en el inicio de temporada por década |
| `regime_early`, `regime_late` | int | Régimen en la primera y segunda década |
| `dist_locality_km` | double | Distancia a la localidad más cercana |
| `pop_10km` | double | Población a 10 km |
| `in_protected_area` | bool | Dentro de área protegida |
| `dominant_landcover` | string | Cobertura dominante |

### 6.5 Tablas auxiliares

- `climatology`: mediana, promedio y percentiles (10, 25, 75, 90) por celda y mes, precalculados para respuesta instantánea.
- `static_sources`: celdas con fuentes estáticas para filtrar NRT.
- `oni`: fase de El Niño/La Niña por mes.
- `reported_fires`: incendios reportados por fuentes oficiales, por municipio y mes.
- `metadata`: versión metodológica, fecha de corte, métricas de validación.

---

## 7. La aplicación

### 7.1 Estructura de la pantalla principal

- **Barra superior:** caja de búsqueda en lenguaje natural como elemento protagonista, botón de micrófono, accesos a dibujo de polígono y lat/lon, selector de idioma y de perfil.
- **Mapa (izquierda):** área seleccionada, puntos de calor, capas activables.
- **Panel (derecha):** semáforo, calendario, filtros, descargas, y pestañas de análisis.
- **Asistente:** panel lateral desplegable.

### 7.2 Selección de área y fechas

#### Lenguaje natural (función insignia)

**Qué es.** El usuario escribe o dicta una frase como "incendios en la sierra de Arteaga en marzo de 2021" o "cómo va la temporada a 30 km al sur de Saltillo", y Firely define el área y el periodo automáticamente.

**Cómo funciona.**

1. **Extracción de intención.** El LLM convierte la frase en un objeto estructurado (salida JSON validada con un esquema):
   ```json
   {
     "lugar": "sierra de Arteaga",
     "tipo_lugar": "elemento_natural",
     "contexto_geografico": "Coahuila, México",
     "relacion": null,
     "distancia_km": null,
     "fecha_inicio": "2021-03-01",
     "fecha_fin": "2021-03-31",
     "pregunta": "actividad de incendios"
   }
   ```
2. **Resolución geográfica.** Según `tipo_lugar`:
   - Municipio o estado → límites oficiales (INEGI en México, GADM/geoBoundaries en otros países).
   - Ciudad o localidad → geocodificador (Nominatim) más un radio por defecto.
   - Elemento natural (sierra, parque, río) → polígono de OpenStreetMap si existe; si no, área protegida que coincida; si no, punto con radio y aviso.
3. **Operaciones espaciales.** "Al sur de", "alrededor de", "a 20 km de" se resuelven con buffers y sectores direccionales (Shapely en servidor o Turf en navegador).
4. **Fechas.** Expresiones como "la temporada pasada", "los últimos 5 años" o "este mes" se convierten a fechas concretas con la fecha actual como referencia.
5. **Confirmación.** El mapa vuela al área, muestra el polígono y el usuario lo acepta o lo edita como si lo hubiera dibujado.

**Reglas.**

- El LLM **nunca genera coordenadas**; solo nombres e intenciones. La geometría siempre viene de un geocodificador o de límites oficiales.
- **Ambigüedad:** si hay varios candidatos (Arteaga, Coahuila y Arteaga, Michoacán), se muestran como opciones.
- **Sin resultado:** se pide al usuario que dibuje o reformule, sin inventar.
- Se respetan las políticas de uso del geocodificador (Nominatim pide máximo una consulta por segundo e identificación; para producción, servidor propio o servicio alternativo).

#### Otras formas de seleccionar

- **Dibujo** de polígono o rectángulo en el mapa (por ejemplo, con Terra Draw sobre MapLibre).
- **Latitud/longitud con radio**, para quien trabaja con coordenadas de campo.
- **Búsqueda administrativa** con autocompletado de municipios y estados.
- **Rango de fechas** con selector de calendario y atajos (último mes, temporada actual, todo el historial).

**Límites.** Para mantener la respuesta rápida, áreas muy grandes se agregan a resolución H3 más gruesa automáticamente, con aviso.

### 7.3 Calendario de actividad de quemas

**Qué es.** Matriz de años (filas, 2000 al año actual) por meses (columnas). Cada celda muestra la actividad armonizada del área en ese mes.

**Vistas.**

- **Conteo:** puntos armonizados, rampa secuencial cividis.
- **Anomalía:** razón o diferencia contra la referencia histórica de ese mes, rampa divergente azul–blanco–rojo centrada en la referencia. Azul = menos que lo normal, rojo = más.
- **Referencia seleccionable:** mediana o promedio plurianual. Por defecto, mediana (más robusta a años extremos).
- **Métrica seleccionable:** conteo o FRP.

**Marcas visuales.**

- Filas 2000–2011 con una marca sutil de "estimación armonizada" y tooltip con su banda de incertidumbre.
- Celdas con poca visibilidad por nubes con patrón rayado.
- Mes actual parcialmente relleno, proporcional a los días transcurridos.
- Resumen al margen: total anual por fila y mediana por columna.

**Interacción.**

- **Tooltip** por celda: valor, anomalía, percentil histórico, periodo de retorno, enlace "ver datos".
- **Clic en una celda:** abre el **desglose diario** de ese mes (barras por día) y filtra el mapa a ese periodo. Clic en un día muestra sus puntos.
- **Filtro por tipo de quema:** todas, agrícolas o forestales.
- **Comparador lado a lado:** dos áreas o dos periodos con calendarios sincronizados y la misma escala de color.
- **El Niño / La Niña:** cada fila lleva una etiqueta con la fase dominante del año (según el índice ONI de NOAA, umbral de ±0.5 °C), para explicar anomalías interanuales.

**Accesibilidad.** El calendario es navegable con teclado (rol de cuadrícula), cada celda tiene texto accesible, y la información nunca depende solo del color.

### 7.4 Monitoreo del presente

#### Semáforo del mes actual

- **Cálculo:** actividad del mes a la fecha, dividida entre la referencia histórica del mismo mes proporcional a los días transcurridos.
- **Niveles:** verde (por debajo del percentil 75), amarillo (75–90), rojo (por encima de 90), con la cifra explícita ("2.8× la mediana a esta fecha").
- **Frase de periodo de retorno** junto al semáforo.

#### Curva de ritmo de temporada

- Acumulado del año actual (línea gruesa) contra el envolvente histórico: mediana, banda de percentiles 10–90 y mínimo–máximo.
- Para regiones del hemisferio sur o con temporada que cruza el año, se usa un "año de fuego" que empieza en el mes de menor actividad histórica.
- Marca de hoy y proyección de los años análogos (ver 8.2).

#### Capa de detecciones recientes

- Detecciones NRT de las últimas 24 y 48 horas, con tamaño o color por FRP y distinción día/noche.
- Filtrada con la máscara de fuentes estáticas.
- Hora de la última actualización visible.

#### Capa geoestacionaria (visión)

- Detecciones del producto de fuego de GOES-East y GOES-West, disponibles cada pocos minutos sobre las Américas.
- Menor resolución espacial pero mucho mayor frecuencia: sirve para detectar inicios y seguir la evolución en el día.
- Demuestra que el método está pensado para incorporar más sensores.

### 7.5 Pestañas de análisis

Debajo del calendario, organizadas por pregunta:

| Pestaña | Contenido |
|---|---|
| Este incendio | Comparar incendios, fuego nocturno, cono de propagación |
| Años parecidos | Años análogos, curva de ritmo |
| Temporada | La temporada se mueve, periodo de retorno |
| Contexto | Meteorología, El Niño, efecto día de la semana, agrícola vs forestal |
| Riesgo | Riesgo próximo, exposición, localidades a favor del viento, índice de prioridad |
| Largo plazo | Recurrencia, regímenes, detectados vs reportados |

Cada pestaña abre con una **frase de hallazgo** en lenguaje claro, seguida de la visualización y del detalle técnico desplegable.

### 7.6 Experiencia y comunicación

#### Modo historia

**Qué es.** Recorrido narrado tipo scroll para cualquier área, generado automáticamente.

**Cómo funciona.** Se calculan los hallazgos clave del área (mes pico, peor año, tendencia, evento más grande, cambio de temporada, contexto) y el LLM los redacta en secuencia. Cada paso del scroll anima el mapa y la gráfica correspondiente. Si el LLM no está disponible, se usan plantillas.

**Uso.** Comunicadores, escuelas, el propio video del proyecto.

#### Animación de 25 años en 30 segundos

- Mapa o globo (deck.gl o CesiumJS) con la actividad armonizada por celda H3, avanzando mes a mes desde 2000.
- Se ven las temporadas moverse entre hemisferios y regiones.
- Controles de reproducción y exportación a video para el pitch.

#### Sonificación del calendario

**Qué es.** El calendario convertido en sonido.

**Cómo funciona.**

- Cada mes es una nota, en orden cronológico.
- La actividad armonizada define la altura dentro de una escala pentatónica (suena agradable sin conocimientos musicales).
- La anomalía define el timbre: meses normales suenan limpios; meses muy por encima de lo normal agregan disonancia o un timbre más áspero.
- Velocidad ajustable; implementado con la Web Audio API (por ejemplo, con Tone.js).

**Por qué.** Accesibilidad para personas con discapacidad visual y un momento memorable en la presentación.

---

## 8. Módulos de análisis

Cada módulo se describe con: pregunta que responde, cómo se calcula, qué ve el usuario y casos límite.

### 8.1 Comparar incendios

**Pregunta:** ¿qué incendio es este y cómo se compara con los anteriores? (El reto lo pide explícitamente.)

**Cálculo.**

1. **Agrupación en eventos** con clustering espacio-temporal: dos detecciones pertenecen al mismo evento si están a menos de una distancia (≈1–2 km, mayor para MODIS por su resolución) y separadas por no más de 1–2 días. Se implementa como componentes conexas con unión-búsqueda sobre vecinos espaciales y temporales, o con ST-DBSCAN.
2. **Atributos por evento:** inicio, fin, duración, puntos armonizados, FRP total y máximo, extensión aproximada (número de píxeles únicos por su área nominal: ~0.14 km² VIIRS, ~1 km² MODIS), proporción nocturna, tipo dominante.
3. **Ranking:** percentil del evento dentro de todos los eventos históricos del área, por duración, FRP total y extensión.

**Qué ve el usuario.** Lista de eventos del periodo; al elegir uno: "3.º más grande desde 2001 en esta región; activo más días que el 90% de los incendios anteriores". Gráfica de dispersión duración vs FRP con el evento resaltado.

**Casos límite.** Incendios que se fusionan o se dividen; quemas agrícolas pequeñas y numerosas (se filtran por tipo); la extensión aproximada **no es área quemada** y se rotula así.

### 8.2 Años análogos

**Pregunta:** si este año se parece a otros, ¿cómo terminaron esos años?

**Cálculo.**

1. Curva acumulada del año actual desde el inicio del año de fuego hasta hoy.
2. Misma curva para cada año histórico hasta la misma fecha.
3. Distancia entre curvas (RMSE sobre curvas normalizadas por la mediana, o correlación más diferencia de nivel).
4. Se eligen los 3–5 años más cercanos.
5. **Proyección:** se toma cómo siguió cada año análogo desde esa fecha hasta el fin de temporada, escalado al nivel actual, y se presenta como rango.

**Qué ve el usuario.** "Los 3 años más parecidos a 2026 (2011, 2017 y 2021) cerraron entre 1.8 y 2.5 veces la mediana." Curva actual con las curvas análogas superpuestas y el abanico de proyección.

**Casos límite.** Muy al inicio de la temporada hay poca información: el módulo indica baja confianza hasta que haya suficiente acumulado. No es un pronóstico físico; se rotula como "referencia histórica".

### 8.3 La temporada se mueve

**Pregunta:** ¿la temporada de fuego empieza, alcanza su pico o termina en fechas distintas que antes?

**Cálculo.**

1. Para cada año de fuego: día en que el acumulado alcanza 10% (inicio), 50% (pico central) y 90% (fin) del total anual.
2. Tendencia de cada fecha a lo largo de los años con la prueba de Mann-Kendall y la pendiente de Sen (por ejemplo, con la librería `pymannkendall`).
3. Tendencia de la actividad total anual con el mismo método.
4. Por celda, se guarda en `cell_stats` para el mapa de tendencias.

**Qué ve el usuario.** "La temporada empieza 11 días antes por década desde 2001 (tendencia significativa)." Gráfica de fechas por año con su línea de tendencia y un mapa de dónde la actividad aumenta o disminuye significativamente.

**Casos límite.** Años con muy poca actividad producen fechas inestables (se excluyen por debajo de un mínimo). Áreas con dos temporadas al año se detectan y se analizan por separado. Los años solo-MODIS se incluyen con su incertidumbre y se ofrece el análisis restringido a 2012+ como comprobación.

### 8.4 Periodo de retorno

**Pregunta:** ¿qué tan raro es lo que está pasando?

**Cálculo.**

- Para el mes (o temporada) en cuestión, se ordenan los valores de todos los años.
- Periodo de retorno empírico con posición de Weibull: T = (n + 1) / m, donde n es el número de años y m el rango del valor (1 = el mayor).
- Para valores fuera del rango histórico, ajuste de una distribución de valores extremos (GEV o Gumbel con `scipy.stats`), con advertencia de mayor incertidumbre.

**Qué ve el usuario.** "Un marzo así ocurre en promedio una vez cada 25 años." Es el lenguaje que protección civil ya usa para inundaciones.

**Casos límite.** Con ~25 años de datos, periodos de retorno mayores a ~50 años son extrapolaciones y se indica.

### 8.5 Agrícola vs forestal

**Pregunta:** ¿esta actividad es quema agrícola o incendio en vegetación natural?

**Cálculo.**

- **Cobertura del suelo:** detecciones en cultivos o mosaicos agrícolas (MCD12Q1) → candidatas a agrícola; en bosques, matorrales y pastizales naturales → candidatas a forestal.
- **Patrón temporal:** las quemas agrícolas se repiten en las mismas celdas en ventanas similares cada año, son de corta duración y bajo FRP.
- **Reglas o clasificador simple** que combina ambos, con la regla documentada.

**Qué ve el usuario.** Filtro del calendario por tipo y desglose de cada mes en barras apiladas.

**Casos límite.** Quemas agrícolas que escapan hacia vegetación natural; resolución de la cobertura del suelo (500 m) frente a la de VIIRS (375 m). Se rotula como "clasificación aproximada".

### 8.6 Efecto día de la semana

**Pregunta:** ¿el fuego en esta área tiene firma humana?

**Cálculo.** Distribución de detecciones por día de la semana (fecha local) frente a una distribución uniforme, con prueba chi-cuadrada. Los satélites no observan distinto según el día de la semana, así que una diferencia significativa sugiere actividad humana (por ejemplo, quemas en fines de semana o días feriados).

**Qué ve el usuario.** Gráfica de barras por día y la frase: "En esta zona hay 40% más detecciones en sábado y domingo: fuerte firma de origen humano."

**Casos límite.** Requiere suficientes detecciones para ser significativo; con pocas, se indica "sin evidencia suficiente".

### 8.7 Fuego nocturno

**Pregunta:** ¿este fuego persiste de noche?

**Cálculo.** Proporción de detecciones nocturnas (`daynight = N`) por evento y por mes. Un evento activo en pasos nocturnos (cuando la humedad suele subir) indica mayor persistencia.

**Qué ve el usuario.** Indicador por evento ("activo en 4 noches consecutivas") y su comparación con la historia del área.

**Casos límite.** La sensibilidad nocturna difiere entre sensores; se compara siempre dentro de la serie armonizada.

### 8.8 Recurrencia

**Pregunta:** ¿dónde vuelve a arder?

**Cálculo.** Por celda H3 7: número de años con fuego y último año con fuego.

**Qué ve el usuario.** Dos mapas: "veces que ha ardido" y "años desde el último fuego". Las zonas con mucho tiempo sin fuego pueden acumular combustible; las de fuego frecuente indican presión recurrente.

### 8.9 Regímenes de fuego

**Pregunta:** ¿qué tipo de comportamiento de fuego tiene cada zona, y ha cambiado?

**Cálculo.**

1. Por celda, variables que describen su calendario: climatología mensual normalizada (12 valores), concentración estacional, duración de temporada, densidad media de actividad y variabilidad interanual.
2. Agrupación con k-means (o similar) en un número pequeño de regímenes interpretables.
3. Asignación por separado para la primera y la segunda década de datos; las celdas que cambian de grupo son "cambios de régimen".

**Qué ve el usuario.** Mapa de regímenes con nombres descriptivos (por ejemplo, "temporada corta de primavera", "actividad baja todo el año") y mapa de celdas que cambiaron.

**Casos límite.** La primera década es solo-MODIS armonizada; el resultado se presenta con su incertidumbre.

### 8.10 Contexto meteorológico

**Pregunta:** ¿por qué este periodo tuvo más o menos fuego?

**Cálculo.** Consulta a NASA POWER (endpoint mensual por punto o región) para el centroide o la región del área: precipitación corregida, temperatura a 2 m, humedad relativa y viento. Se calculan anomalías contra su propia climatología.

**Qué ve el usuario.** Gráfica de anomalía de fuego junto a anomalía de precipitación y temperatura, y la frase: "Este marzo tuvo 3× la mediana de fuego y fue el más seco desde 2011."

**Casos límite.** Correlación no implica causa; se rotula como contexto, no como explicación definitiva.

**Implementación.** `GET /weather` (`api/app/weather_routes.py`) consulta el endpoint mensual de POWER (`PRECTOTCORR`, `T2M`, `RH2M`, `WS2M`, comunidad `AG`) en el centroide del área redondeado a 0.5°, con IPv4 forzado y caché en disco (`data/processed/cache/power/`) para que la demo funcione sin red. Las anomalías se calculan contra el promedio del mismo mes calendario de 2001 al último año completo; junto a cada mes va `fire_anomaly_ratio` (conteo armonizado / mediana del mismo mes). Con `year` y `month` devuelve la frase del mes ("el marzo más seco desde 2011") calculada, no redactada por un modelo. En la web aparece en la pestaña Contexto como dos gráficas alineadas (precipitación y fuego), nunca en doble eje.

### 8.11 Riesgo próximo

**Pregunta:** ¿qué tan peligrosas son las condiciones de los próximos días?

**Cálculo.**

1. Se obtiene el índice meteorológico de peligro de incendio (sistema FWI) de NASA GFWED para el área:
   - **Histórico:** versión `MERRA2.CORRECTED` (MERRA-2 con precipitación corregida con pluviómetros), diaria, malla 0.5° × 0.625°, con unos meses de retraso. Ruta: `.../GlobalFWI/v2.0/fwiCalcs.MERRA2/Default/MERRA2.CORRECTED/AAAA/FWI.MERRA2.CORRECTED.Daily.Default.AAAAMMDD.nc`.
   - **Promedio de largo plazo:** `FWI.MERRA2.CORRECTED.LongTermMean.Default.1981.2010.MM.nc`, para expresar el FWI actual como anomalía.
   - **Pronóstico de 8 días (experimental):** modelo GEOS-5, actualizado diario. Ruta: `.../GlobalFWI/v2.0/fwiCalcs.GEOS-5/Default/GEOS-5/AAAA/AAAAMMDD00/FWI.GEOS-5.Daily.Default.AAAAMMDD00.aaaammdd.nc` (un archivo por cada día pronosticado). Se descarga cada mañana durante la operación.
   - Las variables de cada archivo llevan como prefijo la fuente de precipitación; además del FWI incluyen FFMC, DMC, DC, ISI, BUI y DSR. El FFMC es un buen indicador de inicios de fuego.
   - El FWI requiere calibración local: los umbrales de "peligro alto" no son universales. Firely no usa umbrales fijos sino la relación observada entre FWI y actividad de fuego en la propia área (paso 2).
2. Con el historial armonizado, se construye la relación entre niveles de FWI y actividad de fuego observada en el área.
3. Se traduce el FWI pronosticado a actividad esperada.

**Qué ve el usuario.** "En los días con un FWI como el previsto para esta semana, esta área tuvo en promedio 3 veces más puntos de calor."

### 8.12 Cono de propagación

**Pregunta:** ¿hacia dónde podría avanzar el fuego?

**Cálculo.**

1. Para un evento activo, se comparan los centroides y frentes de detecciones en pasos consecutivos para estimar dirección y velocidad de avance.
2. Se combina con el viento pronosticado (dirección y velocidad).
3. Se dibuja un sector o cono de propagación probable para las próximas horas.

**Qué ve el usuario.** Flecha y cono sobre el mapa, con advertencia explícita: "estimación simple, no sustituye modelos de comportamiento del fuego ni la evaluación en campo".

### 8.13 Exposición

**Pregunta:** ¿qué hay cerca del fuego?

**Cálculo.** Distancia de cada detección a localidades (con población) y si cae dentro de áreas protegidas. Agregados por periodo.

**Qué ve el usuario.** "El 18% de los puntos de este mes cayeron a menos de 5 km de localidades; 3 eventos dentro del área protegida X."

### 8.14 Localidades a favor del viento

**Pregunta:** ¿qué poblaciones podrían recibir el humo?

**Cálculo.** Desde cada evento activo, sector en la dirección del viento (pronosticado u observado) con un alcance de decenas de kilómetros; localidades dentro del sector, con su población.

**Qué ve el usuario.** Sector sombreado en el mapa y lista de localidades: "Saltillo y Ramos Arizpe quedan a favor del viento en las próximas 12 horas." Rotulado como indicativo.

### 8.15 Detectados vs reportados

**Pregunta:** ¿coincide lo que ve el satélite con lo que se reporta oficialmente?

**Cálculo.** Se agregan los eventos detectados por municipio y mes y se comparan con las estadísticas oficiales disponibles (en México, CONAFOR; verificar granularidad). Los reportes en PDF se convierten a datos con la capa de IA (ver 11.2).

**Qué ve el usuario.** Gráfica comparativa y mapa de zonas con muchas detecciones y pocos reportes, que pueden indicar fuego no atendido o no registrado.

**Casos límite.** Las definiciones no coinciden (un "incendio" reportado vs puntos de calor agrícolas); se compara preferentemente con eventos forestales.

### 8.16 Índice de prioridad de prevención

**Pregunta:** ¿dónde poner a las brigadas este fin de semana?

**Cálculo.** Por celda, combinación ponderada y normalizada (0–100) de:

- Estacionalidad: qué tan activo es históricamente este periodo.
- Anomalía actual.
- Riesgo próximo (FWI).
- Exposición (población y áreas protegidas).
- Recurrencia y tendencia.

Los pesos son transparentes y ajustables por el usuario.

**Qué ve el usuario.** Mapa de prioridad y lista de las 10 zonas más prioritarias del área, con el desglose de por qué cada una está arriba.

**Casos límite.** Es una herramienta de apoyo; no reemplaza el conocimiento local. Se dice explícitamente.

**Implementación (v1).** `GET /risk` combina anomalía (0.35), recurrencia (0.25), exposición (0.25), temporada (0.15) y peligro meteorológico FWI (0.15, percentil del FWI medio de GFWED del mes frente a los años con dato del área; solo donde existe la tabla de contexto). Los pesos se cambian con `w_anomaly`, `w_recurrence`, `w_exposure`, `w_season` y `w_fwi` (0–10); un peso 0 quita el componente y los componentes sin datos se omiten renormalizando el resto, lo que se declara en `method`. La respuesta trae `weights`, `weights_custom` y `disclaimer`. En la pestaña Riesgo, el usuario mueve los pesos con deslizadores y el índice se recalcula con los mismos datos.

---

## 9. Salidas y descargas

| Salida | Contenido | Formato |
|---|---|---|
| Puntos de calor | Cada detección del área y periodo con sensor de origen, valor armonizado, confianza, FRP, tipo, evento | CSV |
| Agregados | Calendario del área (año, mes, conteo, FRP, anomalía, bandas, visibilidad) | CSV |
| Gráficas | Cualquier visualización | PNG y SVG |
| Ficha de situación | Ver abajo | PDF |
| Geodatos | Puntos, eventos, polígono del área | GeoJSON y KML |
| OGC | Colecciones de puntos y eventos | OGC API Features |

Cada descarga incluye un encabezado o archivo de metadatos con `methodology_version`, fecha de corte, área, periodo y la atribución a NASA FIRMS.

### Ficha de situación (PDF)

- **Formato:** una página tamaño carta, modo claro, imprimible en blanco y negro sin perder información.
- **Contenido:** nombre del área y fecha; mapa pequeño con el área y detecciones recientes; calendario compacto; curva de ritmo de temporada; semáforo; tres hallazgos clave redactados; nivel de prioridad; atribución y versión.
- **Generación:** plantilla HTML renderizada a PDF (por ejemplo, con WeasyPrint o un navegador sin interfaz). Los textos los redacta el LLM a partir de cifras calculadas, con plantillas de respaldo.
- **Meta:** que se lea en 30 segundos en una reunión de coordinación.
- **Código QR** que abre la vista en vivo del área.

---

## 10. Alertas

### 10.1 Alertas por suscripción

- El usuario guarda un área y elige condiciones: mes sobre el percentil 90, evento nuevo en el área, evento a menos de X km de una localidad, riesgo próximo alto.
- Un job diario (después de la ingesta NRT) evalúa las condiciones.
- Canales: correo y bot de Telegram.
- Cada alerta incluye cifra, contexto y enlace a la vista del área.

### 10.2 Alertas en formato CAP

**Qué es.** El Common Alerting Protocol (CAP 1.2, estándar OASIS) es el formato XML que usan agencias de emergencia de todo el mundo para intercambiar alertas.

**Cómo se genera.** Cuando se cumple una condición de alerta, Firely produce un mensaje CAP con:

- `identifier`, `sender`, `sent`
- `status`: **`Exercise` o `Test` durante el hackathon** (nunca `Actual`)
- `msgType`: `Alert`
- `scope`: `Public` o `Restricted`
- `info`: `category` = `Fire`, `event`, `urgency`, `severity`, `certainty`, `headline`, `description`, `instruction`
- `area`: `areaDesc` y `polygon`

**Flujo.** Las alertas CAP se generan como borrador; una persona las revisa y aprueba antes de publicarlas. Se exponen en un feed para que otros sistemas las consuman.

**Implementación.** `POST /cap/draft` crea el borrador (siempre `status=Exercise`, `scope=Restricted`, polígono de las celdas H3 del área); `POST /cap/approve/{id}` registra la aprobación humana **solo para ejercicio**, y `GET /alerts/cap` publica un feed Atom (`application/atom+xml`) con los borradores aprobados embebidos como CAP 1.2. Los borradores sin aprobar nunca aparecen en el feed, y ningún mensaje lleva `Actual`. La página Plataforma permite redactar, revisar el XML, aprobar y descargar.

---

## 11. Capa de inteligencia artificial

### 11.1 Principios

1. **El LLM nunca calcula ni inventa cifras.** Todos los números provienen de la serie armonizada mediante herramientas que llaman a la API. Si una herramienta no devuelve un dato, el LLM dice que no lo tiene.
2. **El LLM nunca genera coordenadas.** La geometría viene de geocodificadores y límites oficiales.
3. **"Ver datos" en cada cifra.** Cada número en una respuesta enlaza a la consulta exacta (URL con parámetros) que lo respalda.
4. **Humano en el circuito** para todo lo que se publique hacia la población.
5. **Respaldo sin LLM.** Si el servicio falla, la ficha, el modo historia y las descripciones usan plantillas; la app sigue funcionando completa.
6. **Contenido externo como datos, no instrucciones.** Los reportes y documentos que procesa el LLM se tratan como datos; sus instrucciones internas se ignoran.
7. **Salidas estructuradas.** Toda extracción produce JSON validado contra un esquema antes de usarse.

### 11.2 Funciones

#### Selección de área y fechas por lenguaje natural
Descrita en 7.2. Es la puerta de entrada de la app.

#### Asistente analista con UI generativa

**Qué es.** Panel de conversación donde el usuario pregunta libremente y recibe respuestas que combinan texto breve con componentes de la app.

**Cómo funciona.**

- El LLM tiene acceso a herramientas: `resolver_area`, `obtener_calendario`, `obtener_eventos`, `obtener_analogos`, `obtener_temporada`, `obtener_contexto`, `obtener_riesgo`, `obtener_exposicion`.
- Decide qué herramientas llamar según la pregunta, y qué componentes mostrar (mini calendario, curva de temporada, ranking de eventos, mapa) mediante un catálogo cerrado de componentes con sus parámetros.
- La respuesta combina una o dos frases con los componentes elegidos y los enlaces "ver datos".

**Ejemplo.** "¿Cómo va la temporada en Arteaga comparada con otros años?" → resuelve el área, obtiene curva de ritmo y análogos, y responde con la curva y la frase "va por encima del percentil 90 para esta fecha; los años más parecidos son 2011, 2017 y 2021".

#### Redacción de ficha y modo historia
A partir de un paquete de hallazgos calculados (cifras, percentiles, rankings), el LLM produce frases claras y ordenadas. Las cifras se insertan desde los datos, no desde el texto generado: el LLM escribe con marcadores que luego se rellenan, o se verifica que cada número del texto coincida con el paquete de entrada.

#### Explicaciones según perfil

- **Brigadista:** frases cortas, acción concreta, sin estadística ("este mes arde más de lo normal; prioriza esta zona").
- **Científico:** percentiles, método, incertidumbre, versión metodológica.
- El perfil se elige una vez y aplica a asistente, fichas, modo historia y bot.

#### Multilenguaje automático
Español, inglés y portugués para la interfaz (traducción fija de textos de UI) y para los textos generados (fichas, modo historia, asistente, descripciones accesibles). Cubre Latinoamérica, incluido Brasil, y usuarios internacionales.

#### Descripciones accesibles
Cada gráfica genera un texto alternativo con sus hallazgos clave ("Calendario 2000–2026. El mes más activo es abril. 2021 fue el año con más actividad. Marzo de 2026 está 2.8 veces sobre la mediana"). Ver sección 14.

#### Agente vigía con boletín semanal

**Qué es.** Un agente que trabaja solo, sin que nadie pregunte.

**Cómo funciona.**

1. Un job nocturno, después de la ingesta, calcula para cada región de una lista (estados, áreas protegidas, regiones de interés) su semáforo, periodo de retorno del mes en curso y cambios de temporada.
2. Selecciona las regiones más fuera de lo normal.
3. El LLM redacta un boletín breve con esas regiones, sus cifras y enlaces.
4. El boletín se publica en la app y se envía a suscriptores.

**Por qué.** Convierte la herramienta en un sistema de alerta temprana proactivo.

#### Extracción de reportes oficiales

**Qué es.** Convertir estadísticas oficiales publicadas en PDF o tablas desordenadas en datos estructurados.

**Cómo funciona.** El LLM recibe el documento, extrae registros con un esquema definido (entidad, municipio, periodo, número de incendios, superficie reportada), y cada registro se valida (tipos, rangos, sumas que cuadren con totales del documento). Los registros dudosos se marcan para revisión. Alimenta `reported_fires`.

**Implementación.** `POST /reports/extract` (`ai/reports.py`) acepta el texto pegado de un PDF o una hoja de cálculo. Hay dos extractores con el mismo validador: uno por reglas (detecta delimitadores, encabezados en español, inglés y portugués, formatos numéricos `1,234.5` / `1.234,5` y filas de total) y, si hay llave de Anthropic, el LLM mediante una llamada forzada a herramienta con el esquema `ai/prompts/report.schema.json`. El documento va entre etiquetas `<documento>` y el prompt indica tratarlo como datos; la salida del modelo se vuelve a tipar y validar. Cada registro lleva `issues` y `needs_review`, y los `checks` comparan la suma de incendios y superficie con la fila de total. No se guarda nada: la respuesta es una hoja de revisión (con CSV) que una persona acepta antes de usarla.

#### Borradores de comunicados

**Qué es.** Textos listos para revisión a partir de una alerta: mensaje CAP y texto para redes sociales de protección civil.

**Reglas.** Lenguaje claro, cifras verificadas, instrucciones prudentes y genéricas; siempre como borrador con botón de aprobación. Nunca se publica automáticamente.

#### Consultas avanzadas para científicos

**Qué es.** Texto a SQL sobre DuckDB.

**Cómo funciona.** El usuario describe la consulta ("meses de 2015 a 2025 donde el FRP superó el p95 en celdas de pastizal"); el LLM genera SQL usando el esquema documentado; la consulta se muestra antes de ejecutarse.

**Seguridad.** Conexión de solo lectura, lista blanca de tablas, límite de filas, tiempo máximo de ejecución, sin acceso a archivos ni red.

#### Bot conversacional con notas de voz

**Qué es.** Bot de Telegram (WhatsApp como extensión) para brigadistas.

**Cómo funciona.**

- Entiende preguntas libres y comandos (`/area`, `/hoy`, `/semaforo`, `/suscribir`).
- Acepta ubicación compartida y **notas de voz**: el audio se transcribe con un modelo de voz a texto y se procesa como pregunta.
- Responde con texto breve e imágenes (calendario, mapa de últimas 24 h).
- Usa las mismas herramientas que el asistente y el servidor MCP.

**Implementación.** `bot/telegram_bot.py` atiende `/calendario`, `/temporada`, `/incendios`, `/semaforo` (índice de prioridad), `/hoy` (detecciones NRT de 24 h) y `/lang`. El texto libre se trata como una consulta en lenguaje natural (área y fechas vía `/resolve-area`). La ubicación compartida se convierte en un recuadro de ~25 km alrededor del punto del usuario (nunca un punto generado) y responde con prioridad y detecciones de hoy; se recuerda para `/semaforo` y `/hoy` sin argumento. Las notas de voz se transcriben en el servidor con `faster-whisper` si está instalado (`bot/stt.py`, el audio no sale del servidor); si no lo está, el bot pide escribir la pregunta. Antes de responder, repite lo que entendió ("Entendí: «…»").

#### Escenarios de simulacro

**Qué es.** Ejercicios de entrenamiento para brigadas basados en incendios históricos reales del área.

**Cómo funciona.** Se toma un evento real y su contexto (fecha, temporada, meteorología, exposición); el LLM arma un escenario por etapas con preguntas de decisión ("es 15 de marzo, la temporada va adelantada y aparece este evento a 8 km de una localidad, ¿qué priorizan?"). Los datos del escenario vienen del historial; el LLM solo estructura la narrativa.

**Implementación.** `GET /drill` (`api/app/drill_routes.py`) elige un evento real del área (el más grande, el más largo o el más reciente, o uno por `event_id`) y arma cuatro etapas por plantilla: detección (primer día, posición del mes en la temporada, anomalía del mes, fase ENSO, anomalía de FWI), exposición (localidades a menos de 30 km con población), evolución (día de más actividad y noches con detecciones) y desenlace (duración, tamaño armonizado, extensión aproximada y ranking en el área), que se revela al final. Las preguntas no tienen respuesta única: son para la discusión del equipo. En la web se recorre paso a paso desde Plataforma › Simulacros.

### 11.3 Implementación

- **Modelo:** Claude mediante la API de Anthropic, con uso de herramientas y salidas estructuradas.
- **Herramientas compartidas:** las mismas funciones del backend se exponen al asistente, al bot y al servidor MCP.
- **Caché** de respuestas frecuentes (por ejemplo, fichas de áreas populares) para reducir costo y latencia.
- **Registro** de cada llamada (pregunta, herramientas usadas, datos devueltos) para depuración y para demostrar trazabilidad.

---

## 12. Plataforma

### 12.1 API REST

**Tecnología.** FastAPI con DuckDB leyendo Parquet desde un bucket de almacenamiento, en contenedores desplegados en un servicio serverless (por ejemplo, Cloud Run). Documentación OpenAPI automática en `/docs`.

**Formas de especificar el área** (comunes a todos los endpoints):

- `h3` (lista de celdas)
- `bbox` (`min_lon,min_lat,max_lon,max_lat`)
- `lat`, `lon`, `radius_km`
- `admin` (código de municipio o estado)
- `geometry` (GeoJSON, por POST)

**Endpoints.**

| Endpoint | Parámetros adicionales | Devuelve |
|---|---|---|
| `GET /calendar` | `from`, `to`, `metric` (`count`/`frp`), `reference` (`median`/`mean`), `burn_type` | Matriz años × meses con valor, anomalía, bandas, visibilidad |
| `GET /calendar/daily` | `year`, `month` | Valores diarios del mes |
| `GET /hotspots.csv` | `from`, `to`, `burn_type`, `min_confidence` | Puntos de calor |
| `GET /events` | `from`, `to`, `active_only` | Eventos con atributos y ranking |
| `GET /analogs` | `date` | Años análogos y rango de proyección |
| `GET /season` | — | Fechas de inicio/pico/fin por año y tendencias |
| `GET /context` | `from`, `to` | Fase ONI y anomalías de FWI (GFWED) |
| `GET /weather` | `from`, `to`, `year`, `month` | Anomalías de NASA POWER junto a la anomalía de fuego (§8.10) |
| `GET /risk` | `w_anomaly`, `w_recurrence`, `w_exposure`, `w_season`, `w_fwi` | Índice de prioridad con componentes y pesos (§8.16) |
| `GET /recent` | `hours` (24/48) | Detecciones NRT |
| `GET /return-period`, `/weekday`, `/night` | `year`, `month` | Periodo de retorno, firma humana y fuego nocturno |
| `GET /territory`, `/recurrence`, `/regimes`, `/reported` | `from`, `to` | Exposición, recurrencia, regímenes y reportes CONAFOR |
| `GET /spread`, `/wind-localities` | `event_id`, `hours` | Cono indicativo y localidades a favor del viento |
| `GET /watch`, `/bulletin` | `level`, `country` | Unidades fuera de lo normal y boletín del vigía |
| `GET /drill` | `pick`, `event_id` | Escenario de simulacro con un evento real |
| `GET /alerts/cap` | — | Feed Atom con alertas CAP aprobadas para ejercicio |
| `POST /cap/draft`, `/cap/approve/{id}` | `area`, `text`, `severity` | Borrador CAP y aprobación humana |
| `POST /resolve-area` | `text` | Intención estructurada y geometría candidata |
| `POST /reports/extract` | `text` | Registros validados de un reporte oficial |
| `POST /sql` | `query` | Consulta de solo lectura sobre las vistas Parquet |
| `GET /hotspots.geojson`, `/export.kml`, `/ogc/...` | `from`, `to`, `limit` | Geodatos y OGC API Features |

En modo real (`FIRELY_API_MODE=real`) todos los routers están montados en `api/app/main.py`; las rutas simuladas que comparten ruta quedan sombreadas y fuera del esquema, así que `/docs` documenta cada endpoint real una sola vez. El contrato vive en `api/openapi.yaml`.

**Ejemplo de respuesta de `/calendar`** (abreviado):

```json
{
  "area": {"type": "h3", "cells": 42},
  "methodology_version": "1.0.0-qm-biome-month",
  "data_cutoff": "2026-11-12",
  "harmonization_uncertainty": {"years_estimated": [2000, 2011], "median_rel_error": 0.18},
  "attribution": "NASA FIRMS",
  "reference": "median",
  "rows": [
    {"year": 2021, "month": 3, "count_harm": 412.5, "anomaly_ratio": 3.4,
     "percentile": 0.96, "return_period_years": 25, "clear_frac": 0.81,
     "is_estimated": false}
  ]
}
```

**Operación.** Límite de solicitudes por IP, caché de respuestas, CORS abierto para el widget, registro de uso.

### 12.2 OGC API Features

Colecciones de puntos de calor y eventos servidas con el estándar OGC (por ejemplo, con pygeoapi sobre los mismos datos), para abrirlas directamente en QGIS, ArcGIS u otras herramientas SIG.

### 12.3 Widget embebible

Web Component independiente del framework del sitio que lo usa:

```html
<script src="https://firely.app/widget.js"></script>
<firely-calendar lat="25.38" lon="-100.6" radius-km="30"></firely-calendar>
```

**Atributos:** `lat`, `lon`, `radius-km`, `admin`, `bbox`, `view` (`count`/`anomaly`), `lang` (`es`/`en`/`pt`), `theme` (`light`/`dark`/`auto`), `compact`.

**Contenido:** nombre del área, calendario en miniatura, semáforo del mes, logo con enlace a la vista completa y atribución. Estilos encapsulados (Shadow DOM) para no chocar con el sitio anfitrión.

### 12.4 Servidor MCP

Servidor del Model Context Protocol (con el SDK oficial de Python) que expone las mismas herramientas de la API. Cualquier asistente compatible puede consultar el historial de fuego armonizado. Cada resultado incluye versión metodológica y atribución.

**Implementación.** `mcp/server.py` (stdio) tiene 19 herramientas: `resolve_area`, `calendar`, `return_period`, `events`, `context`, `weather`, `weekday`, `night`, `season`, `analogs`, `risk`, `spread`, `wind_localities`, `regimes`, `reported`, `recent_hotspots`, `watch`, `bulletin` y `drill_scenario`. Todas llaman a la API HTTP (`FIRELY_API_URL`), así que las cifras son las mismas que ve la app. Instrucciones de conexión en `mcp/README.md` y en Plataforma › Servidor MCP.

### 12.5 Modo offline móvil (pendiente)

**Estado real (15 de noviembre de 2026).** No existe una PWA implementada. La rama `feat/mobile-main-ec2` añade persistencia de consultas para Android con Capacitor y Filesystem; la prueba en teléfono y la conexión al backend público de EC2 siguen pendientes. Consumir la API por sí solo no proporciona modo offline.

El objetivo para la app móvil es descargar un área antes de salir a campo, conservar sus consultas y mostrar claramente la fecha de descarga, el corte de los datos y qué contenido está disponible sin señal. Las teselas del mapa requieren una estrategia propia de descarga y almacenamiento.

La implementación inicial de esa rama guarda respuestas de la API por área y filtros, con su fecha y procedencia. El mapa base y las condiciones recientes requieren conexión. Parquet y DuckDB-WASM son una alternativa futura, no una capacidad existente. La integración móvil y los criterios de aceptación se detallan en `mobile-main-ec2.md` y `../web/ANDROID.md`.

### 12.6 Ingesta y actualización

- **Diaria:** job programado que descarga NRT de FIRMS, aplica limpieza y máscara estática, asigna celdas y eventos, actualiza `cell_day`, `cell_month` del mes en curso y `events` activos, y regenera los Parquet afectados.
- **Periódica:** cuando FIRMS publica nuevos datos de archivo científico, se reemplazan los NRT de ese periodo.
- **Después de la ingesta:** evaluación de alertas y agente vigía.

---

## 13. Arquitectura, stack y entorno

### 13.1 Diagrama

```
  NASA FIRMS (SP + NRT)   Land Cover   Nubes   POWER   GFWED   ONI   Límites/Población
            │                 │          │       │       │      │          │
            └────────────┬────┴──────────┴───────┴───────┴──────┴──────────┘
                         ▼
              Pipeline (Python: pandas/polars, h3, scipy, lightgbm)
              limpieza → armonización → eventos → estadísticas
                         ▼
              Parquet en bucket (hotspots, cell_month, cell_day, events, cell_stats…)
                 │                         │                          │
                 ▼                         ▼                          ▼
     Frontend + DuckDB-WASM         API FastAPI + DuckDB        Jobs programados
     (mapa, calendario)             (REST, OGC, CAP)            (ingesta NRT, alertas, vigía)
                 │                         │
                 │             ┌───────────┼────────────┬───────────────┐
                 ▼             ▼           ▼            ▼               ▼
             Usuario       Widget     Servidor MCP   Bot Telegram   Capa IA (Claude)
```

### 13.2 Stack

| Capa | Tecnologías |
|---|---|
| Pipeline | Python, pandas o polars, h3, geopandas/shapely, scipy, pymannkendall, LightGBM |
| Almacenamiento | Parquet en bucket de nube |
| Consultas | DuckDB (servidor) y DuckDB-WASM (navegador) |
| API | FastAPI, pygeoapi (OGC) |
| Frontend | Framework web moderno, MapLibre GL, deck.gl (capa H3), librería de gráficas (D3, Observable Plot o ECharts), Terra Draw, h3-js |
| Audio | Web Audio API / Tone.js |
| PDF | Plantilla HTML + WeasyPrint o navegador sin interfaz |
| IA | API de Anthropic (Claude), SDK de MCP, modelo de voz a texto |
| Bot | python-telegram-bot |
| Infraestructura | Contenedores Docker, servicio serverless (por ejemplo, Cloud Run), jobs programados, CI/CD |
| Secretos | Gestor de secretos o variables de entorno; nunca en el repositorio |

### 13.3 Estructura del repositorio

```
firely/
├── pipeline/          # descarga, limpieza, armonización, eventos, estadísticas
├── notebooks/         # método reproducible y validación
├── api/               # FastAPI, OGC, CAP, herramientas compartidas
├── mcp/               # servidor MCP
├── ai/                # prompts, esquemas, agentes (vigía, extracción)
├── bot/               # bot de Telegram
├── web/               # frontend y widget
├── infra/             # Dockerfiles, CI/CD, despliegue
├── data/              # esquemas y muestras (no datos completos)
└── docs/              # metodología, API, guía de uso
```

### 13.4 Secretos

MAP_KEY de FIRMS, llave de la API de Anthropic, token del bot y credenciales de nube viven en un gestor de secretos o en variables de entorno. Nunca en el código, nunca en pantalla durante transmisiones.

### 13.5 Red: forzar IPv4 hacia NASA

En la red del equipo, las conexiones IPv6 hacia servidores de NASA (Giovanni, NCCS, Earthdata) no reciben respuesta y se quedan en `SYN-SENT`; con varias descargas en paralelo el proceso se congela por completo. Todo componente que descargue de NASA fuerza IPv4:

```python
import socket
import urllib3.util.connection as urllib3_cn
urllib3_cn.allowed_gai_family = lambda: socket.AF_INET
```

Con `wget` y `curl` se usa la opción `-4`. Las solicitudes llevan además un tiempo límite de conexión corto (por ejemplo, 15 s) para fallar rápido en vez de quedarse esperando. En el despliegue en la nube conviene verificar el mismo comportamiento.

### 13.6 Entorno de desarrollo

Arch Linux con shell fish y Python 3.14 del sistema. Las dependencias se instalan siempre en un entorno virtual (`python -m venv .venv` y `source .venv/bin/activate.fish`); si alguna librería no tiene versión para 3.14, se usa `uv` con Python 3.12. El desarrollo se apoya en Claude Code (versión de terminal), con el contexto del proyecto en `CLAUDE.md`.

---

## 14. Accesibilidad

- **Color:** rampas cividis (secuencial) y azul–blanco–rojo (divergente), aptas para las formas comunes de daltonismo; la información nunca depende solo del color (valores, patrones y texto).
- **Lectores de pantalla:** descripciones automáticas de cada gráfica; calendario navegable como cuadrícula con texto accesible por celda.
- **Teclado:** todas las funciones accesibles sin ratón.
- **Contraste:** objetivo WCAG 2.2 nivel AA en modo claro y oscuro.
- **Sonificación** del calendario.
- **Idiomas:** español, inglés y portugués.
- **Lenguaje:** explicaciones adaptadas al perfil.
- **Conectividad:** bot y modo offline para zonas con mala señal.

---

## 15. Ciencia abierta

- **Dataset armonizado:** agregados `cell_month` y `events`, más metadatos de metodología y validación. El depósito en Zenodo y el DOI siguen pendientes de publicación por el titular de la cuenta.
- **Notebook reproducible:** [armonización y validación sobre una región de ejemplo de Coahuila](../notebooks/armonizacion-coahuila.ipynb). Requiere los puntos FIRMS procesados localmente; usa el mismo código v1.2 del pipeline.
- **Cita sugerida del software y los agregados:** Equipo Firely. *Firely: serie armonizada de puntos de calor MODIS–VIIRS*, versión `1.2.0-hybrid-biome`. Consulta [CITATION.cff](../CITATION.cff). Añade el DOI cuando se publique el dataset.
- **Fuente original:** NASA FIRMS (MODIS/VIIRS). Cita también los productos FIRMS específicos usados, sus versiones y fecha de acceso al publicar un análisis.
- **Licencia:** se definirá con los autores antes de publicar el repositorio y los datos derivados; las fuentes de terceros conservan sus propias condiciones.

---

## 16. Fuentes de datos y licencias

| Fuente | Uso | Nota |
|---|---|---|
| NASA FIRMS | Puntos de calor | Usar el texto oficial de cita de FIRMS en app, API, widget y descargas |
| MODIS Land Cover, productos de nubes y máscara de fuego (NASA) | Armonización, clasificación, nubes | Datos abiertos de NASA |
| NASA POWER | Meteorología | Revisar términos y cita |
| NASA GISS GFWED | Peligro meteorológico de incendio | Revisar disponibilidad de pronóstico y cita |
| NOAA ONI | El Niño / La Niña | Dominio público |
| NOAA GOES | Detección geoestacionaria | Datos abiertos |
| OpenStreetMap / Nominatim | Geocodificación | Licencia ODbL y política de uso de Nominatim |
| INEGI | Límites y localidades de México | Revisar términos |
| GADM / geoBoundaries | Límites mundiales | GADM tiene restricciones de uso comercial; geoBoundaries es alternativa abierta |
| GHSL / WorldPop / GeoNames | Población y localidades | Revisar licencias |
| CONANP / Protected Planet (WDPA) | Áreas protegidas | WDPA tiene condiciones de uso propias |
| CONAFOR | Incendios reportados | Verificar disponibilidad y términos |
| Servicio de pronóstico (por ejemplo, Open-Meteo) | Viento pronosticado | Revisar términos |

Regla del reto: para sitios que no son del gobierno de EE. UU., cumplir los parámetros de uso de datos de cada sitio.

---

## 17. Limitaciones conocidas

Transparencia que también suma ante el jurado:

- **Punto de calor no es incendio.** Un incendio produce muchos puntos; una quema agrícola pequeña puede no producir ninguno.
- **Fuegos pequeños, breves o bajo dosel** pueden no detectarse, sobre todo con MODIS.
- **Nubes y humo denso** ocultan el fuego; la corrección mitiga pero no elimina el problema.
- **Los años 2000–2011 son estimaciones** armonizadas, con incertidumbre mayor que los años con VIIRS.
- **La extensión aproximada de un evento no es área quemada.**
- **La clasificación agrícola/forestal es aproximada.**
- **El cono de propagación y las localidades a favor del viento son indicativos**, no modelos de comportamiento del fuego.
- **Los periodos de retorno largos son extrapolaciones** con ~25 años de datos.
- **Las correlaciones con meteorología o El Niño son contexto**, no causalidad demostrada.
- **Suomi-NPP terminó en noviembre de 2026.** A partir de ahí la referencia VIIRS es NOAA-20 calibrado contra S-NPP; cualquier error en esa intercalibración se propaga a los meses más recientes.
- **La corrección por nubes usa datos de Aqua**, que empiezan en julio de 2002 y tienen resolución de 1°; es una aproximación regional, no una máscara por píxel.
- **GFWED tiene unos meses de retraso** en su versión histórica; para los últimos meses se usa el pronóstico experimental GEOS-5.
- **El componente FWI del índice de prioridad solo existe donde hay tabla de contexto** (hoy, celdas de Coahuila con años GFWED completos); fuera de ahí el índice se renormaliza sin él y lo declara.
- **NASA POWER se consulta en el centroide del área** (malla de 0.5°): en áreas grandes o de relieve complejo, el clima del centroide no representa toda el área.
- **La extracción de reportes no sustituye la captura oficial:** copia valores del texto y valida tipos y sumas, pero un PDF escaneado sin capa de texto necesita OCR antes.
- **La transcripción de notas de voz depende de un modelo local opcional** (`faster-whisper`); sin él, el bot pide escribir la pregunta.
- **Modo sin conexión móvil en validación:** la rama `feat/mobile-main-ec2` guarda respuestas de la API por área y filtros; faltan pruebas en teléfono y con EC2. No existe una PWA ni descarga offline del mapa base.

---

## 18. Glosario

| Término | Significado |
|---|---|
| Punto de calor (hotspot) | Píxel donde el satélite detectó una anomalía térmica compatible con fuego |
| MODIS | Sensor de los satélites Terra y Aqua; serie desde 2000, ~1 km |
| VIIRS | Sensor de S-NPP, NOAA-20 y NOAA-21; serie desde 2012, 375 m |
| FIRMS | Sistema de NASA que distribuye detecciones de fuego |
| FRP | Fire Radiative Power: potencia radiativa del fuego, en MW |
| NRT | Near Real Time: datos casi en tiempo real |
| H3 | Sistema de malla hexagonal jerárquica |
| Quantile mapping | Técnica que transforma una distribución para que coincida con otra cuantil a cuantil |
| Traslape | Periodo (2012+) en que MODIS y VIIRS observan simultáneamente |
| Anomalía | Diferencia o razón respecto a la referencia histórica (mediana o promedio) |
| Periodo de retorno | Tiempo promedio entre eventos de cierta magnitud |
| Año de fuego | Año que empieza en el mes de menor actividad histórica del área |
| FWI | Fire Weather Index: índice meteorológico de peligro de incendio |
| ONI | Oceanic Niño Index: índice para clasificar El Niño y La Niña |
| CAP | Common Alerting Protocol: estándar de alertas de emergencia |
| MCP | Model Context Protocol: estándar para conectar herramientas a asistentes de IA |
| OGC API Features | Estándar para servir datos geográficos vectoriales por web |
| PWA | Aplicación web instalable con capacidad offline |
| SP / NRT | Standard Processing (archivo de calidad científica) / Near Real Time (casi tiempo real) |
| NCCS | NASA Center for Climate Simulation; su Dataportal distribuye GFWED |
| Giovanni | Herramienta de NASA para recortar, promediar y descargar productos atmosféricos |
| AppEEARS | Herramienta de NASA para extraer subconjuntos de productos terrestres (MODIS, SRTM) |
| IGBP | Clasificación de cobertura del suelo de 17 clases usada por MCD12Q1 `LC_Type1` |
