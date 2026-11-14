# FIRELY — Contexto integral para Codex CLI

> Documento de transferencia de contexto. Lee primero este resumen y luego los dos documentos íntegros incluidos debajo. **No comiences a modificar código hasta que el usuario lo solicite.**

## Estado de la conversación y decisiones

- Proyecto: Firely, NASA Space Apps Challenge 2026, reto **Harmonization of MODIS and VIIRS Hot Spots**, evento local de Saltillo.
- Objetivo: armonizar detecciones de fuego MODIS y VIIRS para crear un calendario histórico comparable y herramientas para investigación, prevención y respuesta.
- El equipo está **planeando** la implementación. Existe una propuesta de diseño desktop, no se debe asumir que el código ya está implementado.
- El equipo quiere desarrollar **dos aplicaciones en paralelo**: web/escritorio y móvil. Tienen **libertad para elegir tecnologías** y aún deben acordarlas.
- El usuario se está enfocando en **la aplicación móvil** y trabaja con Codex desde una terminal Fedora/Hyprland.
- Recomendación discutida, **no decisión confirmada**: React Native + Expo + TypeScript + Expo Router para móvil; React/TypeScript para web; backend/API compartida (el documento propone FastAPI). No imponer el stack sin consultar al equipo.
- Enfoque sugerido para móvil: experiencia de campo para brigadistas/Protección Civil, sin copiar en pequeño el dashboard de escritorio. MVP: mapa de hotspots, calendario histórico adaptado, resumen de anomalías, consulta de área/fechas por lenguaje natural, detecciones recientes/alertas, ficha compartible si alcanza el tiempo.
- Diseño de referencia mostrado en conversación: dashboard oscuro, acentos naranjas, barra superior con búsqueda en lenguaje natural y micrófono, menú lateral, mapa a la izquierda con puntos calientes y capas, panel derecho con semáforo de actividad y calendario de años por meses. Región de ejemplo: Sierra de Arteaga, Coahuila. Los números de la maqueta no deben asumirse verificados.
- Para móvil se propuso navegación por Mapa, Calendario, Análisis y Asistente; panel deslizable para capas/filtros; calendario en vista móvil legible y expandible. Son propuestas, no requisitos cerrados.
- Dos aplicaciones deben compartir **contratos de API y semántica científica**, no necesariamente componentes UI. No duplicar el backend.
- El plan original del equipo contempla frontend web/PWA y un rol FE. La decisión posterior de hacer una app móvil paralela requiere **revisar distribución de roles, tiempos y alcance**. No asumir que el plan de 48 horas ya fue actualizado.

## Reglas importantes para Codex

1. Antes de implementar, inspecciona el repositorio real y pregunta por decisiones aún abiertas.
2. Conserva los archivos existentes; no sobreescribas trabajo del equipo.
3. Usa los documentos originales como fuente de verdad sobre la ciencia y prioridades; este resumen solo añade el contexto de la conversación.
4. No inventes métricas, cifras de incendios, áreas, alertas, validaciones ni predicciones. Etiqueta claramente datos mock.
5. Diferencia hotspots satelitales de incendios confirmados, anomalías históricas de alertas operativas, y datos NRT de archivos científicos.
6. La armonización y validación son el núcleo del reto. La app móvil consume resultados armonizados de la misma fuente que la web.
7. Acordar temprano endpoints, filtros geográficos, fechas, paginación, formatos y esquema de respuesta con backend.
8. No introducir llaves, credenciales o secretos al código ni al repositorio.
9. Trabaja por tareas pequeñas, presenta plan antes de cambios grandes, prueba y explica resultados en español.
10. Prioriza MVP estable para demo de 48 horas. No presentar como listo lo que es visión o prototipo.

## Primer encargo recomendado (solo análisis)

Analiza estos documentos y el repositorio actual. No cambies archivos. Identifica decisiones pendientes para el equipo, propone stack móvil, arquitectura, contratos API y un MVP realista con fases de implementación. Separa hechos documentados, propuestas y supuestos.

---

# DOCUMENTO ORIGINAL 1: firely-descripcion.md (texto íntegro)

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
| Pares Aqua/S-NPP con el mismo horario de paso | Aísla el efecto de resolución y sensibilidad eliminando la diferencia de horario; la mayoría solo junta los CSV | §5.3 |
| Quantile mapping por bioma y mes | Corrección estándar en climatología, ajustada a cada tipo de vegetación y temporada | §5.4 |
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
| Escenarios de simulacro (visión) | Usa la historia para entrenar brigadas | §11.2 |

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
| PWA offline | Consulta sin señal en la sierra | §12.5 |
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

**Pares casi coincidentes.** Aqua-MODIS y Suomi-NPP VIIRS cruzan aproximadamente a la misma hora local. Calibrar Aqua contra S-NPP en los mismos días y pasos elimina casi por completo el efecto del horario y aísla el efecto de resolución y sensibilidad. Se usan solo pasos en que ambos sensores observaron la celda.

**Terra se calibra por separado**, porque su horario de media mañana capta un momento distinto del ciclo diario del fuego. Su factor de calibración incluye implícitamente ese efecto horario.

**NOAA-20 y NOAA-21** se intercalibran con S-NPP (mismo sensor, misma resolución) para que la serie VIIRS no salte cuando se suman satélites. La referencia es "un VIIRS equivalente": las detecciones se normalizan por número de satélites VIIRS activos o se usa solo S-NPP como referencia de largo plazo, con los demás como apoyo.

