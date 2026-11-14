# Despliegue con Docker

El archivo `compose.yaml` de la raíz reúne la API, la web y la app móvil:

| Servicio | Imagen | Qué hace |
|---|---|---|
| `api` | `infra/Dockerfile.api` (~480 MB) | FastAPI + DuckDB sobre los Parquet. Usuario sin privilegios, sistema de archivos de solo lectura, datos montados `:ro`, 2 workers, límite de 3 GB. |
| `web` | `infra/Dockerfile.web` (~80 MB) | Compila Vite y sirve los estáticos con nginx; `/api/` se reenvía a la API (mismo origen, sin CORS) con **límite de 10 solicitudes/s por IP** (429 al exceder). |
| `mobile` | `infra/docker/mobile.Dockerfile` | Compila la app móvil React/Astryx y sirve su prototipo en el puerto 5173. Actualmente usa datos simulados y no consulta la API. |

## Local

```bash
docker compose up --build api web  # http://localhost:8080
```

La API lee `./data/processed` (cámbialo con `FIRELY_DATA_PROCESSED=/ruta`). Las llaves son opcionales; sin ellas todo funciona salvo la capa en vivo (`/recent` responde 503 con un mensaje claro) y el LLM (la búsqueda usa reglas locales). Pon `FIRMS_MAP_KEY`, `ANTHROPIC_API_KEY` en un `.env` junto al compose.

## En una EC2 (recomendado: `t3.medium`, 4 GB, 20 GB gp3)

1. En tu máquina: `infra/export-runtime-data.sh` genera `firely-data.tar.gz` (solo las tablas que usa la API).
2. En la instancia (Ubuntu): instala Docker y Compose, clona el repo, y
   ```bash
   mkdir -p data/processed && tar -xzf firely-data.tar.gz -C data/processed
   cp .env.example .env   # y llena las llaves que quieras
   docker compose up -d --build api web
   ```
3. Abre el puerto 80/443 en el grupo de seguridad y pon HTTPS delante (CloudFront, un ALB, o Caddy con tu dominio). El contenedor `web` escucha en `FIRELY_PORT` (8080 por defecto).

El pipeline de datos (ingesta, H3, armonización) **no** va en estas imágenes: necesita más de 5 GB de RAM y ~1 h; se corre aparte y solo se sube `data/processed`.

## Comprobaciones

```bash
docker compose ps                                  # api y web "healthy"
curl "localhost:8080/api/calendar?bbox=-100.9,25.2,-100.2,25.7&from=2021-03-01&to=2021-03-31"
```
