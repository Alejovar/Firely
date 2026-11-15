import type { Map } from 'maplibre-gl';

export const TERRAIN_SOURCE = 'firely-elevation';
export const TERRAIN_PITCH = 55;
export const TERRAIN_CREDIT = 'Terrain © Mapzen, USGS';
export const TERRAIN_CREDIT_URL = 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md';

/** Tilezen/Mapzen bare-earth elevations, Terrarium RGB encoding (metres).
 * https://registry.opendata.aws/terrain-tiles/
 * These tiles describe terrain; they are independent of the fire observations.
 * Ported from the mobile app (integration/mobile-main, fb6491e); on the web, rotation and tilt
 * use right-click drag (or Ctrl + drag) and two-finger gestures on touch screens. */
export function setMapRelief(map: Map, enabled: boolean, immediate = false) {
  if (enabled && !map.getSource(TERRAIN_SOURCE)) {
    map.addSource(TERRAIN_SOURCE, {
      type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 14,
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      attribution: TERRAIN_CREDIT,
    });
  }
  map.setTerrain(enabled ? { source: TERRAIN_SOURCE, exaggeration: 1 } : null);
  if (enabled) {
    map.dragRotate.enable(); map.touchZoomRotate.enableRotation(); map.touchPitch.enable(); map.keyboard.enableRotation();
  } else {
    map.dragRotate.disable(); map.touchZoomRotate.disableRotation(); map.touchPitch.disable(); map.keyboard.disableRotation();
  }
  map.easeTo({ pitch: enabled ? TERRAIN_PITCH : 0, bearing: enabled ? map.getBearing() : 0,
    duration: immediate || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650 });
}

/** Back to north, keeping the tilt. */
export function resetBearing(map: Map) {
  map.easeTo({ bearing: 0, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400 });
}
