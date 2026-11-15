# Firely Main · Android

## Integración con main

La rama de prueba `integration/mobile-main` integra `main` en `87ec6d4` sobre
`feat/android-app-ec2`. Conserva Capacitor, la navegación inferior, el compositor
fijo del chat, las áreas guardadas, las exportaciones nativas y Campo sin ajustes
de servidor. Añade Gotita con los perfiles Curioso, Brigadista y Científico, la
consulta de meses futuros y el nuevo icono de Firely. Las rutas, alertas,
pronóstico y narración de main se incluyen en esta integración.

Los perfiles cambian el personaje y la explicación; las cifras siguen viniendo
de la API. Las respuestas futuras consultan `/forecast` y el histórico disponible,
sin presentar meses futuros como observados. Se mantiene la política offline:
los pronósticos y el asistente necesitan conexión.

Las ramas `main` y `feat/android-app-ec2` se conservan sin modificar.

Esta variante empaqueta el frontend de `main` con Capacitor 8. Conserva React,
Astryx, MapLibre, calendario, análisis, asistente y metodología. La interfaz se
ejecuta dentro de un WebView local con acceso a plugins Android; no es una
reescritura de pantallas en Kotlin.

El proyecto nativo está en `web/android/`. Su identificador es
`org.firely.mobile.main` y su nombre es **Firely Main**, para poder probarlo sin
reemplazar el prototipo anterior `org.firely.mobile`. `apps/mobile/` se conserva.

## Compilar

Requisitos: Node 22.13+, Java 21 y Android SDK 36. Se utiliza el SDK de
`ANDROID_HOME`, `ANDROID_SDK_ROOT` o `~/Android/Sdk`.

Desde `web/`:

```sh
npm ci
npm run apk
```

Resultado: `android/app/build/outputs/apk/debug/app-debug.apk`.
Es un APK debug de desarrollo; no es un AAB firmado para Play Store.

`npm run mobile:build` compila los recursos en `mobile-dist/` y
`npm run android:sync` además los copia al proyecto Android. La compilación web
normal sigue generando `dist/`. No se configura `server.url`: la interfaz queda
incluida en el APK y abre sin depender del servidor web de EC2.

## Servidor remoto de EC2

La dirección del backend se configura al compilar. Campo muestra las descargas
y las áreas guardadas; no expone la URL ni controles de configuración del servidor.

Con el nginx de este repositorio, la URL suele tener la forma
`https://TU_HOST/api`; confirmar el host y el prefijo reales. El móvil accede al
proxy público, que reenvía las solicitudes a `api:8000` dentro de Docker. El teléfono
no ejecuta Docker ni accede a las credenciales AWS o a los Parquet del servidor.

Configura la URL al compilar:

```sh
env VITE_API_URL=https://TU_HOST/api npm run apk
```

La configuración comprobada en el teléfono tiene prioridad sobre la del build.
El APK remoto admite HTTPS; HTTP local se reserva para la variante USB. El CORS
de la API y del proxy público debe permitir el origen local del WebView. No hace
falta publicar el puerto interno 8000 de la API.

## Prueba local por USB

El `main` limpio de esta sesión corre en `http://localhost:8081`. Para instalar
una variante que consulte ese servidor:

```sh
npm run android:usb
```

El script compila, sincroniza Android, crea `adb reverse tcp:8081 tcp:8081`,
instala el APK y abre Firely Main. El teléfono debe estar desbloqueado y
autorizar la depuración USB. Si hay varios dispositivos, establece
`ANDROID_SERIAL`. Para otro puerto:

```sh
env FIRELY_USB_API_URL=http://localhost:8080/api npm run android:usb
```

Las instalaciones anteriores pueden conservar una dirección guardada, que tiene
prioridad sobre la del build. Para volver a la variante remota, ejecutar `npm run apk`.

## EC2 por SSH durante el desarrollo

Si el servidor todavía no ofrece HTTPS, se puede probar a través de SSH y USB
sin cambiar su despliegue. Abre el túnel en una terminal y déjalo activo:

```sh
ssh -i /ruta/firely.pem -N -L 127.0.0.1:18080:127.0.0.1:80 ubuntu@IP_PUBLICA
```

En otra terminal, desde `web/`, compila e instala contra ese túnel:

```sh
env FIRELY_USB_API_URL=http://localhost:18080/api npm run android:usb
```

El teléfono consulta EC2 a través de la computadora. El cable y SSH deben
permanecer activos. El acceso independiente del teléfono sigue requiriendo una
URL pública HTTPS. Nunca se incluye el `.pem` en el APK ni en el repositorio.

## Asistente móvil

El chat tiene una columna en móvil, entrada fija dentro de la pantalla,
preguntas de ejemplo y estado de conexión comprobado contra la API. Presenta
primero el resumen y permite desplegar la evolución mensual. Se pueden elegir
lugares ambiguos, detener una consulta, reintentar errores y empezar una
conversación nueva. La interpretación por reglas se identifica en los detalles;
las cifras continúan saliendo de la API.

## Áreas de campo: uso

1. Selecciona área, fechas, métrica, referencia y tipo en Explorar. Si quieres
   detalle diario, selecciona también el mes antes de descargar.
2. En Campo, pulsa **Guardar área para campo** y espera la confirmación.
3. Se guardan el calendario y los análisis disponibles. La lista muestra
   las consultas no incluidas, fecha de descarga, corte, versión y atribución.
4. **Abrir área** restaura la selección. Si la consulta de red falla, el cliente
   busca exactamente esa consulta guardada y avisa que son datos descargados.
5. Para actualizar, descarga de nuevo; cada descarga genera un archivo nuevo.
   Una descarga interrumpida no sobrescribe la anterior. Borra las versiones que
   ya no necesites con la confirmación de **Borrar descarga**.

En Android los paquetes se almacenan mediante Filesystem en `Directory.Data`.
La versión de navegador usa la implementación web del plugin, con IndexedDB;
esto no convierte al sitio en PWA ni permite abrir el sitio sin un servidor local.
No se implementan manifest ni service worker.

La clave de cada consulta conserva el backend y todos los filtros. Cambiar el
área, fechas, métrica o referencia puede requerir otra descarga. Los errores HTTP
no se ocultan con respuestas antiguas y las consultas canceladas no recuperan
datos guardados. Cada paquete admite hasta 20 MB; las consultas opcionales se
ejecutan secuencialmente y se identifican cuando faltan o tienen otra procedencia.

El mapa base, sus teselas y los puntos del mapa no se descargan en esta entrega.
Tampoco se guardan recientes, viento, propagación, prioridad ni pronósticos. El
asistente requiere red. El contexto solo se intenta guardar para periodos de hasta
cinco años. Las consultas diarias y de retorno se guardan para el mes elegido.
No se ejecutan DuckDB-WASM ni armonización dentro del teléfono.

Los CSV e imágenes del panel de descargas se comparten mediante el selector
nativo de Android; en navegador se mantiene la descarga habitual. La ficha PDF
conserva el flujo web de impresión y todavía requiere adaptación y validación
específicas en Android.

## Validación

```sh
npm test
npm run mobile:build
npm run test:mobile
npx astryx doctor --built mobile-dist
```

Las pruebas visuales requieren un navegador Chromium. Por defecto usan
`/usr/bin/brave-browser`; configura `FIRELY_BROWSER` para otro ejecutable. Usan
respuestas controladas, marcadas como fixtures únicamente en las pruebas.

La comprobación con EC2 real necesita su URL pública. La aceptación en campo
requiere instalar el APK en un Android autorizado y probar cierre/reapertura en
modo avión y consultas por datos móviles sin USB ni servidor local.
