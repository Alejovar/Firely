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
17. Estado de implementación

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

---

## 17. Estado de implementación (14 de noviembre de 2026)

Revisión del repositorio contra los criterios de "terminado" de §2. **Hecho** = existe en código, con pruebas, y se ve en la app o en la API; **parcial** = funciona con límites declarados; **pendiente** = no existe todavía. Los criterios de §2 siguen siendo la referencia: una función solo cuenta como terminada cuando se ve en la demo desplegada.

### 17.1 Completado en esta revisión

| Función | Qué se hizo | Dónde |
|---|---|---|
| Routers sin montar | `/sql`, `/bulletin`, `/cap/*`, `/spread`, `/wind-localities`, `/regimes`, `/ogc/...` y `/export.kml` tenían código y pruebas, pero **no respondían en el despliegue** porque no estaban montados en la app. Ahora se montan en modo real, y las rutas simuladas sombreadas salen del esquema de `/docs` | `api/app/main.py` |
| Contexto meteorológico NASA POWER (§8.10) | Nuevo `GET /weather`: anomalías de precipitación, temperatura, humedad y viento junto a la anomalía de fuego, con la frase "el marzo más seco desde…" calculada. IPv4 forzado y caché en disco | `api/app/weather_routes.py`, pestaña Contexto |
| Índice de prioridad con pesos ajustables (§8.16) | Pesos por parámetro (`w_*`), componente FWI (GFWED) donde hay datos y deslizadores en la pestaña Riesgo | `api/app/extra_routes.py`, `ContextExtras.tsx` |
| Localidades a favor del viento (§8.14) en la UI | Panel con dirección, alcance y localidades (antes solo existía en la API) | pestaña Riesgo |
| Feed CAP (§10.2) | `GET /alerts/cap` en modo real es un feed Atom con los borradores **aprobados para ejercicio**; la web crea, revisa y aprueba borradores en el servidor | `pro_routes.py`, Plataforma › Alertas |
| Extracción de reportes oficiales (§11.2) | `POST /reports/extract`: reglas + LLM opcional con esquema, validación de tipos, rangos y totales, marcas de revisión; no guarda nada | `ai/reports.py`, `reports_routes.py`, Plataforma › Reportes |
| SQL para científicos (§11.2) | La UI ejecuta consultas de solo lectura con ejemplos y descarga CSV (antes decía "VISIÓN") | Plataforma › Consultas SQL |
| Agente vigía (§11.2) | Boletín del área actual desde `/bulletin` en la UI | Plataforma › Agente vigía |
| Escenarios de simulacro (Nivel 3 → hecho) | `GET /drill`: cuatro etapas con un evento real del área; recorrido paso a paso en la web | `drill_routes.py`, Plataforma › Simulacros |
| Servidor MCP (§12.4) | De 7 a 19 herramientas (eventos, contexto, clima, viento, regímenes, reportes, boletín, simulacro…) | `mcp/server.py` |
| OGC API Features (§12.2) | Enlace y guía para QGIS en la UI (antes "PRÓXIMAMENTE") | Plataforma › Exportar a SIG |
| Bot con notas de voz (§11.2) | Texto libre, ubicación compartida, `/semaforo`, `/hoy` y notas de voz con transcripción local opcional | `bot/telegram_bot.py`, `bot/stt.py` |
| PWA offline (§12.5) | Fuera de la web: el modo sin conexión lo cubre la app Android (Android Studio) del equipo, que consume la API | — |
| Contrato | `api/openapi.yaml` incluye los endpoints nuevos y los parámetros de pesos | `api/openapi.yaml` |

Pruebas: `tests/test_api_new.py` (18) y `tests/test_bot_extra.py` (8). La suite de Python (129) y la de la web (46) pasan, y `vite build` compila.

**Segunda ronda (backend, sin cambios en `web/`):**

| Función | Qué se hizo | Dónde |
|---|---|---|
| Riesgo próximo GFWED (§8.11) | `GET /risk/forecast`: baja del pronóstico GEOS-5 de 8 días (corrida más reciente, retrocede hasta 6 días) solo los renglones que cruzan el área con peticiones HTTP Range (IPv4, sin librerías NetCDF en la imagen); FWI medio diario frente a la climatología 1981–2010 (`pipeline.fwi_climatology` → `context/fwi_longterm_month.parquet`), o percentil del histórico del área, o clase EFFIS absoluta; frase "esta semana el peligro meteorológico es X". Caché en `FIRELY_STATE_DIR`; sin red sirve la última corrida en caché como `stale` o responde 503 `gfwed_forecast_unavailable`. Probado contra NASA el 14-nov-2026 | `api/app/forecast_routes.py`, `pipeline/fwi_climatology.py` |
| Índice de prioridad por celda (§8.16) | `GET /priority/cells`: GeoJSON H3 r6 con índice 0–100, desglose por componente y top 10; mismos pesos y helpers que `/risk` (refactorizados, sin duplicar). Celdas sin historia armonizada salen como "sin datos" | `api/app/priority_routes.py`, `extra_routes.py` |
| Alertas por suscripción (§10.1) | `POST/GET/DELETE /subscriptions` (almacén JSON en `FIRELY_STATE_DIR`, `chat_id` enmascarado) y job diario idempotente `pipeline.alerts_job`: evalúa con el índice real y la anomalía del último mes, envía por Telegram (`bot/client.py`) solo suscripciones **aprobadas por el operador** (`--approve`), mensajes marcados EJERCICIO/PRUEBA, una vez por (suscripción, mes); sin token = dry-run. Cron documentado en `infra/README.md` | `api/app/subscriptions_routes.py`, `pipeline/alerts_job.py` |
| Ingesta NRT a tablas (§17.3 paso 2) | `python -m pipeline.nrt`: job diario que guarda las detecciones NRT de 48 h de México y Argentina en `nrt/<País>/date=AAAA-MM-DD/part.parquet`, filtradas al país y deduplicadas; sin `FIRMS_MAP_KEY` sale con código 2 y mensaje claro | `pipeline/nrt.py` |

