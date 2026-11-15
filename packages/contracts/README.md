# Contratos compartidos

`api-client.ts` contiene el cliente y los tipos de respuesta que comparten la web y la app móvil. Se trasladó aquí el cliente de `web/src/api/client.ts`; ese archivo mantiene una reexportación compatible con los imports existentes.

Los endpoints siguen implementados en `api/app/`; esta carpeta no define una API nueva ni duplica cálculos científicos. `VITE_API_URL` fija el origen durante la compilación de cada interfaz. Las respuestas conservan fuente, versión del método, corte de datos y marcas de simulación.