**Continuidad tras el apagado de S-NPP.** S-NPP fue la referencia VIIRS de 2012 a noviembre de 2026. Para que la serie no salte al dejar de existir, NOAA-20 se intercalibra contra S-NPP en su periodo común (2018–2026) y toma su lugar como referencia a partir de noviembre de 2026; NOAA-21 se calibra a su vez contra NOAA-20. El mismo procedimiento sirve para cualquier sensor futuro: siempre se calibra el nuevo contra el anterior en su traslape.

**Deriva orbital.** En los años recientes, el cambio en la hora de paso de Terra y Aqua altera su relación con VIIRS. La calibración se estima por ventanas de tiempo para detectar y corregir esa deriva, o se restringe a los años de órbita estable si el cambio es significativo.

### 5.4 Quantile mapping por bioma y mes

Para cada combinación de **bioma** (clases IGBP agrupadas: bosque, matorral, pastizal/sabana, cultivo, otros) y **mes**:

1. Se toman los valores por celda-paso (o celda-día) de MODIS y VIIRS en el traslape.
2. Se construyen las funciones de distribución acumulada empíricas de ambos.
3. Cada valor MODIS se transforma al valor VIIRS que ocupa el mismo cuantil.

**Tratamiento de ceros.** Los conteos tienen muchísimos ceros (celdas sin fuego). Se usa un enfoque en dos partes:

- **Ocurrencia:** probabilidad de que VIIRS detecte fuego en una celda dado lo que vio MODIS (incluyendo cuando MODIS vio cero, porque VIIRS detecta fuegos pequeños que MODIS no ve).
- **Intensidad:** cuando hay fuego, el quantile mapping transforma la magnitud.

El valor armonizado es el valor esperado combinando ambas partes.

**Plan B** si no da tiempo: un solo quantile mapping global por mes, sin separar biomas, documentado como versión simplificada.

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

#### Escenarios de simulacro (visión)

**Qué es.** Ejercicios de entrenamiento para brigadas basados en incendios históricos reales del área.

**Cómo funciona.** Se toma un evento real y su contexto (fecha, temporada, meteorología, exposición); el LLM arma un escenario por etapas con preguntas de decisión ("es 15 de marzo, la temporada va adelantada y aparece este evento a 8 km de una localidad, ¿qué priorizan?"). Los datos del escenario vienen del historial; el LLM solo estructura la narrativa.

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
| `GET /context` | `from`, `to` | Anomalías meteorológicas y fase ONI |
| `GET /risk` | — | Riesgo próximo, exposición, índice de prioridad |
| `GET /recent` | `hours` (24/48) | Detecciones NRT |
| `GET /alerts/cap` | — | Feed CAP |
| `POST /resolve-area` | `text` | Intención estructurada y geometría candidata |

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

Servidor del Model Context Protocol (con el SDK oficial de Python) que expone las mismas herramientas de la API: `resolve_area`, `get_calendar`, `get_events`, `get_analogs`, `get_season`, `get_context`, `get_risk`, `get_recent_hotspots`. Cualquier asistente compatible puede consultar el historial de fuego armonizado. Cada resultado incluye versión metodológica y atribución.

### 12.5 PWA offline

- La app se instala como PWA.
- El usuario descarga un área antes de salir a campo: se guardan en el navegador (IndexedDB u OPFS) los Parquet filtrados del área, la climatología y las teselas básicas del mapa.
- DuckDB-WASM consulta esos datos sin conexión.
- Indicador claro de "disponible sin conexión" y de la fecha de los datos guardados.

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
     (mapa, calendario, PWA)        (REST, OGC, CAP)            (ingesta NRT, alertas, vigía)
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
├── web/               # frontend, PWA, widget
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

- **Dataset armonizado** (agregados `cell_month` y `events`, más metadatos) publicado en un repositorio con DOI (por ejemplo, Zenodo, que se integra con GitHub para versionar).
- **Notebook reproducible** que ejecuta el método completo sobre una región de ejemplo, incluida la validación.
- **Código abierto** con licencia permisiva.
- **Cita sugerida** del dataset, junto con la cita oficial de NASA FIRMS.
- Enlazado desde la página del proyecto, la página "Cómo armonizamos" y `/docs`.

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


---

# DOCUMENTO ORIGINAL 2: firely-plan.md (texto íntegro)

# Firely — Plan de ejecución detallado

**NASA Space Apps Challenge 2026 · Evento local presencial en Saltillo**

Este documento define **qué se construye, en qué orden, quién lo hace, cómo sabemos que está terminado y cómo se presenta**. La descripción técnica de cada función está en `firely-descripcion.md` (las referencias como "§8.2" apuntan a sus secciones).

---

## Índice

1. Objetivo y criterio de decisión
2. Niveles y criterios de "terminado"
3. Equipo y responsabilidades
4. Antes del evento
5. Arranque: horas 0–2
6. Horario por rol
7. Puntos de control
8. Orden de recorte
9. Riesgos y planes B
10. Guion del pitch
11. Guion de la demo
12. Preguntas probables del jurado
13. Materiales de envío
14. Factores que deciden ganar
15. Reglas del equipo durante el hackathon
16. Principios no negociables

---

## 1. Objetivo y criterio de decisión

**Objetivo:** ganar el evento local de Saltillo y ser nominados al jurado global con un proyecto que resuelva de verdad el núcleo del reto (la armonización) y demuestre impacto real.

**Criterios oficiales de Space Apps** que guían cada decisión: impacto, creatividad, validez, relevancia y presentación (verificar la lista vigente en el sitio oficial).

**Criterio de decisión durante el fin de semana:** un núcleo impecable con pocos módulos perfectos le gana a muchas funciones a medias. Ante cualquier duda: ¿esto fortalece la armonización, la demo o la evidencia de impacto? Si no, espera.

