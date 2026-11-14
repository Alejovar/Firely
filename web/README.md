# FIRELY web

Interfaz Nivel 0 con React, TypeScript y MapLibre GL. Consulta la API de `../api/openapi.yaml`. La URL base predeterminada es `http://127.0.0.1:8000`; se puede cambiar con `VITE_API_URL`.

```fish
cd web
npm install
npm run dev
```

Para comprobar la compilación después de instalar dependencias:

```fish
cd web
npm run build
```

La búsqueda usa `POST /resolve-area`; coordenadas y clic en el mapa consultan `GET /calendar`. Al seleccionar un mes se consulta `GET /calendar/daily`. El dibujo de polígonos está marcado como pendiente. El mapa base usa teselas de OpenStreetMap y requiere conexión a ese servicio en tiempo de ejecución.
