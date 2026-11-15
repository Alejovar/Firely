# Despliegue con Docker

Cinco servicios en `docker-compose.yml`:

| Servicio | Imagen | Qué hace |
|---|---|---|
| `api` | `infra/Dockerfile.api` (~480 MB) | FastAPI + DuckDB sobre los Parquet. Usuario sin privilegios, sistema de archivos de solo lectura, datos montados `:ro`, 2 workers, límite de 3 GB. |
| `web` | `infra/Dockerfile.web` (~80 MB) | Compila Vite y sirve los estáticos con nginx; `/api/` se reenvía a la API (mismo origen, sin CORS) con **límite de 10 solicitudes/s por IP** (429 al exceder). |
| `mcp` | `infra/Dockerfile.services` | Herramientas públicas MCP en `/mcp` (HTTP streamable). Solo consulta la API interna. El host público debe figurar en `FIRELY_MCP_ALLOWED_HOSTS`. |
| `bot` | `infra/Dockerfile.services` | Bot de Telegram por long polling. Si falta `TELEGRAM_BOT_TOKEN`, sale limpiamente y permanece apagado. |
| `scheduler` | `infra/Dockerfile.api` | Corre ingesta NRT, alertas diarias y boletín semanal según UTC. Solo este servicio monta los Parquet procesados con escritura. |

## Local

```bash
docker compose up --build          # http://localhost:8080
```

La API lee `./data/processed` (cámbialo con `FIRELY_DATA_PROCESSED=/ruta`). Las llaves son opcionales; sin ellas todo funciona salvo la capa en vivo (`/recent` responde 503 con un mensaje claro) y el LLM (la búsqueda usa reglas locales). Pon `FIRMS_MAP_KEY`, `ANTHROPIC_API_KEY` en un `.env` junto al compose. Los datos se montan en solo lectura; el estado que la API sí escribe (borradores CAP aprobados para ejercicio y la caché de NASA POWER) vive en el volumen `firely-state`, montado en `/state` (`FIRELY_STATE_DIR`).

## En una EC2 (recomendado: `t3.medium`, 4 GB, 20 GB gp3)

1. En tu máquina: `infra/export-runtime-data.sh` genera `firely-data.tar.gz` (solo las tablas que usa la API).
2. En la instancia (Ubuntu): instala Docker y Compose, clona el repo, y
   ```bash
   mkdir -p data/processed && tar -xzf firely-data.tar.gz -C data/processed
   cp .env.example .env   # y llena las llaves que quieras
   id -g ubuntu            # usa este número en FIRELY_DATA_GID de .env
   sudo chgrp -R "$(id -g ubuntu)" data/processed
   sudo chmod -R g+rwX data/processed
   sudo find data/processed -type d -exec chmod g+s {} +
   docker compose up -d --build
   ```
3. Abre el puerto 80/443 en el grupo de seguridad. El contenedor `web` escucha en `FIRELY_PORT` (8080 por defecto) y, con HTTPS, en `FIRELY_HTTPS_PORT` (8443 por defecto). Para el dominio, ver "Dominio y HTTPS".

El procesamiento histórico completo (ingesta, H3, armonización) necesita más memoria y se corre aparte. Antes de exportar datos para despliegue, materializa los derivados:

```bash
python -m pipeline.derived_tables
python -m pipeline.animation_frames
infra/export-runtime-data.sh
```

El programador diario escribe `nrt/`, `cell_day_nrt/`, `cell_month_nrt/` y `events_nrt/` en el mismo directorio montado en la API como solo lectura. Los datos científicos estándar (SP) se incorporan después con una corrida histórica revisada; NRT no los sobrescribe.

El contenedor `scheduler` usa UID 10001 y se añade únicamente al grupo numérico `FIRELY_DATA_GID`; la API conserva el montaje de datos de solo lectura y no recibe ese grupo. Los comandos anteriores conceden escritura al grupo del directorio procesado y hacen que las carpetas nuevas hereden el grupo. El programador usa `umask 0002` para que sus archivos nuevos puedan actualizarse por ese grupo. **Repite `chgrp`, `chmod` y `find` tras extraer cada archivo nuevo de datos científicos SP**; `tar` puede restaurar permisos sin escritura de grupo. Si el despliegue usa otra cuenta que no sea `ubuntu`, usa su GID real.

## Comprobaciones

```bash
docker compose ps                                  # api, web, mcp y scheduler; bot si hay token
curl "localhost:8080/api/calendar?bbox=-100.9,25.2,-100.2,25.7&from=2021-03-01&to=2021-03-31"
curl "localhost:8080/mcp"                        # 405/406 sin petición MCP; comprueba que el proxy llega
```

## Jobs automáticos en Docker

`scheduler` ejecuta los jobs en UTC y guarda en `/state/scheduler.json` el último día completado. Los intentos fallidos se reintentan una hora después. No requiere configurar `crontab` del host.