---

## 2. Niveles y criterios de "terminado"

Cada función tiene un responsable, un criterio de "terminado" verificable y un plan B. Una función solo cuenta como terminada si cumple su criterio **en la demo desplegada**, no solo en la computadora de alguien.

Roles abreviados: **DAT** Datos y armonización · **AN1** Análisis 1 · **AN2** Análisis 2 · **BIA** Backend + IA · **FE** Frontend · **PP** Pitch y producto.

### 2.1 Nivel 0 — Núcleo (horas 0–20)

**Nunca se recorta.**

| Función | Resp. | Terminado cuando | Plan B |
|---|---|---|---|
| Descarga y limpieza (§4, §5.2) | DAT | Archivo FIRMS de las regiones de la demo limpio, `type = 0`, confianza homologada | Reducir a un solo país |
| Armonización (§5.3–5.5) | DAT | `count_harm` y `frp_harm` para 2000–hoy en las regiones de la demo, con quantile mapping por bioma y mes | Quantile mapping global por mes (§5.4 Plan B) |
| Validación (§5.8) | DAT | Métricas por año fuera y cifra de mejora frente a la línea base ingenua | Validación con 3 años fuera en lugar de todos |
| Tablas Parquet (§6) | DAT | `hotspots`, `cell_month`, `cell_day`, `climatology` publicadas en el bucket con el esquema acordado | `events` y `cell_stats` pasan a Nivel 1 |
| Gráfica estrella (§5.9) | DAT + FE | Visible en la app con la región de la demo | Imagen estática generada en el notebook |
| Página "Cómo armonizamos" (§5.10) | PP + FE | Página con método, gráfica, métricas y limitaciones | Sección dentro de la página del proyecto |
| Selección de área básica (§7.2) | FE | Dibujo, lat/lon y búsqueda administrativa funcionando | Solo dibujo y lat/lon |
| Rango de fechas (§7.2) | FE | Selector que filtra calendario y mapa | Solo años completos |
| Calendario (§7.3) | FE | Conteo y anomalía, mediana/promedio, marcas de estimación, tooltips | Solo conteo y anomalía con mediana |
| Desglose diario (§7.3) | FE | Clic en mes muestra días y filtra el mapa | Lista de días sin gráfica |
| Capa 24/48 h (§7.4) | BIA + FE | Detecciones NRT de las últimas 48 h en el mapa | Datos NRT descargados una vez al inicio |
| Rampas accesibles (§14) | FE | Cividis y divergente aplicadas; información no depende solo del color | — |
| CSV y PNG/SVG (§9) | BIA + FE | Descargas funcionando con metadatos y atribución | Solo CSV de agregados |
| Atribución FIRMS (§3, §16) | Todos | Visible en app, descargas y API | — |
| Despliegue | DAT | App y API en una URL pública | Demo local con video de respaldo |

### 2.2 Nivel 1 — Diferenciadores principales (horas 18–34)

| Función | Resp. | Terminado cuando |
|---|---|---|
| **Área y fechas por lenguaje natural (§7.2)** — prioridad alta, horas 10–20 | BIA + FE | La frase "incendios en la sierra de Arteaga en marzo de 2021" produce el área correcta, las fechas y abre el calendario; la ambigüedad de "Arteaga" muestra opciones |
| Comparar incendios (§8.1) | AN1 | Tabla `events` y ranking del evento visible en la pestaña |
| Años análogos (§8.2) | AN1 | Top 3 años y rango de proyección en la curva |
| Curva de ritmo (§7.4) | AN1 + FE | Acumulado actual contra envolvente histórico |
| La temporada se mueve (§8.3) | AN1 | Fechas de inicio/pico/fin por año con tendencia y frase |
| Periodo de retorno (§8.4) | AN1 | Frase "una vez cada X años" en tooltips y semáforo |
| Efecto día de la semana (§8.6) | AN1 | Gráfica y prueba con frase de resultado |
| Fuego nocturno (§8.7) | AN1 | Proporción nocturna por evento visible |
| El Niño / La Niña (§7.3) | AN1 | Etiqueta por año en el calendario |
| Agrícola vs forestal + filtro (§8.5) | AN2 | `burn_type` en datos y filtro del calendario funcionando |
| Recurrencia (§8.8) | AN2 | Dos mapas en la pestaña Largo plazo |
| Contexto meteorológico (§8.10) | AN2 | Anomalías de POWER junto a las de fuego |
| Exposición (§8.13) | AN2 | Porcentaje de puntos cerca de localidades y en áreas protegidas |
| Índice de prioridad (§8.16) | AN2 | Mapa y top 10 con desglose |
| Semáforo (§7.4) | AN1 + FE | Nivel y cifra del mes actual |
| Comparador lado a lado (§7.3) | FE | Dos calendarios sincronizados |
| Ficha PDF (§9) | PP + BIA | PDF de una página generado desde la app |
| Explicaciones por perfil (§11.2) | BIA | Selector brigadista/científico cambia textos |
| Redacción con LLM + plantillas (§11.2) | BIA | Ficha y descripciones redactadas, con respaldo si falla el LLM |
| Multilenguaje ES/EN/PT (§11.2) | BIA + FE | Interfaz y textos generados en los tres idiomas |
| Descripciones accesibles (§14) | BIA + FE | Cada gráfica con texto alternativo generado |
| "Ver datos" (§11.1) | BIA + FE | Cada cifra del LLM enlaza a su consulta |
| API + `/docs` (§12.1) | BIA | Endpoints principales desplegados y documentados |
| Widget (§12.3) | BIA + FE | Funciona incrustado en una página de ejemplo |
| Servidor MCP (§12.4) | BIA | Un asistente compatible responde usando las herramientas |
| CAP (§10.2) | BIA | Feed CAP válido con `status` de prueba |
| GeoJSON/KML (§9) | BIA | Descargas funcionando |

