import React from 'react';
import { Icon } from '@astryxdesign/core/Icon';

const paths = {
  flame: 'M13 2c1 6-5 7-2 11 2-1 3-3 3-5 5 4 6 8 3 11-3 4-10 3-12-1C2 12 9 9 8 5c2 1 3 2 3 3 2-2 2-4 2-6Z',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  layers: 'm12 3 10 6-10 6L2 9l10-6ZM2 13l10 6 10-6M2 17l10 6 10-6',
  target: 'M12 2v4m0 12v4M2 12h4m12 0h4M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  chart: 'M4 3v17h17M8 15l4-5 4 2 5-7',
};

export function FirelyIcon({ name, ...props }) {
  if (!paths[name]) return <Icon icon={name} {...props} />;
  const Glyph = svgProps => <svg {...svgProps} viewBox="0 0 24 24" fill={name === 'flame' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
  return <Icon icon={Glyph} {...props} />;
}
