# Firely Glass · Android

Interfaz móvil React/Astryx con el diseño Glass de `docs/2026-11-14_17-24-33.png`. Conserva sus cuatro pestañas y consulta la API del equipo: ya no carga la web de escritorio dentro de la app ni usa cifras de ejemplo como sustituto de los datos.

El identificador Android es `org.firely.mobile`. La prueba anterior `mobile-smoke/` se conserva localmente, está ignorada por Git y no se necesita para compilar.

## Ejecutar en el teléfono por USB

Requiere Node 24 (mínimo 22.13), Java 21, SDK de Android y depuración USB autorizada. Desde la raíz:

```sh
docker compose up -d --build --wait api web
cd apps/mobile
npm ci
npm run android:usb
```

El comando comprueba el servidor, activa `adb reverse tcp:8080 tcp:8080`, compila Glass dentro del APK, lo instala y abre Firely. Solo la API se consulta a través de `http://localhost:8080/api`; Capacitor no configura `server.url` ni reemplaza la interfaz móvil por una página remota.

Mantén el USB y Docker activos. Al reconectar el teléfono puedes restaurar el túnel con `adb reverse tcp:8080 tcp:8080`. Si hay varios dispositivos: `ANDROID_SERIAL=<serial> npm run android:usb`.

Usa `ANDROID_HOME` o `ANDROID_SDK_ROOT` para un SDK fuera de `~/Android/Sdk`; el script de instalación también acepta `adb` en PATH. El permiso HTTP está en el manifiesto Android de debug; `FIRELY_USB_DEV=1` selecciona el esquema HTTP local únicamente para esta variante.

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Es una compilación para pruebas. `npm run apk` sin el modo USB también empaqueta Glass; para conectarlo a un servidor HTTPS configura la URL al compilar:

```sh
VITE_API_URL=https://TU_SERVIDOR/api npm run apk
```

## Desarrollo y vista local

Con API/web activos en 8080:

```sh
cd apps/mobile
npm ci
npm run dev
```

Vite sirve `http://localhost:5173` y reenvía `/api` al servidor del puerto 8080. Para el build estático, Docker incluye el mismo proxy:

```sh
docker compose up -d --build mobile
```

Este último comando se ejecuta desde la raíz. Consulta `infra/docker/README.md` para acceder desde otro dispositivo por Wi-Fi. Las teselas del mapa requieren internet; no son imágenes de incendios actuales.

```sh
npm run build          # interfaz de producción en dist/
npm run check          # comprobación de Astryx sobre dist/
npm run android:sync   # recompila y sincroniza Android
npm run android:open   # abre Android Studio
```

## Funciones conectadas

- **Mapa:** fondo histórico NASA GIBS, desplazamiento/zoom, selección de un radio al tocar el mapa, dibujo de polígonos y límites del área. Filtros por fechas, conteo/FRP y mediana/promedio; coordenadas manuales como alternativa al mapa.
- **Recientes:** consultas FIRMS de 24/48 horas y ficha de adquisición, plataforma, coordenadas, FRP y confianza. La capa es independiente de las fechas del calendario.
- **Calendario:** meses devueltos por la API, actividad/anomalía, estimados señalados, bandas de incertidumbre, detalle diario observado, periodo de retorno descriptivo y enlace CSV.
- **Análisis:** temporadas, años análogos, contexto climático, eventos agrupados, reportes CONAFOR por unidad mexicana y patrones semanales/nocturnos. Las temporadas y el patrón semanal usan todo el historial del área; el contexto limita cada consulta a cinco años.
- **Asistente/búsqueda:** resolución de lugares y fechas, elección entre candidatos, aplicación de esos filtros al resto de las vistas y explicación del calendario consultado. Idioma de respuesta ES/EN/PT y perfil brigadista/científico. Sin llave de IA, el servidor utiliza reglas y redacción local.

El cliente y los tipos de respuesta están en `packages/contracts/api-client.ts`, compartidos con `web/`. Las consultas cambian con el área/periodo y se cancelan al cambiar de selección. No se duplica la armonización en el teléfono.

## Datos, cobertura y fuentes

Los Parquet reales deben estar disponibles para la API, según `infra/README.md`. No se incluyen en Git ni dentro del APK. Sin ellos se muestra «Sin datos»; un error de red se distingue de una respuesta vacía. La capa reciente necesita `FIRMS_MAP_KEY` en el servidor. Las respuestas simuladas de una API en modo mock se marcan en pantalla.

El calendario es mensual y armonizado. El detalle diario es observado y crudo; los días sin registro no se rellenan con ceros. El conteo de eventos agrupados todavía es crudo y su extensión no es superficie quemada. Un punto de calor no confirma un incendio. No se presenta el endpoint mock de riesgo como una predicción real.

El mapa navegable usa Blue Marble histórico a través de NASA GIBS; el fondo local de reserva se acredita en `public/maps/README.md`. Los valores, fuente, versión del método y corte de datos vienen de las respuestas de la API.

## Pruebas

```sh
npx playwright install chromium
npm run build
npm test
```

Para usar Brave instalado: `FIRELY_BROWSER=/usr/bin/brave-browser npm test`. Las pruebas de Glass usan respuestas controladas en `tests/`, marcadas como fixtures; nunca se importan en la app. Comprueban cifras, filtros, detalle diario, búsqueda/fechas, análisis, fallos FIRMS y adaptación de anchura.

`FIRELY_BROWSER=/usr/bin/brave-browser npm run test:usb` ejecuta las comprobaciones adicionales de la web/API del equipo en el puerto 8080, incluyendo el historial corregido en `test`.

## Tema y referencia anterior

El tema editable está en `themes/firely-glass/`; su copia de la app en `src/themes/firely-glass/` es generada por Astryx:

```sh
npx astryx experimental theme compile themes/firely-glass/firely-glass.theme.ts
```

Las previsualizaciones quedan fuera de Git. `www/` conserva el primer prototipo HTML/CSS/JS como referencia histórica; el código activo está en `src/`.