### 2.3 Nivel 2 — Ambiciosos en región piloto (horas 28–40)

Funcionan de verdad en una o dos regiones de la demo. En el pitch: "piloto listo para escalar".

| Función | Resp. | Terminado cuando |
|---|---|---|
| Corrección por nubes (§5.6) | DAT | Patrón rayado en celdas con poca visibilidad en la región piloto |
| Superresolución "VIIRS virtual" (§5.7) | DAT | Mapa antes/después con su métrica en la región piloto |
| Regímenes y cambio de régimen (§8.9) | AN1 | Mapa de regímenes y de cambios |
| Riesgo próximo GFWED (§8.11) | AN2 | Frase de riesgo para la semana en la región piloto |
| Cono de propagación (§8.12) | AN2 | Cono sobre un evento real de la demo |
| Localidades a favor del viento (§8.14) | AN2 | Sector y lista de localidades |
| Detectados vs reportados (§8.15) | AN2 + BIA | Comparación para al menos un estado |
| Alertas por suscripción (§10.1) | BIA | Una alerta real llega por correo o Telegram |
| Asistente con UI generativa (§11.2) | BIA + FE | Responde 5 preguntas de prueba con componentes correctos |
| Agente vigía (§11.2) | BIA | Boletín generado para la semana actual |
| Extracción de reportes (§11.2) | BIA | Un reporte oficial convertido a datos validados |
| Borradores de comunicados (§11.2) | BIA | Borrador CAP y texto de redes con botón de aprobación |
| SQL para científicos (§11.2) | BIA | Consulta generada, mostrada y ejecutada en solo lectura |
| Bot con notas de voz (§11.2) | BIA | Responde una nota de voz con texto e imagen |
| PWA offline (§12.5) | FE | Un área consultable en modo avión |
| Modo historia (§7.6) | FE + BIA | Recorrido completo para la región de la demo |
| Sonificación (§7.6) | FE | El calendario suena con las reglas definidas |
| Animación de 25 años (§7.6) | FE | Video exportado para el pitch |
| OGC API Features (§12.2) | BIA | Colección abierta en QGIS |

### 2.4 Nivel 3 — Visión (prototipo o maqueta)

| Función | Resp. | Terminado cuando |
|---|---|---|
| Capa GOES en vivo (§7.4) | DAT | Detecciones de un día de GOES sobre el mapa, o maqueta |
| Escenarios de simulacro (§11.2) | BIA + PP | Un escenario generado de un incendio real, o pantalla diseñada |

### 2.5 Entregable de ciencia abierta

| Función | Resp. | Terminado cuando |
|---|---|---|
| Dataset con DOI y notebook (§15) | DAT | Repositorio público con DOI y notebook que corre de principio a fin |

---

## 3. Equipo y responsabilidades

Hasta 6 personas (verificar el máximo vigente en las reglas).

### DAT — Datos y armonización
- **Dueño del camino crítico.** Su primera meta es que `cell_month` exista lo antes posible, aunque sea en versión simplificada.
- Descarga, limpieza, armonización, validación, línea base ingenua, incertidumbre.
- Corrección por nubes, superresolución, GOES.
- Notebook reproducible y publicación con DOI.
- Despliegue de infraestructura y CI/CD (bucket, contenedores, jobs).
- **Entrega clave:** la cifra de mejora frente a la línea base.

### AN1 — Análisis 1 (tiempo y temporadas)
- Eventos y ranking, años análogos, curva de ritmo, temporada que se mueve, periodo de retorno, día de la semana, fuego nocturno, El Niño, regímenes.
- Trabaja desde la hora 2 con datos sin armonizar y cambia a la versión final cuando esté lista.
- **Entrega clave:** el hallazgo principal para el pitch.

### AN2 — Análisis 2 (contexto, riesgo y espacio)
- Clasificación agrícola/forestal, recurrencia, NASA POWER, GFWED, exposición, viento, cono de propagación, detectados vs reportados, índice de prioridad.
- Prepara las capas de límites, localidades, población y áreas protegidas.

### BIA — Backend + IA
- API, OGC, CAP, widget, servidor MCP, ingesta NRT, alertas.
- Toda la capa de IA: lenguaje natural, asistente, redacción, perfiles, multilenguaje, vigía, extracción, comunicados, SQL, bot.
- Define los contratos de la API en la hora 0–2 y publica una versión simulada (con datos de prueba) en la hora 4.

### FE — Frontend
- App, mapa, calendario, desglose, comparador, pestañas, PWA, modo historia, animación, sonificación, descripciones accesibles en la interfaz, widget visual.
- Aplica la identidad visual diseñada en Claude Design.
- Trabaja contra la API simulada desde la hora 4.

### PP — Pitch y producto
- Guion del pitch y de la demo, slides, video, página del proyecto.
- Página "Cómo armonizamos" (contenido), ficha PDF (diseño y contenido).
- Pruebas de punta a punta de la demo cada vez que algo se integra.
- Contacto con usuarios reales y registro de su retroalimentación.
- Control del tiempo: anuncia cada punto de control.

### Si son menos de 6
- **5:** AN1 y AN2 se fusionan; los módulos de Nivel 2 de análisis se reducen.
- **4:** además, PP lo asume quien termine primero su parte de Nivel 1; el pitch se prepara desde la hora 30.
- **3 o menos:** Nivel 0 + selección por lenguaje natural + 5 módulos de Nivel 1 + API y widget. El resto, a diapositivas.

