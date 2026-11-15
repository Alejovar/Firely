import { FLAME_PALETTES } from '../../lib/dataviz';
import type { ExpressionSpecification, StyleImageInterface } from 'maplibre-gl';

export const FLAME_IMAGE = 'firely-animated-flame';
// Original artwork from the first mobile prototype; equal size, FRP class by color.
export const FLAME_ICON: ExpressionSpecification = ['case',
  ['==', ['get', 'frp_mw'], null], `${FLAME_IMAGE}-3`,
  ['step', ['get', 'frp_mw'], `${FLAME_IMAGE}-0`, 15, `${FLAME_IMAGE}-1`, 40, `${FLAME_IMAGE}-2`],
];
export const FLAME_PATHS = [
  'M1-25C6-14 14-12 12-3c4-1 5-5 5-8 10 12 7 25-3 29C3 23-11 19-15 10c-5-11 2-19 5-27 1 7 5 10 7 10C-5-14 1-17 1-25Z',
  'M2-7c0 7-7 10-6 16 1 6 8 8 12 4C13 8 8 2 7-1 7 3 4 4 4 4 5 0 3-3 2-7Z',
  'M3 5c-1 4-4 5-3 8 1 3 5 3 6 0 1-3-1-5-3-8Z',
] as const;


/** One shared sprite, rendered by MapLibre for every detection, without DOM markers. */
export function createFlameImage(reducedMotion: () => boolean, colors: readonly string[] = FLAME_PALETTES[0]): StyleImageInterface {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Cannot create hotspot flame sprite');
  const paths = FLAME_PATHS.map(path => new Path2D(path));
  let previous = -1;
  return {
    width: 128, height: 128, data: new Uint8Array(128 * 128 * 4),
    render() {
      const frame = reducedMotion() ? 0 : Math.floor(performance.now() / 100);
      if (frame === previous) return false;
      previous = frame;
      const phase = frame * 0.1;
      const sway = reducedMotion() ? 0 : Math.sin(phase * Math.PI * 2 / 1.7);
      const flicker = reducedMotion() ? 1 : 0.925 + 0.075 * Math.cos(phase * Math.PI * 2 / 1.1);
      ctx.clearRect(0, 0, 128, 128);
      ctx.save();
      ctx.translate(64, 104);
      ctx.scale(2, 2);
      ctx.rotate(sway * 0.06);
      ctx.scale(1, 1 + sway * 0.04);
      ctx.translate(0, -18);
      paths.forEach((path, i) => {
        ctx.save();
        if (i === 1) { ctx.translate(0, 17); ctx.scale(flicker, flicker); ctx.translate(0, -17); }
        ctx.fillStyle = colors[i];
        ctx.fill(path);
        if (i === 0) { ctx.strokeStyle = colors[1]; ctx.lineWidth = 0.7; ctx.stroke(path); }
        ctx.restore();
      });
      ctx.restore();
      this.data = ctx.getImageData(0, 0, 128, 128).data;
      return true;
    },
  };
}