| Job | Qué hace | Requiere |
|---|---|---|
| `pipeline.daily_update` | A las 06:10 UTC, guarda detecciones FIRMS NRT y actualiza tablas NRT diarias, mensuales y de eventos. | `FIRMS_MAP_KEY` (sin ella falla y reintenta después) |
| `pipeline.alerts_job` | A las 06:30 UTC, evalúa las suscripciones aprobadas. | `TELEGRAM_BOT_TOKEN` (sin él: dry-run) |
| `pipeline.bulletin_job` | Los lunes a las 07:00 UTC, genera y envía el boletín semanal a suscripciones aprobadas. | `TELEGRAM_BOT_TOKEN` (sin él: dry-run) |

**Aprobación humana.** Una suscripción nueva queda `approved=false` y no recibe nada hasta que el operador la aprueba en el servidor:

```bash
docker compose exec -T api python -m pipeline.alerts_job --list          # chat_id enmascarado
docker compose exec -T api python -m pipeline.alerts_job --approve <id>
docker compose exec -T api python -m pipeline.alerts_job --dry-run       # ver qué se enviaría
```

**Ejecución manual**, útil antes de activar el programador:

```bash
docker compose run --rm scheduler python -m pipeline.daily_update
docker compose exec -T api python -m pipeline.alerts_job --dry-run
docker compose exec -T api python -m pipeline.bulletin_job --dry-run
```

Los logs no deben contener la llave de FIRMS, el token de Telegram ni el `chat_id`.

## Activar Telegram y MCP público

1. En Telegram abre **@BotFather**, manda `/newbot`, elige nombre y un usuario terminado en `bot`. Guarda el token que devuelve como contraseña; agrégalo solo a `.env` del servidor como `TELEGRAM_BOT_TOKEN=...`.
2. Configura `FIRELY_PUBLIC_API_URL=https://tu-dominio/api` para que los enlaces del bot sean públicos. Configura `FIRELY_MCP_ALLOWED_HOSTS=tu-dominio,localhost,localhost:*,127.0.0.1,127.0.0.1:*` (o la IP pública). Si usas otro origen para el cliente MCP, añade `FIRELY_MCP_ALLOWED_ORIGINS`.
3. Ejecuta `docker compose up -d --build bot mcp scheduler web`. Escribe `/start` al bot para recibir tu `chat_id`. Las alertas solo salen para suscripciones aprobadas por el operador y llevan la marca **EJERCICIO / PRUEBA**.

`/mcp` queda accesible mediante el mismo nginx. Para uso en internet se recomienda HTTPS en el proxy externo; las herramientas son de lectura y nginx limita solicitudes por IP.

## Riesgo próximo (GFWED)

`GET /risk/forecast` baja en vivo solo los renglones del pronóstico GEOS-5 de 8 días que cruzan el área (peticiones HTTP Range, IPv4) y guarda el resultado en `/state/cache/gfwed_forecast`. La climatología 1981–2010 sale de `context/fwi_longterm_month.parquet`, que se genera en local con `python -m pipeline.fwi_climatology` antes de `export-runtime-data.sh` (solo cubre Coahuila; fuera de ahí se usa la clase EFFIS absoluta).

## Dominio y HTTPS (firely.lat, Cloudflare + Let's Encrypt)

Cloudflare atiende el dominio (proxy, nube naranja) y se conecta al EC2 por HTTPS con un certificado de Let's Encrypt
(modo SSL/TLS **Full (strict)**). nginx toma la IP real del visitante de `CF-Connecting-IP` solo cuando la petición
viene de un rango de Cloudflare (`infra/nginx/cloudflare-realip.conf`), así el límite por IP cuenta visitantes.

1. Cloudflare › DNS: registros `A` `firely.lat` y `www` → IP del EC2, con proxy. Borra los registros del
   estacionamiento del registrador. Deja *Always Use HTTPS* apagado hasta tener el certificado (paso 3): si no, el
   reto de Let's Encrypt se redirige a un HTTPS que aún no existe.
2. En el EC2, `.env`:
   ```
   FIRELY_PORT=80
   FIRELY_HTTPS_PORT=443
   FIRELY_LETSENCRYPT_DIR=/etc/letsencrypt
   FIRELY_PUBLIC_URL=https://firely.lat
   FIRELY_PUBLIC_API_URL=https://firely.lat/api
   ```
3. Certificado (el reto HTTP-01 pasa por el puerto 80, también a través del proxy de Cloudflare):
   ```bash
   sudo apt-get install -y certbot
   mkdir -p infra/certbot-webroot infra/tls-enabled && docker compose up -d --build web
   sudo certbot certonly --webroot -w /opt/firely/infra/certbot-webroot -d firely.lat -d www.firely.lat \
        --agree-tos --register-unsafely-without-email -n
   cp infra/nginx/tls.conf.example infra/tls-enabled/firely.conf
   docker compose up -d web && docker compose exec web nginx -s reload
   ```
4. Renovación: el paquete `certbot` instala un temporizador de systemd. Para que nginx cargue el certificado nuevo:
   ```bash
   printf '#!/bin/sh\ndocker compose -f /opt/firely/docker-compose.yml exec -T web nginx -s reload\n' | \
     sudo tee /etc/letsencrypt/renewal-hooks/deploy/firely-nginx.sh && sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/firely-nginx.sh
   sudo certbot renew --dry-run
   ```
5. Ya con HTTPS en el EC2: Cloudflare › SSL/TLS **Full (strict)** y Edge Certificates › *Always Use HTTPS*.