---

## 4. Antes del evento

Revisar primero qué permiten las reglas sobre trabajo previo. Lo que no se permita construir, al menos se puede planear e investigar.

### Reglas y reto
- [ ] Leer las reglas de Space Apps 2026: trabajo previo, tamaño de equipo, propiedad del código, formato de envío
- [ ] Revisar la pestaña de Recursos del reto (CONAE puede agregar datos)
- [ ] Revisar los criterios de evaluación vigentes
- [ ] Confirmar horarios del evento local, tiempo de pitch y formato de la presentación

### Accesos
- [x] MAP_KEY de FIRMS
- [x] Cuenta de Earthdata (para productos de nubes, cobertura y máscara de fuego)
- [ ] Llave de la API de Anthropic con crédito suficiente
- [ ] Proyecto de nube con facturación y límites de gasto configurados
- [ ] Bot de Telegram creado (token)
- [ ] Repositorio creado, con estructura de carpetas (§13.3 de la descripción) y CI básica

### Datos (si las reglas permiten prepararlos)
Detalle completo en `firely-descripcion.md` §4.3.
- [x] FIRMS MODIS 2000–2025 y NOAA-20 2018–2025 (resúmenes anuales, todos los países)
- [x] FIRMS S-NPP 2012–2025 y NOAA-21 2023–2025 de México y Argentina (solicitudes personalizadas)
- [x] FIRMS 2026, cuatro fuentes, México y mundo
- [x] MODIS Land Cover (MCD12Q1 `LC_Type1`) de México y Argentina, 2001 en adelante
- [x] Elevación SRTM de Coahuila
- [x] Fracción de nubes MYD08_M3 de Coahuila, 2002-07 a 2026-10
- [x] GFWED de Coahuila, 2017–2026, más promedio de largo plazo (opcional: ampliar a 2012)
- [x] Límites administrativos, localidades y áreas protegidas de México y Argentina
- [x] Población por localidad (ITER 2020)
- [x] Incendios reportados de CONAFOR, 2010–2024
- [x] Índice ONI
- [x] Ruta del pronóstico de 8 días de GFWED confirmada (se baja en vivo)
- [ ] Probar una consulta a NASA POWER forzando IPv4
- [ ] Términos de uso de cada fuente revisados y anotados
- [ ] Acomodar todo en `data/raw/` con una subcarpeta por fuente

### Usuarios reales
- [ ] Contactar a CONAFOR Coahuila, Protección Civil estatal o investigadores de fuego en universidades locales
- [ ] Agendar 15 minutos durante o justo después del evento para que prueben la app
- [ ] Preparar 3 preguntas para ellos: ¿qué usarían?, ¿qué falta?, ¿qué cambiarían?

### Diseño
- [ ] Identidad y pantallas principales en Claude Design
- [ ] Logo y paleta exportados

### Equipo
- [ ] Roles asignados
- [ ] Todos leyeron ambos documentos
- [ ] Herramientas instaladas y probadas (Python, Node, Docker, acceso a la nube, agentes de código)
- [ ] Claude Code instalado (`curl -fsSL https://claude.ai/install.sh | bash`) y `CLAUDE.md` en la raíz del repositorio
- [ ] Nombre del asistente de IA elegido (opciones: Misty, Drizzly, Brisa)

---

## 5. Arranque: horas 0–2

Las dos primeras horas definen si 6 personas pueden trabajar en paralelo sin bloquearse.

| Minuto | Actividad | Resultado |
|---|---|---|
| 0–15 | Repaso del objetivo, niveles y roles | Todos alineados |
| 15–45 | Esquemas de tablas (§6 de la descripción): columnas, tipos, particiones | Esquemas en `data/schemas` |
| 45–75 | Contratos de la API: endpoints, parámetros, formato de respuesta | Especificación OpenAPI inicial |
| 75–90 | Catálogo de componentes para la UI generativa y herramientas del LLM | Lista cerrada en `ai/` |
| 90–105 | Regiones de la demo y casos de prueba (Coahuila, Chilecito y una alternativa) | Polígonos y frases de prueba |
| 105–120 | Ramas, convenciones de commits, canal de comunicación, horario de puntos de control | Todos programando |

**Regla de oro:** después de la hora 2, cambiar un esquema o contrato requiere avisar a todos.

---

## 6. Horario por rol

Bloques aproximados. Los puntos de control (§7) mandan sobre este horario.

