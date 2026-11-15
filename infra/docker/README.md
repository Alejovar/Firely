# Entorno Docker

El servicio `mobile` compila la app Glass React/Astryx de `apps/mobile/src/` y el cliente compartido de `packages/contracts/` con Node 24 y Vite, y sirve `dist/` con Nginx. `/api/` se reenvía al servicio `api`; si este no está disponible, la interfaz puede abrirse y muestra un error de conexión. Las dependencias se instalan dentro de la imagen. El SDK de Android y la compilación de Capacitor siguen en la computadora.

## Iniciar

Requiere Docker Engine activo y Docker Compose. Desde la raíz del repositorio:

```sh
docker compose up --build -d mobile
docker compose ps
```

Abre `http://localhost:5173`. Para comprobar el servicio: `curl http://localhost:5173/health` (debe responder `ok`).

Para incluir cambios en `apps/mobile/src/`, vuelve a ejecutar `docker compose up --build -d mobile`. El contenedor sirve una compilación estática; no monta los archivos de trabajo. Para desarrollo con recarga automática usa `npm run dev` desde `apps/mobile/`.

## Ver desde el celular

Conecta el celular y la computadora a la misma red Wi-Fi. Abre `http://IP_LOCAL_DE_LA_COMPUTADORA:5173` en el navegador del celular. Puedes consultar las direcciones con `hostname -I`; usa la de la interfaz Wi-Fi o Ethernet, no la de Docker.

El servicio publica el puerto 5173 en las interfaces de la computadora. La red debe permitir comunicación entre dispositivos y el firewall debe permitir ese puerto. No se modifica el firewall automáticamente. Esta vista en navegador no actualiza el APK de `mobile-smoke/`.

Para acceso solo desde la computadora:

```sh
FIRELY_BIND_ADDRESS=127.0.0.1 docker compose up -d mobile
```

Para cambiar el puerto:

```sh
FIRELY_MOBILE_PORT=5174 docker compose up -d mobile
```

## Revisar y detener

```sh
docker compose logs --tail=50 mobile
docker compose stop mobile
```

El contenedor usa un usuario sin privilegios, sistema de archivos de solo lectura y almacenamiento temporal en `/tmp`. El contexto de construcción excluye los documentos, credenciales, dependencias y proyectos Android.

La interfaz Glass consulta los datos de la API y distingue respuestas vacías, errores y datos simulados del servidor. La API necesita sus Parquet reales para mostrar la serie histórica. Para iniciar los servicios de datos usa `docker compose up -d --build api web`; para generar e instalar el APK conectado por USB ejecuta `npm run android:usb` desde `apps/mobile/`. `apps/mobile/www/` conserva el prototipo anterior como referencia.
