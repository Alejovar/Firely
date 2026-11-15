import type { Map } from 'maplibre-gl';
import { createFlameImage, FLAME_IMAGE, FLAME_PATHS } from './flameImage';

import { FLAME_PALETTES } from '../../lib/dataviz';

export function FlameLegend({ level }: { level: number }) {
  return <svg width={20} height={20} viewBox="-24 -28 52 52" aria-hidden="true">
    {FLAME_PATHS.map((path, i) => <path key={path} d={path} fill={FLAME_PALETTES[level][i]} />)}
  </svg>;
}

export function registerFlameImage(map: Map): () => void {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  FLAME_PALETTES.forEach((colors, level) => {
    map.addImage(`${FLAME_IMAGE}-${level}`, createFlameImage(() => preference.matches, colors), { pixelRatio: 2 });
  });
  const repaint = () => map.triggerRepaint();
  preference.addEventListener('change', repaint);
  // Limit uploads to 10fps, and let hidden/empty maps rest. Four color sprites are shared
  // by up to 20,000 features rather than animating thousands of HTML elements.
  const timer = window.setInterval(() => {
    if (preference.matches || document.hidden) return;
    const visible = ['firely-points', 'firely-recent'].filter(id => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');
    if (visible.length && map.queryRenderedFeatures({ layers: visible }).length) repaint();
  }, 100);
  return () => { clearInterval(timer); preference.removeEventListener('change', repaint); };
}