| Horas | DAT | AN1 | AN2 | BIA | FE | PP |
|---|---|---|---|---|---|---|
| 2–6 | Carga y limpieza; asignación H3 | Clustering de eventos con datos crudos | Capas de límites, localidades, áreas protegidas, cobertura | API simulada desplegada; esqueleto de extracción de intención | Mapa, selección por dibujo/lat-lon, esqueleto del calendario | Guion inicial; contacto con usuarios; página de metodología (borrador) |
| 6–10 | Calibración en el traslape (pares Aqua/S-NPP) | Curvas de temporada, análogos | Clasificación agrícola/forestal | Geocodificación y resolución de área | Calendario con datos simulados; rampas | Esquema de la ficha PDF |
| 10–14 | Quantile mapping; primera `cell_month` | Periodo de retorno, día de semana | Recurrencia, NASA POWER | **Lenguaje natural completo** | Integración del lenguaje natural; desglose diario | Prueba de punta a punta #1 |
| 14–20 | Validación y línea base; Parquet finales; despliegue | Cambio a datos armonizados; nocturno; El Niño | Exposición; índice de prioridad (v1) | Endpoints reales; CSV; NRT 48 h | Capa 48 h; descargas; gráfica estrella | Slides de problema y método |
| 20–24 | **Punto de control hora 24** (preparación) | Tendencias y semáforo | Ajustes con datos armonizados | Perfiles, multilenguaje, redacción | Pestañas de análisis | Ficha PDF v1 |
| 24–28 | Corrección por nubes (piloto) | Integración en pestañas | Riesgo GFWED | Widget; MCP; CAP | Comparador; semáforo; curva | Página del proyecto (borrador) |
| 28–34 | Superresolución (piloto) | Regímenes | Cono y viento; reportados | Asistente con UI generativa; GeoJSON/KML | Asistente en la UI; accesibilidad | Prueba de punta a punta #2; usuarios reales |
| 34–40 | Notebook y DOI; GOES (visión) | Hallazgo principal pulido | Pulido de textos y casos límite | Vigía, extracción, comunicados, SQL, bot, alertas | PWA, modo historia, sonificación, animación | Guion final; grabación de clips |
| 40–44 | **Congelar código.** Correcciones | Correcciones | Correcciones | Correcciones | Correcciones | Ensayo con demo real ×3 |
| 44–48 | Apoyo a materiales | Apoyo a materiales | Apoyo a materiales | Apoyo a materiales | Video de respaldo | Video, página, envío, ensayo final |

---

## 7. Puntos de control

En cada punto: 15 minutos, todos presentes, decisión explícita y anotada.

### Hora 12
- ¿Existe una primera `cell_month` armonizada (aunque sea simplificada)?
- ¿La API simulada y el calendario se comunican?
- ¿El lenguaje natural resuelve al menos un caso?
- **Si la armonización no ha salido:** activar el Plan B (quantile mapping global por mes) y seguir.

### Hora 24 (el corte más importante)
- ¿Nivel 0 completo y desplegado?
- ¿Cuántas funciones de Nivel 1 terminadas?
- **Si Nivel 0 no está completo:** todo el equipo ayuda a terminarlo; Nivel 2 se cancela salvo 2 piezas.
- **Si Nivel 0 está completo y Nivel 1 va a la mitad o más:** seguir el plan.
- Elegir **las 3–4 piezas de Nivel 2** que más se van a ver en la demo y priorizarlas.

### Hora 36
- ¿Nivel 1 completo?
- ¿La demo corre de punta a punta en la URL pública?
- Decidir qué de Nivel 2 y 3 entra a la demo y qué pasa a diapositivas.

### Hora 40
- **Congelar código.** Solo se corrigen errores.
- Cualquier función que no funcione de forma confiable se oculta de la interfaz.

---

## 8. Orden de recorte

Cuando el tiempo apriete, se recorta de arriba hacia abajo:

1. **Nivel 3 → diapositivas.** GOES y simulacros se muestran como visión.
2. **Nivel 2, piezas de menor visibilidad:** OGC, SQL avanzado, extracción de reportes, alertas por suscripción, PWA offline.
3. **Nivel 2, piezas científicas pesadas:** superresolución, regímenes, corrección por nubes (si se recorta, se menciona como siguiente fase).
4. **Nivel 2, piezas de demo:** se conservan las 3–4 más vistosas (por ejemplo, asistente, cono de propagación, sonificación, animación).
5. **Nivel 1 se protege.** Si algo de Nivel 1 no sale, se oculta antes que mostrarlo roto.
6. **Nivel 0 nunca se toca.**

**Lo mínimo que no puede faltar en la demo:** armonización con su cifra, gráfica estrella, calendario, lenguaje natural, CSV, una pestaña de análisis potente (comparar incendios o años análogos), ficha PDF y API con widget.

---

## 9. Riesgos y planes B

| Riesgo | Probabilidad | Impacto | Mitigación | Plan B |
|---|---|---|---|---|
| Descarga de datos lenta o bloqueada | Baja (ya descargados) | Alto | Datos ya descargados; respaldo en disco externo | Reducir a Coahuila + Chilecito |
| Conexiones a NASA colgadas por IPv6 | Alta (ya ocurrió) | Alto | Forzar IPv4 en todo código de descarga; `-4` en wget/curl | Descargar desde otra red o usar datos cacheados |
| Errores de intercalibración tras el apagado de S-NPP | Media | Medio | Validar NOAA-20 contra S-NPP en 2018–2026 | Mostrar los meses posteriores a nov 2026 con banda de incertidumbre ampliada |
| Armonización tarda o da malos resultados | Media | Muy alto | Punto de control en hora 12 | Quantile mapping global por mes; documentar como v1 |
| Volumen de datos excede memoria | Media | Alto | polars o DuckDB en lugar de pandas; procesar por año | Resolución H3 más gruesa |
| API del LLM falla o tarda en la demo | Media | Alto | Caché de respuestas de la demo; plantillas de respaldo | Video de respaldo del momento del asistente |
| Geocodificador limita solicitudes | Media | Medio | Respetar 1 consulta/s; cachear lugares de la demo | Lista local de lugares precargados |
| Internet del evento falla | Media | Muy alto | Video de respaldo; hotspot del celular | Demo con datos locales (DuckDB-WASM + PWA) |
| Integración de última hora rompe la app | Alta | Muy alto | Congelar código en hora 40; pruebas de punta a punta | Volver a la última versión estable (etiquetada) |
| Demasiadas funciones a medias | Alta | Muy alto | Criterios de "terminado" y puntos de control | Ocultar lo que no está listo |
| Fuente externa caída (POWER, GFWED, FIRMS NRT) | Baja | Medio | Cachear datos de las regiones de la demo | Mostrar datos cacheados con fecha |
| Gasto de nube o de API descontrolado | Baja | Medio | Límites de gasto y de uso configurados | Apagar servicios no esenciales |
| Llaves expuestas (por ejemplo, en transmisión) | Baja | Alto | Gestor de secretos; nunca llaves en el código o en pantalla | Rotar llaves de inmediato |
| Cansancio del equipo | Alta | Alto | Turnos de descanso de 2–3 h por persona, escalonados | Recortar alcance, no horas de sueño de quien presenta |

