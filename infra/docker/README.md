# Entorno Docker

El servicio `mobile` compila la app React/Astryx de `apps/mobile/src/` con Node 24 y Vite en una primera etapa, y sirve `dist/` con Nginx. Las dependencias se instalan dentro de la imagen. El SDK de Android y la compilación de Capacitor siguen en la computadora.

## Iniciar

Requiere Docker Engine activo y Docker Compose. Desde la raíz del repositorio:

```sh
docker compose up --build -d
docker compose ps
```

Abre `http://localhost:5173`. Para comprobar el servicio: `curl http://localhost:5173/health` (debe responder `ok`).

Para incluir cambios en `apps/mobile/src/`, vuelve a ejecutar `docker compose up --build -d`. El contenedor sirve una compilación estática; no monta los archivos de trabajo. Para desarrollo con recarga automática usa `npm run dev` desde `apps/mobile/`.

## Ver desde el celular

Conecta el celular y la computadora a la misma red Wi-Fi. Abre `http://IP_LOCAL_DE_LA_COMPUTADORA:5173` en el navegador del celular. Puedes consultar las direcciones con `hostname -I`; usa la de la interfaz Wi-Fi o Ethernet, no la de Docker.

El servicio publica el puerto 5173 en las interfaces de la computadora. La red debe permitir comunicación entre dispositivos y el firewall debe permitir ese puerto. No se modifica el firewall automáticamente. Esta vista en navegador no actualiza el APK de `mobile-smoke/`.

Para acceso solo desde la computadora:

```sh
FIRELY_BIND_ADDRESS=127.0.0.1 docker compose up -d
```

Para cambiar el puerto:

```sh
FIRELY_MOBILE_PORT=5174 docker compose up -d
```

## Revisar y detener

```sh
docker compose logs --tail=50 mobile
docker compose down
```

El contenedor usa un usuario sin privilegios, sistema de archivos de solo lectura y almacenamiento temporal en `/tmp`. El contexto de construcción excluye los documentos, credenciales, dependencias y proyectos Android.

La interfaz actual es un prototipo visual con datos simulados. React, Astryx y Capacitor ya están integrados; el backend sigue pendiente. `apps/mobile/www/` conserva el prototipo anterior como referencia. Para generar el APK actual ejecuta `npm run apk` desde `apps/mobile/`.
