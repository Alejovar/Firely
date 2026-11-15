import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';

// Firely look: IBM Plex Sans for reading, IBM Plex Mono for captions/numbers, dark warm-grey surfaces and an ember accent.
// Pairs are [light, dark].
export const firelyTheme = defineTheme({
  name: 'firely',
  extends: neutralTheme,
  tokens: {
    '--font-family-body': '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    '--font-family-heading': '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    '--font-family-code': '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    '--text-heading-1-size': 'var(--font-size-3xl)',
    '--text-heading-1-weight': 'var(--font-weight-semibold)',
    '--color-accent': ['#c9601f', '#e8803f'],
    '--color-on-accent': ['#ffffff', '#1a0d05'],
    '--color-text-accent': ['#9e4312', '#f49a61'],
    '--color-icon-accent': ['#9e4312', '#f49a61'],
    '--color-accent-muted': ['#f7ddc9', '#51301f'],
    '--color-background-body': ['#efeee9', '#0d0f11'],
    '--color-background-surface': ['#ffffff', '#14171a'],
    '--color-background-muted': ['#f6f5f1', '#1a1e22'],
    '--color-background-card': ['#f6f5f1', '#1a1e22'],
    '--color-background-popover': ['#ffffff', '#1a1e22'],
    '--color-text-primary': ['#1a1c1e', '#ebe8e3'],
    '--color-text-secondary': ['#565c63', '#9aa1a9'],
    '--color-text-disabled': ['#878c92', '#6b727a'],
    '--color-border': ['#e0ddd6', '#262b31'],
    '--color-border-emphasized': ['#cfcbc2', '#323840'],
  },
});
