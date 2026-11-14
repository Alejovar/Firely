import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';

export const firelyTheme = defineTheme({
  name: 'firely',
  extends: neutralTheme,
  tokens: {
    '--color-accent': ['#c9601f', '#e8803f'],
    '--color-text-accent': ['#9e4312', '#f49a61'],
    '--color-icon-accent': ['#9e4312', '#f49a61'],
    '--color-accent-muted': ['#f7ddc9', '#51301f'],
    '--color-background-body': ['#f5f4f1', '#0d0f11'],
    '--color-background-surface': ['#ffffff', '#14171a'],
    '--color-background-muted': ['#eeece8', '#1b1f22'],
    '--color-background-card': ['#ffffff', '#202529'],
  },
});
