import React from 'react';

export function Terrain({ points, hours, selected, onSelect, showArea }) {
  return (
    <svg viewBox="0 0 800 650" width="100%" role="group" aria-label="Mapa ilustrativo con detecciones simuladas; sin precisión geográfica"
      style={{ display: 'block', background: 'var(--color-background-surface)', borderRadius: 'var(--radius-container)' }}>
      <defs>
        <pattern id="contours" width="260" height="200" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)">
          <path d="M-30 35Q60-20 130 35T290 35M-30 51Q60-4 130 51T290 51M-30 67Q60 12 130 67T290 67M-30 83Q60 28 130 83T290 83M-30 99Q60 44 130 99T290 99M-30 115Q60 60 130 115T290 115M-30 131Q60 76 130 131T290 131M-30 147Q60 92 130 147T290 147M-30 163Q60 108 130 163T290 163"
            fill="none" stroke="var(--color-text-secondary)" strokeOpacity=".18" />
        </pattern>
      </defs>
      <rect width="800" height="650" fill="url(#contours)" />
      <path d="M0 550Q190 390 280 490T800 100" fill="none" stroke="var(--color-text-secondary)" strokeOpacity=".35" strokeWidth="3" />
      {showArea && <path data-testid="area-outline" d="M270 200 490 170 650 360 550 540 300 510 210 350Z" fill="var(--color-accent)" fillOpacity=".07" stroke="var(--color-accent)" strokeDasharray="8 8" />}
      {points.map((point, index) => point.age <= hours && (
        <g key={index} transform={`translate(${point.x} ${point.y})`} role="button" tabIndex={0}
          aria-label={`Seleccionar detección simulada ${index + 1}`} aria-pressed={selected === index}
          onClick={() => onSelect(index)} onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(index); }
          }} style={{ cursor: 'pointer' }}>
          <circle r="26" fill="var(--color-background-body)" fillOpacity=".6" stroke={selected === index ? 'var(--color-text-primary)' : 'none'} />
          <path d="M1-22C6-12 13-10 11-2c4-1 5-5 5-8 9 11 6 23-3 27C3 22-10 18-14 10c-5-10 2-18 5-25 1 6 5 9 7 9C-4-13 1-15 1-22Z"
            fill="var(--color-accent)" />
          <circle cy="9" r="5" fill="var(--color-text-primary)" />
        </g>
      ))}
    </svg>
  );
}