---

## 10. Guion del pitch

Duración objetivo: 4–5 minutos (ajustar al tiempo del evento local). Una persona presenta, otra maneja la demo.

### 0:00–0:30 — Problema
> "Durante más de 20 años, los satélites MODIS han registrado cada incendio del planeta. Pero se están retirando, y su reemplazo, VIIRS, ve el fuego con otros ojos. Es como comparar fotos de una cámara de 1 megapixel con las de un celular nuevo: el celular ve más incendios, pero no porque haya más fuego. Si no armonizamos los dos registros, perdemos dos décadas de historia justo cuando los incendios se están volviendo más frecuentes. Y no es una transición: es la tercera. Este mismo mes, el 2 de noviembre, otro satélite VIIRS, Suomi-NPP, dejó de enviar datos."

### 0:30–1:00 — Solución y prueba
> "Firely armoniza ambos sensores en una sola serie." *(Gráfica estrella: el salto de 2012 y su desaparición.)* "Usamos pares de satélites que pasan a la misma hora, corregimos por tipo de vegetación y mes, y lo validamos: nuestro método reduce el error un X% frente a la corrección simple."

### 1:00–3:30 — Demo
Ver §11. Una sola historia sobre un área, con ocho preguntas.

### 3:30–4:00 — Plataforma
> "Y no es solo una app. Cualquier institución puede usar estos datos." *(Página `/docs` 3 segundos; widget en un sitio de ejemplo de protección civil.)* "Tiene API, widget, se conecta con asistentes de IA y emite alertas en el estándar internacional de emergencias. Y los datos y el método son abiertos, con DOI."

### 4:00–4:30 — Cierre
> "Se lo mostramos a [usuario real], y nos dijo: [cita]." *(Si no hay usuario: hallazgo principal.)* "Con Firely descubrimos que [hallazgo]. Firely rescata 20 años de historia de fuego y la convierte en alertas que cualquier brigadista entiende."

### Notas
- Practicar con cronómetro al menos 3 veces con la demo real.
- Si algo falla en vivo, no explicar el error: pasar al video de respaldo de ese momento y seguir.
- El asistente de IA y la sonificación son momentos cortos; el protagonista es la armonización.

---

## 11. Guion de la demo

Preparar todo con la región elegida (la que muestre el resultado más claro). Abajo, la versión con Arteaga.

| Paso | Acción | Lo que se ve | Lo que se dice |
|---|---|---|---|
| 1 | Decir o escribir "muéstrame los incendios en la sierra de Arteaga en marzo de 2021" | Opciones Coahuila/Michoacán; se elige Coahuila; el mapa vuela, aparece el polígono, el calendario carga | "Sin coordenadas ni menús: una frase." |
| 2 | Señalar el calendario | 25 años de historia, marzo 2021 resaltado | "¿Qué pasó aquí? Veinticinco años, todos comparables." |
| 3 | Cambiar a anomalía; pasar el cursor | Rojo intenso; "una vez cada 25 años" | "¿Es normal? No: un marzo así ocurre una vez cada 25 años." |
| 4 | Pestaña Temporada | Tendencia de inicio de temporada | "Y la temporada empieza X días antes que hace 20 años." |
| 5 | Pestaña Este incendio | Ranking del evento | "Este fue el X.º incendio más grande registrado en la zona." |
| 6 | Pestaña Contexto | Sequía + día de la semana + El Niño | "¿Por qué? Fue el marzo más seco en una década, y el patrón semanal muestra origen humano." |
| 7 | Pestaña Riesgo | Exposición, viento | "¿A quién afecta? Estas localidades quedaban a favor del viento." |
| 8 | Volver al presente: semáforo y años análogos | Curva actual y abanico | "¿Qué viene? Los años más parecidos a este cerraron con actividad alta." |
| 9 | Índice de prioridad y ficha PDF | Mapa de prioridad; PDF de una página | "¿Qué hacemos? Aquí poner brigadas. Y esto se lleva a la reunión." |
| 10 | (Opcional) Pregunta al asistente o sonificación | Respuesta con componentes / sonido | Momento corto |

### Preparación de la demo
- Caché de todas las respuestas del LLM y del geocodificador para las frases de la demo.
- Pestañas precargadas.
- Navegador limpio, zoom ajustado al proyector, notificaciones desactivadas.
- Video de respaldo de cada paso, cortado por paso para poder saltar a cualquiera.
- Segundo dispositivo con la demo abierta por si falla el principal.

---

## 12. Preguntas probables del jurado

