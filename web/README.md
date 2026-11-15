# FIRELY web

La variante Android basada en este frontend se documenta en [ANDROID.md](ANDROID.md).

## API en desarrollo local

Para usar el backend de EC2 desde el navegador local, copia `.env.example` a
`.env.local` y abre el túnel SSH de la sección «EC2 por SSH» de `ANDROID.md`.
Vite reenvía `/api` al túnel; las credenciales SSH permanecen en la computadora.
`FIRELY_API_PROXY_TARGET` cambia el destino y `FIRELY_API_PROXY_PATH=preserve`
conserva el prefijo cuando el destino es nginx. Para FastAPI directo, usa
`http://127.0.0.1:8000` y `FIRELY_API_PROXY_PATH=strip`.

La configuración se aplica tanto a `npm run dev` como a `npm run preview`.
El asistente comprueba la API al abrirse y permite reintentar la conexión.

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
