# SPEC: «El salto falso», explicador de Firely y Gotita

GOAL:    quien lo ve entiende en una frase qué resuelve Firely ("el salto de 2012 es falso; Firely une MODIS y VIIRS en una sola serie y te avisa") y recuerda a Gotita.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps, español (México).
TIME:    ~72 s = ~2160 frames. Narrado: la voz es el reloj. Cada escena revela sus piezas cuando la voz las nombra.

LOOK (la app tal como se ve hoy, modo oscuro):
  suelo #1a1f1c (body), paneles #232a26 con borde 1px #3a4540, radio 10 px, sombra 0 8px 24px rgba(0,0,0,.35);
  tinta #e9ece6, secundaria #9aa69f; acento #f26a1b solo en: el logo, la palabra clave de cada escena, el payoff 84.8x;
  datos en cividis (#00204d -> #fde34a), nunca en naranja; MODIS #9aa69f (gris), VIIRS #67a9cf, armonizada #fde34a;
  títulos Source Serif 4 600, 84-120 px, tracking -1%; cuerpo Atkinson Hyperlegible Next 400/700, 30-40 px; cifras Atkinson Hyperlegible Mono;
  el mapa es Blue Marble de NASA GIBS (el fondo real de la app) con las flamas reales de la app (mismas rutas SVG y paletas por FRP);
  Gotitas: las ilustraciones reales (curiosa con lupa, bombera, científica), a 520-760 px de alto.

OBJECTS:
  mapa de Sierra de Arteaga con el rectángulo punteado naranja del área (como en la app) y 2,137 flamas reales de marzo 2021 por día;
  gráfica anual de México (datos reales de harmonization.json): MODIS crudo 2001-2011, VIIRS crudo 2012-2025, armonizada 2001-2025;
  un píxel MODIS de 1 km que se parte en una rejilla VIIRS de 375 m (2.67 por lado);
  el calendario de actividad (años x meses) de Sierra de Arteaga 2001-2026 con la escala cividis de la app;
  la tarjeta de la app "84.8x · Muy por encima de lo normal · 861 puntos; lo normal serían unos 10 · 1 vez cada 26 años";
  un teléfono con un chat de Telegram y el mensaje [EJERCICIO / PRUEBA] de Firely.

MOTION:
  llegada expo.out 0.6-0.9 s; cámara power2.inOut; salida power3.in 0.35 s; resortes de Gotita back.out(1.6) en posición y escala, nunca en opacidad;
  títulos: entrada por palabra con blur 6->0 px, 0.07 s entre palabras; quietos una vez que aterrizan;
  escalonados: celdas del calendario por año 0.05 s; flamas por día del mes (31 días en 4 s).

SHOTS:
  1 Mapa (0-9 s): Blue Marble a pantalla completa, empuje lento 1.0->1.12; flamas aparecen día por día; contador de días "1-31 mar 2021";
    título "¿Fue el peor fuego en 20 años?" -> pasa a gráfica: las flamas se encogen a un punto y viajan a la barra 2021 (cadena objeto a objeto).
  2 Salto falso (9-22 s): panel de gráfica; línea MODIS se dibuja 2001-2011, luego VIIRS salta en 2012; Gotita curiosa entra con su lupa sobre el salto; sello "salto falso".
  3 Armoniza (22-36 s): zoom a un píxel MODIS 1 km que se parte en la rejilla VIIRS 375 m; vuelta a la gráfica: la línea armonizada se dibuja y el salto desaparece; "el error baja ~30%".
  4 Calendario (36-50 s): la línea se dobla en filas (cada año una fila); el calendario se llena; marzo 2021 se enciende amarillo; aterriza la tarjeta 84.8x en naranja.
  5 Gotita (50-60 s): tres Gotitas, una por modo, cada una dice la misma cifra con su voz (texto corto en burbuja).
  6 Alerta (60-67 s): teléfono, llega el mensaje de Telegram de Gotita bombera.
  7 Cierre (67-72 s): logo de Firely trazado, "25 años de fuego en una sola serie", "Datos: NASA FIRMS".

BANNED: vacío negro con cosas flotando; brillos, partículas, neón; degradados morados; tres tarjetas en fila como diapositiva (las Gotitas actúan, no son tarjetas); todo entrando con fade + slide-up; títulos que siguen moviéndose; logo en una esquina; cifras que no salgan de los datos.
QA: 1.5 s (mapa con flamas), 12 s (salto visible), 18 s (Gotita + sello), 28 s (rejilla), 33 s (línea plana), 46 s (calendario + 84.8x), 55 s (Gotitas), 64 s (teléfono), 70 s (cierre).
