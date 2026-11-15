# Firely móvil: main, trabajo de campo y backend EC2

Revisión: 15 de noviembre de 2026. Base revisada: `main` / `origin/main`
en `e8b5cb4`; referencia móvil: `test` en `7c0b203` y
`feat/mobile-ui` en `b2bbaeb`.

La implementación en `feat/mobile-main-ec2` empaqueta `web/` con Capacitor y añade
navegación móvil, configuración del backend, áreas guardadas y exportación nativa
de CSV e imágenes. Instrucciones: [web/ANDROID.md](../web/ANDROID.md).
La URL pública de EC2 y la prueba en teléfono autorizado siguen pendientes.

## Evidencia del repositorio

- `docs/firely-descripcion.md`, §7, §12.5 y §14: calendario armonizado,
  selección de área, trabajo sin señal, procedencia e incertidumbre visibles.
- `docs/firely-plan.md`, §2: primero el núcleo de consulta; una función cuenta
  como terminada cuando funciona en el despliegue.
- No existe una PWA, confirmado por el usuario. Las afirmaciones previas de
  implementación en descripción §12.5 y plan §17 se corrigieron. El offline
  móvil de esta rama está en validación. En el `main` revisado no existen
  `web/public/manifest.webmanifest` ni `web/public/sw.js`, y
  `web/src/main.tsx` no registra un service worker.
- `web/` contiene el frontend actual: React, Astryx, MapLibre, calendario,
  análisis, asistente, metodología, historia y plataforma. Su diseño y sus
  respuestas de API son la referencia funcional y visual para la adaptación.
- La rama `test` contiene Firely Glass en `apps/mobile/`, Capacitor, manejo del
  botón Atrás y scripts de instalación por USB. Empaqueta la interfaz en el APK;
  no configura `server.url`. Usa un cliente en `packages/contracts/` que debe
  contrastarse con el cliente más reciente de `main`, `web/src/api/client.ts`.
- No se identificó una capa de persistencia offline en el código móvil anterior.
  Tener Capacitor o consumir la API no equivale a tener consultas sin conexión.
- Las ramas móviles y `main` no comparten base según `git diff main...feat/mobile-ui`.
  No corresponde incorporar todo el historial móvil mediante un merge sin revisión.
- `apps/`, `mobile-smoke/` y `data/schemas/tables.json` tienen trabajo local que
  debe conservarse al integrar.

## Implementación elegida: Capacitor

Se continúa con Capacitor, como en la rama móvil anterior, reutilizando el frontend
de main. La diferencia respecto a reconstruir pantallas nativas es:

| Opción | Reutilización | Alcance |
| --- | --- | --- |
| Capacitor, como la rama móvil | React/Astryx, lógica de vistas y componentes web adaptados | APK con interfaz web local y acceso a funciones Android mediante plugins |
| Interfaz nativa Android | Diseño, contratos HTTP y reglas de producto | Reconstrucción de pantallas y mapa con componentes nativos; Astryx no se reutiliza directamente |

En ambas opciones el backend científico continúa en EC2. El frontend actual
sirve de referencia; la implementación no debe introducir cifras de demostración
como reemplazo de respuestas reales.

## Conexión con EC2 y Docker

```text
Android: interfaz instalada + datos guardados
                  |
          HTTPS /api/<endpoint>
                  |
      entrada pública TLS de EC2
                  |
          nginx del servicio web
                  |
       API FastAPI en red Docker
                  |
       Parquet montados en servidor
```

El compose actual publica nginx en el puerto 8080 por defecto; la API expone
8000 únicamente dentro de Docker. `infra/nginx.conf` reenvía `/api/` a
`http://api:8000/`, quitando el prefijo. La terminación TLS depende del despliegue
real: hay que comprobarla, no asumir que ya existe.

- Configurar el cliente con la URL pública real y su prefijo, por ejemplo
  `https://HOST_PUBLICO/api`; ese ejemplo no es una dirección desplegada.
- No usar el DNS de Docker `api`, la IP privada de EC2 ni el localhost del
  teléfono como endpoint de producción.
- En Capacitor, `VITE_API_URL` queda incorporada al compilar. Cambiar una
  variable del contenedor de EC2 no modifica un APK ya instalado.
- Mantener el frontend empaquetado en el APK en la opción Capacitor. La
  conexión con EC2 se utiliza para los datos.
- Mantener claves de FIRMS, IA, AWS y Telegram en el servidor. La URL pública
  de la API es configuración, no una credencial AWS.
- La API actual permite CORS con `*`. Verificar los encabezados en el proxy
  público y el origen del WebView si se elige Capacitor. Los orígenes permitidos
  de MCP son una configuración diferente.
- Conservar modo USB separado del modo remoto. El túnel de desarrollo debe
  apuntar al puerto del servicio realmente elegido; la copia limpia de main
  se levantó localmente en 8081 durante esta sesión.
