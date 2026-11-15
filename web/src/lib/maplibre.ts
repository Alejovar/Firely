// MapLibre runs its tile parsing in a Web Worker. Vite must emit the worker file and MapLibre must be told its URL
// before ANY map is created; every component that builds a map imports this module (the explorer map used to be the
// only one, so the Historia animation failed with "Worker failed to load" when opened directly).
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

setWorkerUrl(workerUrl);

/** Basemap shared with the mobile app: NASA Blue Marble with shaded relief and bathymetry, served by NASA GIBS
 *  (Web Mercator, levels 0-8; MapLibre overzooms beyond). Darker in dark mode, as in the app. */
export const BLUE_MARBLE_TILES = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';
export const blueMarbleSource = { type: 'raster' as const, tiles: [BLUE_MARBLE_TILES], tileSize: 256, maxzoom: 8 };
export const blueMarbleBrightness = (dark: boolean) => (dark ? 0.72 : 0.95);
export const BASEMAP_CREDIT = 'NASA GIBS, Blue Marble';
