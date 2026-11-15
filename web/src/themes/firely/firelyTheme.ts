import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';

// Firely look, taken from the field: INEGI topographic sheets (paper, contour lines, cartographic lettering) and the
// high-visibility orange of brigade gear. Atkinson Hyperlegible Next for reading in the field, Source Serif 4 for titles
// and big figures, Atkinson Hyperlegible Mono only for code. Pairs are [light, dark].
// Fonts are loaded from Google Fonts in index.html.

export const firelyTheme = defineTheme({
  name: 'firely',
  extends: neutralTheme,
  typography: {
    body: { family: 'Atkinson Hyperlegible Next', fallbacks: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
    heading: { family: 'Source Serif 4', fallbacks: 'Georgia, Cambria, serif' },
    code: { family: 'Atkinson Hyperlegible Mono', fallbacks: 'ui-monospace, Menlo, Consolas, monospace' },
  },
  tokens: {
    '--text-heading-1-size': 'var(--font-size-3xl)',
    '--text-heading-1-weight': 'var(--font-weight-semibold)',
    '--text-heading-2-weight': 'var(--font-weight-semibold)',
    '--text-heading-3-weight': 'var(--font-weight-semibold)',
    '--text-heading-4-weight': 'var(--font-weight-semibold)',
    // Corners by hierarchy: printed-legend boxes almost square, controls 6px, panels a little softer.
    '--radius-inner': '0.25rem',
    '--radius-element': '0.375rem',
    '--radius-container': '0.5rem',
    '--radius-page': '0.75rem',
    // High-visibility safety orange (not terracotta); darkened in light mode for AA on paper.
    '--color-accent': ['#b8480c', '#f26a1b'],
    '--color-on-accent': ['#ffffff', '#1a1f1c'],
    '--color-text-accent': ['#a3400a', '#ff8a47'],
    '--color-icon-accent': ['#a3400a', '#ff8a47'],
    '--color-accent-muted': ['#fbe2d0', '#4a2a18'],
    // Charcoal of burnt scrub, slope surfaces, contour-line rules, map-paper text, lichen secondary.
    '--color-background-body': ['#f4f6f1', '#1a1f1c'],
    '--color-background-surface': ['#fbfcf9', '#232a26'],
    '--color-background-muted': ['#e9ede6', '#2b332e'],
    '--color-background-card': ['#fbfcf9', '#232a26'],
    '--color-background-popover': ['#fbfcf9', '#2b332e'],
    '--color-text-primary': ['#1c2420', '#e9ece6'],
    '--color-text-secondary': ['#4b5850', '#9aa69f'],
    '--color-text-disabled': ['#6c7870', '#76837b'],
    '--color-border': ['#c9d1cb', '#3a4540'],
    '--color-border-emphasized': ['#a9b4ac', '#4f5c55'],
  },
});
