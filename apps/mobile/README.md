# Aplicación móvil de Firely

App React 19 con componentes Astryx y tema Neutral oscuro, compilada con Vite y empaquetada para Android con Capacitor 8. Su identificador es `org.firely.mobile`; no reemplaza la prueba `org.firely.smoketest`.

La carpeta ya tiene un proyecto npm con React 19, React DOM, Astryx Core, el tema Neutral y StyleX. El CLI de Astryx está instalado como dependencia de desarrollo. Para restaurar las dependencias, ejecuta `npm ci` desde esta carpeta.

## Desarrollo

Requiere Node.js 22.13 o posterior (se recomienda Node 24). Desde `apps/mobile/`:

```sh
npm ci
npm run dev
```

Abre `http://localhost:5173`. Vite actualiza la interfaz al editar `src/`. Desde el celular en la misma red puedes abrir `http://IP_DE_TU_COMPUTADORA:5173`.

```sh
npm run build    # genera dist/
npm run check    # valida Astryx y el build
npm run preview # sirve dist/ en el puerto 4173
```

## APK Android

Requiere Java 21 y el SDK de Android con la plataforma indicada en `android/variables.gradle`, además de las herramientas de compilación. La primera compilación necesita internet para descargar dependencias de Gradle.

```sh
npm run apk
```

Compila la interfaz, sincroniza `dist/` con Android y ejecuta `assembleDebug`. Busca el SDK en `ANDROID_HOME`, `ANDROID_SDK_ROOT` y las rutas convencionales de Android Studio; configura `ANDROID_HOME` si lo instalaste en otra ruta. Respeta `JAVA_HOME` para elegir Java.

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Es una compilación debug para pruebas; para publicar en Google Play se necesita configurar la firma de distribución. Copia el APK al teléfono para instalarlo. La interfaz va incluida y no requiere tener abierto el servidor de desarrollo.

```sh
npm run android:sync  # recompila y copia la interfaz a Android
npm run android:open  # abre Android Studio
```

El proyecto `android/` ya está creado. Usa `npm run android:add` únicamente si preparas una copia sin esa carpeta.

## Pruebas de interfaz

```sh
npx playwright install chromium
npm test
```

Para usar un navegador Chromium instalado: `FIRELY_BROWSER=/usr/bin/brave-browser npm test`.

Las pruebas recorren filtros, selección por teclado, fichas, capas, calendario, análisis y asistente; también verifican anchuras de 320, 390 y 1280. La prueba funcional bloquea peticiones externas. El tema Neutral incluye una fuente externa opcional; sin conexión se usa la fuente de respaldo.

## Alcance

La prueba de instalación anterior se conserva localmente en `../../mobile-smoke/`, excluida de Git. No es necesaria para compilar esta app y no se incluye al clonar el repositorio.

`www/` conserva el prototipo original HTML/CSS/JavaScript como referencia. La interfaz activa está en `src/`. Para servir el build con Docker desde la raíz, ejecuta `docker compose up --build -d` y abre `http://localhost:5173`.

Incluye:

- Mapa ilustrativo, puntos seleccionables y fichas de ejemplo.
- Filtros de 24/48 horas y control para mostrar el límite ilustrativo.
- Navegación entre Mapa, Calendario, Análisis y Asistente.
- Calendario de ejemplo con selección de mes; análisis y asistente como vistas previas.

Todos los datos son ficticios. El mapa no tiene precisión geográfica ni escala y no solicita geolocalización. No hay conexión a backend, NASA FIRMS ni IA. El calendario no filtra el mapa todavía. La navegación incluye soporte del botón Atrás de Android.

La configuración de Docker está en `../../infra/docker/README.md`.
