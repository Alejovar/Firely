# Firely MCP server

Expone la API de Firely como herramientas MCP (stdio): `resolve_area`, `calendar`, `season`, `analogs`, `return_period`, `risk`, `watch`.
Todas las cifras vienen de la API (serie armonizada); el modelo no calcula. Cada resultado incluye `attribution` (NASA FIRMS), `methodology_version` y `data_cutoff`.

Requisitos: `.venv/bin/pip install mcp` y la API corriendo (`FIRELY_API_URL`, por defecto `http://127.0.0.1:8000`).

## Claude Code

```fish
claude mcp add firely -e FIRELY_API_URL=http://127.0.0.1:8000 -- $PWD/.venv/bin/python $PWD/mcp/server.py
```

## Claude Desktop (`claude_desktop_config.json`)

```json
{"mcpServers": {"firely": {"command": "/ruta/a/Firely/.venv/bin/python",
  "args": ["/ruta/a/Firely/mcp/server.py"], "env": {"FIRELY_API_URL": "http://127.0.0.1:8000"}}}}
```
