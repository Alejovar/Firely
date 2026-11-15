# Documentación técnica

La rama `test` reúne el trabajo de `main` (web, API y pipeline) y `feat/mobile-ui` (app Android). La integración conserva ambos historiales; `main` no se modifica al probar aquí.

Los documentos del equipo están en `docs/firely-descripcion.md` y `docs/firely-plan.md`. También se conserva el contexto previo de la rama móvil en la raíz:

- `FIRELY_CONTEXTO_CODEX.md`: contexto integral y decisiones del equipo.
- `firely-descripcion.md`: descripción científica y funcional.
- `firely-plan.md`: plan de ejecución y prioridades.

La estructura integrada del repositorio es:

```text
apps/mobile/          Aplicación móvil con Capacitor
web/                  Aplicación web
api/                  API FastAPI
pipeline/             Procesamiento y armonización
ai/                   Lenguaje natural y descripciones
bot/                  Bot del equipo
packages/contracts/   Contratos compartidos con la API
infra/                Docker de API y web
infra/docker/         Docker del prototipo móvil
docs/                 Documentación técnica
```

`compose.yaml` es el único archivo Compose de la raíz y contiene `api`, `web` y `mobile`. Para iniciar web/API: `docker compose up --build api web`; para la vista móvil: `docker compose up --build -d mobile`.

La app Glass de `apps/mobile/` está conectada al mismo cliente de API que la web mediante `packages/contracts/api-client.ts`. En Android lleva su interfaz dentro del APK y puede consultar el servidor por el túnel TCP de ADB. La API en modo real necesita los Parquet indicados en `infra/README.md`; sin ellos la app muestra una respuesta vacía, no cifras ficticias. Los datos pesados y las credenciales quedan fuera de Git. `mobile-smoke/` es una prueba local anterior, ignorada y no necesaria para compilar.
