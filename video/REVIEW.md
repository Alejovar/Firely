# Revisión v1

- `hyperframes check`: 0 errores. Quedan 2 avisos de "tramo muerto" en la escena 2 (las líneas de la gráfica se dibujan con `stroke-dashoffset` y el detector no lo cuenta como cambio; en los fotogramas sí se ve el trazo).
- Cifras verificadas contra los datos: serie anual de México (`web/public/data/harmonization.json`), calendario y marzo 2021 de Sierra de Arteaga (API `/calendar`: 861 puntos, 84.8×, retorno 26 años, percentil 96), 2,137 detecciones FIRMS de marzo 2021 (`/hotspots.geojson`), validación −31.9 % México / −30.1 % Argentina.
- Voz: ElevenLabs, Sarah, eleven_multilingual_v2. Transcripción con Whisper: el texto se oye completo y en español; "VIIRS" se pronuncia "virs".
- Sonido: efectos de ElevenLabs (fuego de fondo, transiciones, pop, sello, notificación). Sin música: la API de música de ElevenLabs requiere plan de pago.
- Medido, no escuchado: los niveles de audio no se han oído.
- Pendiente: música; revisar el ritmo con el corte renderizado.
