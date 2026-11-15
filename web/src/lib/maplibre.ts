// MapLibre runs its tile parsing in a Web Worker. Vite must emit the worker file and MapLibre must be told its URL
// before ANY map is created; every component that builds a map imports this module (the explorer map used to be the
// only one, so the Historia animation failed with "Worker failed to load" when opened directly).
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

setWorkerUrl(workerUrl);
