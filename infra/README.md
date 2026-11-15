# Despliegue con Docker

Dos imágenes y un `docker-compose.yml` en la raíz:

| Servicio | Imagen | Qué hace |
|---|---|---|
| `api` | `infra/Dockerfile.api` (~480 MB) | FastAPI + DuckDB sobre los Parquet. Usuario sin privilegios, sistema de archivos de solo lectura, datos montados `:ro`, 2 workers, límite de 3 GB. |
| `web` | `infra/Dockerfile.web` (~80 MB) | Compila Vite y sirve los estáticos con nginx; `/api/` se reenvía a la API (mismo origen, sin CORS) con **límite de 10 solicitudes/s por IP** (429 al exceder). |

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
   docker compose up -d --build
   ```
3. Abre el puerto 80/443 en el grupo de seguridad y pon HTTPS delante (CloudFront, un ALB, o Caddy con tu dominio). El contenedor `web` escucha en `FIRELY_PORT` (8080 por defecto).

El pipeline de datos (ingesta, H3, armonización) **no** va en estas imágenes: necesita más de 5 GB de RAM y ~1 h; se corre aparte y solo se sube `data/processed`.

## Comprobaciones

```bash
docker compose ps                                  # api y web "healthy"
curl "localhost:8080/api/calendar?bbox=-100.9,25.2,-100.2,25.7&from=2021-03-01&to=2021-03-31"
```

## Jobs diarios (cron en el servidor)

Los dos jobs corren **dentro del contenedor `api`** (ya trae el código y escribe solo en el volumen `/state`). Son idempotentes: correrlos dos veces no duplica envíos ni filas.

| Job | Qué hace | Requiere |
|---|---|---|
| `pipeline.alerts_job` | Evalúa cada suscripción (`POST /subscriptions`) con el índice de prioridad real (`/risk`) y la anomalía del último mes; si supera su umbral envía por Telegram un mensaje marcado **EJERCICIO / PRUEBA**. Cada (suscripción, mes de datos) se envía una sola vez. | `TELEGRAM_BOT_TOKEN` en `.env` (sin él: dry-run, solo registra en `/state/alerts_log.jsonl`) |
| `pipeline.nrt` | Guarda las detecciones FIRMS NRT de las últimas 48 h de México y Argentina en Parquet, deduplicadas, en `/state/nrt/<País>/date=AAAA-MM-DD/`. | `FIRMS_MAP_KEY` (sin ella sale con código 2 y un mensaje claro) |

**Aprobación humana.** Una suscripción nueva queda `approved=false` y no recibe nada hasta que el operador la aprueba en el servidor:

```bash
docker compose exec -T api python -m pipeline.alerts_job --list          # chat_id enmascarado
docker compose exec -T api python -m pipeline.alerts_job --approve <id>
docker compose exec -T api python -m pipeline.alerts_job --dry-run       # ver qué se enviaría
```

**Cron** (`crontab -e` del usuario que corre Docker, en la carpeta del repo; horas en UTC del servidor):

```cron
# NRT a Parquet a las 06:10 y alertas a las 06:30, todos los días
10 6 * * * cd /home/ubuntu/Firely && docker compose exec -T api python -m pipeline.nrt --out /state/nrt >> /var/log/firely-nrt.log 2>&1
30 6 * * * cd /home/ubuntu/Firely && docker compose exec -T api python -m pipeline.alerts_job >> /var/log/firely-alerts.log 2>&1
```

`-T` evita pedir una TTY desde cron. Los logs no contienen la llave de FIRMS, el token de Telegram ni el `chat_id`.

## Riesgo próximo (GFWED)

`GET /risk/forecast` baja en vivo solo los renglones del pronóstico GEOS-5 de 8 días que cruzan el área (peticiones HTTP Range, IPv4) y guarda el resultado en `/state/cache/gfwed_forecast`. La climatología 1981–2010 sale de `context/fwi_longterm_month.parquet`, que se genera en local con `python -m pipeline.fwi_climatology` antes de `export-runtime-data.sh` (solo cubre Coahuila; fuera de ahí se usa la clase EFFIS absoluta).
