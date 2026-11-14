import React from 'react';

export function Terrain({ points, hours, selected, onSelect, showArea }) {
  return (
    <svg viewBox="0 0 440 800" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="group" aria-label="Fondo histórico NASA de México con detecciones simuladas; no son ubicaciones verificadas"
      style={{ display: 'block' }}>
      <defs>
        <radialGradient id="fire-glow"><stop stopColor="var(--color-accent)" stopOpacity=".8" /><stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" /></radialGradient>
        <linearGradient id="map-shade" x2="0" y2="1"><stop stopColor="var(--color-background-body)" stopOpacity=".72" /><stop offset=".42" stopColor="var(--color-background-body)" stopOpacity=".12" /><stop offset="1" stopColor="var(--color-background-body)" stopOpacity=".9" /></linearGradient>
      </defs>
      <g transform="translate(220 250) rotate(18) scale(1.5) translate(-780 -650)">
        <image href="/maps/blue-marble-december-2004.jpg" width="3600" height="1800" />
      </g>
      <rect width="440" height="800" fill="url(#map-shade)" pointerEvents="none" />
      {showArea && <path data-testid="area-outline" d="M185 163 254 178 283 238 247 285 185 259 165 206Z" fill="var(--color-accent)" fillOpacity=".05" stroke="var(--color-glass-edge)" strokeDasharray="4 5" />}
      {points.map((point, index) => point.age <= hours && (
        <g key={index} transform={`translate(${220 + (point.x - 440) * .85} ${235 + (point.y - 340) * .75})`} role="button" tabIndex={0}
          aria-label={`Seleccionar detección simulada ${index + 1}`} aria-pressed={selected === index}
          onClick={() => onSelect(index)} onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(index); }
          }} style={{ cursor: 'pointer' }}>
          <circle r="29" fill="url(#fire-glow)" pointerEvents="none" />
          <circle r="22" fill="transparent" stroke={selected === index ? 'var(--color-text-primary)' : 'none'} />
          <circle r={selected === index ? 9 : 5} fill="var(--color-accent)" stroke="var(--color-text-primary)" strokeWidth=".7" />
          {selected === index && <circle r="31" fill="none" stroke="var(--color-accent)" strokeOpacity=".45" pointerEvents="none" />}
        </g>
      ))}
    </svg>
  );
}
