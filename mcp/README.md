# Firely MCP server

Expone la API de Firely como herramientas MCP (stdio local o HTTP streamable público):

| Pregunta | Herramientas |
|---|---|
| ¿Dónde? | `resolve_area` |
| ¿Qué pasó? ¿Es normal? | `calendar`, `return_period`, `events` |
| ¿Por qué? | `context` (ONI, FWI), `weather` (NASA POWER), `weekday`, `night` |
| ¿Qué viene? | `season`, `analogs`, `risk` (índice de prioridad) |
| ¿A quién afecta? | `spread`, `wind_localities` (indicativos, viento de Open-Meteo) |
| Largo plazo | `regimes`, `reported` (CONAFOR) |
| Ahora | `recent_hotspots` (NRT 24/48 h), `watch`, `bulletin` |
| Entrenamiento | `drill_scenario` (simulacro con un evento histórico real) |

Todas las cifras vienen de la API (serie armonizada); el modelo no calcula. Cada resultado incluye `attribution` (NASA FIRMS), `methodology_version` y `data_cutoff`.

Requisitos: `.venv/bin/pip install mcp` y la API corriendo (`FIRELY_API_URL`, por defecto `http://127.0.0.1:8000`).

## HTTP público

`docker compose up -d --build mcp web` expone las herramientas en `https://tu-dominio/mcp` a través de nginx. Configura `FIRELY_MCP_ALLOWED_HOSTS` con el dominio público y, para pruebas locales, `localhost,localhost:*,127.0.0.1,127.0.0.1:*`. La validación de Host está siempre activa para evitar DNS rebinding. `FIRELY_MCP_ALLOWED_ORIGINS` permite declarar orígenes adicionales de clientes basados en navegador. El endpoint `/healthz` solo existe en la red interna de Docker. Nginx limita llamadas por IP y el servidor no conserva sesiones.

Las herramientas hacen consultas de solo lectura a la API interna. Publica el sitio tras un proxy HTTPS; el transporte MCP HTTP no usa contraseña por defecto.

## Claude Code

```fish
claude mcp add firely -e FIRELY_API_URL=http://127.0.0.1:8000 -- $PWD/.venv/bin/python $PWD/mcp/server.py
```

## Claude Desktop (`claude_desktop_config.json`)

```json
{"mcpServers": {"firely": {"command": "/ruta/a/Firely/.venv/bin/python",
  "args": ["/ruta/a/Firely/mcp/server.py"], "env": {"FIRELY_API_URL": "http://127.0.0.1:8000"}}}}
```