| Pregunta | Respuesta preparada (resumen) |
|---|---|
| ¿Cómo saben que la armonización funciona? | Validación dejando un año fuera en el traslape; cifra de mejora frente a la corrección simple; métricas por bioma en la página de metodología. |
| ¿Por qué no simplemente multiplicar MODIS por un factor? | Esa es nuestra línea base: el factor fijo ignora diferencias por vegetación, temporada y horario; nuestro método reduce el error un X%. |
| ¿Qué pasa con las nubes? | Distinguimos "no hubo fuego" de "no se pudo ver": marcamos las celdas con poca visibilidad y ofrecemos una vista corregida. |
| ¿Y la deriva de Terra y Aqua? | Calibramos por ventanas de tiempo para detectarla; Aqua se calibra contra S-NPP, que pasa a la misma hora. |
| ¿Un punto de calor es un incendio? | No; por eso agrupamos puntos en eventos y somos explícitos en las limitaciones. |
| ¿El LLM puede inventar datos? | No calcula ni genera cifras ni coordenadas; todo viene de la serie armonizada, cada cifra tiene "ver datos", y lo que se publica pasa por aprobación humana. |
| ¿Quién lo usaría? | Protección civil, brigadas, científicos, gestores de áreas protegidas; [mencionar usuario real]. |
| ¿Escala al mundo? | El pipeline es global; la demo usa regiones por tiempo. Malla H3 y Parquet permiten escalar. |
| ¿Cuánto cuesta operarlo? | Datos abiertos, consultas en el navegador y servicios serverless: costo bajo; el LLM es opcional y tiene respaldo. |
| ¿Qué pasa ahora que se apagó Suomi-NPP? | NOAA-20 se intercalibró contra S-NPP en su traslape (2018–2026) y toma su lugar como referencia; el método está hecho para encadenar sensores, uno contra el anterior. |
| ¿Por qué Aqua contra S-NPP y no Terra? | Pasan casi a la misma hora; así se aísla el efecto de resolución y sensibilidad del efecto horario. Terra se calibra aparte. |
| ¿Qué pasa con las fuentes industriales y volcanes? | Se excluyen con la columna `type` de FIRMS; en datos casi en tiempo real, que no la traen, con una máscara construida del histórico. |
| ¿Qué sigue? | Más sensores (GOES), validación con agencias, superresolución global, integración con sistemas oficiales vía CAP. |
| ¿Qué hicieron en el hackathon y qué ya existía? | Responder con transparencia según lo que permitieron las reglas. |

---

## 13. Materiales de envío

El jurado global solo ve esto. Revisar el formato exacto de este año (suele ser breve y estricto).

### Página del proyecto
- [ ] Resumen en un párrafo
- [ ] Problema y por qué importa
- [ ] Método de armonización con la gráfica estrella y la cifra de validación
- [ ] Funciones principales con capturas
- [ ] Caso de **Chilecito, La Rioja (julio 2026)**, el que menciona la autora del reto, y un caso de México
- [ ] Usuario real o hallazgo principal
- [ ] Uso de datos de NASA y demás fuentes, con atribución
- [ ] Uso de IA declarado y explicado (qué hace y qué no)
- [ ] Enlaces: app desplegada, repositorio, dataset con DOI, `/docs`
- [ ] Limitaciones

### Video o presentación
- [ ] Abre con la animación de 25 años
- [ ] Problema con la analogía de la cámara
- [ ] Gráfica estrella y cifra
- [ ] Demo condensada (lenguaje natural → calendario → anomalía → incendio → qué viene)
- [ ] Plataforma
- [ ] Cierre con la frase del proyecto
- [ ] Subtítulos en inglés
- [ ] Cumple duración y formato exigidos

### Técnico
- [ ] App desplegada y estable en la URL del envío
- [ ] Repositorio público con README claro
- [ ] Sin llaves ni secretos en el repositorio
- [ ] Licencias y atribuciones en el repositorio

---

## 14. Factores que deciden ganar

| Factor | Acción concreta | Responsable | Momento |
|---|---|---|---|
| Usuario real que lo valide | Contactar antes, mostrar la app 15 min, registrar su cita | PP | Antes y horas 28–36 |
| Cifra de validación | Línea base ingenua vs método; una frase con el porcentaje | DAT | Hora 20 |
| Hallazgo real | Revisar resultados de temporada, retorno y día de semana; elegir el más contundente | AN1 | Horas 30–36 |
| Materiales pulidos para el jurado global | Página y video con tiempo real, no a última hora | PP | Horas 36–48 |
| App desplegada y estable | URL pública probada desde otra red | DAT | Hora 20 en adelante |
| Video de respaldo | Grabado por pasos | FE + PP | Hora 42 |
| Identidad visual pulida | Diseño de Claude Design aplicado de forma consistente | FE | Todo el evento |

### Opcional: transmisión en vivo
- Acordarlo con el equipo y verificar las reglas del evento.
- Gestor de secretos activo desde la hora 0; nunca mostrar llaves, tokens ni consolas con credenciales.
- Guardar clips del proceso para el video de envío.

---

## 15. Reglas del equipo durante el hackathon

1. **Esquemas y contratos son ley** después de la hora 2.
2. **Integrar seguido:** nada se queda más de 4 horas sin integrarse a la rama principal.
3. **Etiquetar versiones estables** en cada punto de control.
4. **Nada roto en pantalla:** lo que no funcione se oculta.
5. **Descansos escalonados:** cada persona duerme o descansa al menos un bloque; quien presenta descansa antes del pitch.
6. **Pedir ayuda a los 30 minutos** de estar atorado.
7. **Agentes de código en paralelo:** cada rol con su agente sobre su carpeta; revisar todo lo que generen antes de integrarlo.
8. **Comunicación en un solo canal**, con un mensaje de estado en cada punto de control.

---

## 16. Principios no negociables

- Las cifras salen siempre de la serie armonizada; el LLM solo interpreta, consulta y redacta.
- Ninguna coordenada la genera el LLM.
- Nada se publica hacia la población sin aprobación humana; las alertas CAP de la demo usan estado de prueba.
- Atribución a NASA FIRMS y cumplimiento de términos de uso de todas las fuentes.
- La incertidumbre se muestra, no se esconde.
- Ninguna llave o secreto en el código ni en pantalla.