- La app Android se distribuye como APK/AAB; Docker sigue ejecutando los
  servicios del backend. No se ejecutan contenedores en el teléfono.

## Adaptación del frontend actual

| Pantalla móvil | Fuente funcional | Comportamiento requerido |
| --- | --- | --- |
| Inicio / calendario | Explorador y calendario de main | Área, fechas, conteo/FRP, anomalía, estimación, nubes, detalle diario y procedencia |
| Mapa | MapLibre y capas de main | Selección táctil, radio/polígono, detecciones y separación de histórico frente a 24/48 h |
| Análisis | Paneles actuales | Temporada, análogos, patrones y contexto sobre la misma selección |
| Asistente | Búsqueda y asistente actuales | Candidatos de lugar, aplicación de filtros, respuestas con trazabilidad |
| Áreas guardadas | §12.5 y diseño móvil | Descargar, listar, actualizar y borrar paquetes; mostrar fecha, tamaño y disponibilidad |
| Método / información | Página de método | NASA FIRMS, versión, corte, incertidumbre y limitaciones |

Reutilizar la identidad, tipografía, tema, paletas de datos y contenido del
frontend actual. Adaptar navegación, paneles y controles a uso táctil, teclado,
lector de pantalla, botón Atrás y áreas seguras del teléfono. Mantener la misma
selección de área y fechas al cambiar de pantalla. El diseño Glass de las ramas
anteriores aporta patrones móviles, pero no sustituye la referencia de main sin
confirmación del usuario.

## Offline para campo

Primera entrega: paquetes de respuestas de la API por área y filtros. Parquet y
DuckDB-WASM quedan para una fase posterior; no son requisito para consultar
respuestas previamente descargadas.

Cada paquete necesita identificador, área/geometría, fechas, métrica, referencia,
filtros, fecha de descarga, corte de datos, versión metodológica, atribución,
versión de formato y estado de cada recurso. Si se utiliza un backend distinto,
los paquetes deben quedar separados por origen para no mezclar ambientes.

Guardar calendario, detalle diario solicitado y los análisis compatibles con el
área. Descargar con concurrencia limitada: nginx limita la API a 10 solicitudes/s
por IP. Validar las respuestas antes de marcar un paquete completo; una actualización
fallida conserva la última descarga completa. Recursos opcionales fallidos deben
quedar identificados y no presentarse como descargados.

En Android usar persistencia de la app elegida según la implementación. Para la
opción Capacitor, evaluar Filesystem para paquetes JSON y metadatos pequeños
separados. Las teselas necesitan política de proveedor, límites y almacenamiento
propios; guardar JSON no garantiza un mapa base offline. Hasta disponer de ello,
explicar que el calendario guardado funciona sin señal y el mapa base puede faltar.

La UI distingue: datos en línea, datos guardados con fecha y consulta no descargada.
No reemplazar una consulta por otra área o filtros. No presentar recientes,
pronósticos, semáforos o viento guardados como condiciones actuales. No ejecutar
el asistente remoto ni publicar alertas sin conexión.

## Orden de implementación y aceptación

1. Capacitor elegido como continuidad de la rama anterior; confirmar URL pública real de EC2.
2. Crear una rama de integración desde main y trasladar solo el código móvil
   elegido, conservando el trabajo local existente.
3. Verificar `/api/openapi.json` y una consulta de calendario en EC2. Comparar
   parámetros, respuestas, procedencia y modo real con el cliente de main.
4. Llevar calendario, área, fechas y mapa al teléfono, siguiendo el frontend
   actual. Comparar valores web/móvil para exactamente la misma consulta.
5. Añadir descarga de áreas y persistencia; probar cierre y reapertura en modo
   avión, consulta no guardada, descarga parcial, actualización fallida y borrado.
6. Integrar análisis y asistente; revisar cancelación de consultas y estados de
   carga, error, vacío y datos antiguos.
7. Compilar e instalar en Android físico. Probar acceso por datos móviles sin
   USB ni equipo local, navegación Atrás, teclado, rotación y permisos requeridos.

La entrega remota no se considera validada hasta que el teléfono consulta EC2
por su cuenta. La entrega offline no se considera validada hasta que los datos
guardados sobreviven al cierre y reapertura sin señal.

## Referencias técnicas

- https://capacitorjs.com/docs — alcance del runtime nativo para aplicaciones web.
- https://capacitorjs.com/docs/config — configuración y recursos empaquetados.
- https://capacitorjs.com/docs/apis/filesystem — persistencia de archivos.
- https://capacitorjs.com/docs/apis/network — cambios de conectividad; tener red
  no demuestra por sí solo que el backend responda.

No hay herramientas de DevRelay disponibles en esta sesión para contrastar
experiencias de comunidad; esta revisión se apoya en el repositorio y las
referencias oficiales, sin atribuir opiniones a publicaciones no consultadas.