Pruebas: `tests/test_jobs_forecast.py` (7, red simulada). Suite de Python: 136 en verde.

### 17.2 Estado por nivel

| Nivel | Función | Estado | Nota |
|---|---|---|---|
| 0 | Descarga, limpieza, armonización, validación, Parquet | Hecho | Armonización v1.2; validación año-fuera contra factor fijo (`harmonization_summary.json`) |
| 0 | Gráfica estrella, "Cómo armonizamos", calendario, desglose, CSV/PNG, atribución | Hecho | |
| 0 | Capa 24/48 h | Parcial | `/recent` requiere `FIRMS_MAP_KEY` en el servidor. El job `pipeline.nrt` ya guarda NRT en Parquet, pero no se ha corrido con clave real (no hay `FIRMS_MAP_KEY` en este equipo) y ninguna ruta lee aún `nrt/` |
| 0 | Despliegue | Parcial | `docker compose up --build` listo; falta URL pública probada desde otra red |
| 1 | Lenguaje natural, años análogos, curva de ritmo, temporada, retorno, día de la semana, nocturno, El Niño, recurrencia, comparador, perfiles, multilenguaje, widget, GeoJSON/KML, API + `/docs` | Hecho | |
| 1 | Contexto meteorológico (POWER) | Hecho | Nuevo en esta revisión |
| 1 | Índice de prioridad | Hecho | v1 con pesos ajustables, por área (`/risk`) y por celda (`/priority/cells`, GeoJSON + top 10). La capa por celda aún no se dibuja en la web |
| 1 | Agrícola vs forestal | Parcial | Filtro por cobertura del suelo; sin clasificador temporal |
| 1 | Ficha PDF | Parcial | Falta el código QR a la vista en vivo |
| 1 | CAP | Hecho | Feed Atom de ejercicios aprobados |
| 1 | MCP | Hecho | 19 herramientas por stdio; no hay despliegue HTTP del servidor MCP |
| 2 | Corrección por nubes | Parcial | Celdas con `clear_frac < 0.5` marcadas en el calendario (solo Coahuila); sin vista corregida |
| 2 | Superresolución "VIIRS virtual" | Pendiente | Necesita el DEM de Coahuila y un modelo entrenado |
| 2 | Regímenes, cono, viento, detectados vs reportados, SQL, vigía, comunicados, extracción, bot, PWA, modo historia, sonificación, OGC | Hecho | PWA v1 guarda respuestas de la API, no Parquet + DuckDB-WASM |
| 2 | Riesgo próximo GFWED (pronóstico de 8 días) | Hecho (API) | `/risk/forecast` con el pronóstico GEOS-5 real; climatología 1981–2010 solo en Coahuila (fuera: clase EFFIS absoluta). Falta mostrarlo en la web |
| 2 | Alertas por suscripción | Parcial | Endpoints + job diario + envío por Telegram con aprobación humana listos y probados con mocks; sin correo, sin envío real probado (no hay `TELEGRAM_BOT_TOKEN` aquí), la web aún usa sus suscripciones locales y la evaluación es mensual (último mes armonizado), no sobre NRT |
| 2 | Animación de 25 años | Parcial | Animación mes a mes del área en Historia; sin globo continental ni exportación a video |
| 3 | Capa GOES | Pendiente | Visible como "Visión · próximamente" en el mapa |
| 3 | Escenarios de simulacro | Hecho | Nuevo en esta revisión |
| CA | Dataset con DOI | Pendiente | Requiere publicar el dataset (Zenodo) |

### 17.3 Siguientes pasos sugeridos (en orden)

1. **Desplegar y probar desde otra red** con `FIRELY_API_MODE=real` (Nivel 0): ahora están montados todos los routers.
2. **Correr el job NRT con clave real** y programar el cron (`infra/README.md`); después, que `/recent` y las alertas lean `nrt/` para avisar con detecciones del día.
3. **Web**: capa por celda de `/priority/cells`, tarjeta de `/risk/forecast` y formulario que use `/subscriptions`.
4. **QR en la ficha PDF** y prueba de impresión en blanco y negro.
5. **DOI** del dataset y del notebook (§15).
6. Superresolución y GOES quedan como visión en el pitch si no hay tiempo.
