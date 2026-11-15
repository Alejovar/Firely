import type { Map } from 'maplibre-gl';

export const TERRAIN_SOURCE = 'firely-elevation';
export const SATELLITE_SOURCE = 'firely-satellite';

/** Tilezen/Mapzen bare-earth elevations, Terrarium RGB encoding (metres).
 * https://registry.opendata.aws/terrain-tiles/
 * These tiles describe terrain; they are independent of the fire observations. */
export function setMapRelief(map: Map, enabled: boolean, immediate = false) {
  if (enabled && !map.getSource(TERRAIN_SOURCE)) {
    map.addSource(TERRAIN_SOURCE, {
      type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 14,
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      attribution: 'Terrain © Mapzen, USGS, other contributors',
    });
  }
  map.setTerrain(enabled ? { source: TERRAIN_SOURCE, exaggeration: 1 } : null);
  if (enabled) {
    map.dragRotate.enable(); map.touchZoomRotate.enableRotation(); map.touchPitch.enable();
  } else {
    map.dragRotate.disable(); map.touchZoomRotate.disableRotation(); map.touchPitch.disable();
  }
  map.easeTo({ pitch: enabled ? 55 : 0, bearing: enabled ? map.getBearing() : 0,
    duration: immediate || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650 });
}
