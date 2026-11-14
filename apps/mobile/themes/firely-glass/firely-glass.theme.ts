// The firely-glass theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in firely-glass.settings.json and the generated firely-glass.settings.ts;
// change them with `astryx experimental theme editor set firely-glass ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {firelyGlassSettings} from './firely-glass.settings';

export const firelyGlassTheme = defineTheme({
  extends: firelyGlassSettings,
  name: 'firely-glass',
  tokens: {
    '--color-background-body': '#071820',
    '--color-text-primary': '#f4f8fa',
    '--color-text-secondary': '#cfdee5',
    '--color-glass': 'rgba(22, 54, 70, .78)',
    '--color-glass-edge': 'rgba(202, 232, 248, .46)',
    '--color-glass-highlight': 'rgba(217, 241, 255, .16)',
    '--color-map-shade': 'rgba(3, 21, 29, .48)',
    '--shadow-glass': 'inset 0 1px 0 rgba(255,255,255,.35), 0 12px 40px rgba(0,0,0,.3)',
    '--shadow-fire': '0 0 24px rgba(255,123,36,.55)',
  },
  components: {
    button: {
      base: { minHeight: '44px', borderRadius: '999px' },
      'variant:secondary': { background: 'rgba(64, 91, 106, .7)', color: '#f4f8fa', border: '1px solid rgba(202,232,248,.35)', backdropFilter: 'blur(16px)' },
      'variant:primary': { background: 'linear-gradient(120deg, #ffad51, #ff7b24)', color: '#251102', boxShadow: '0 0 24px rgba(255,123,36,.22)' },
    },
    'icon-button': { base: { minWidth: '44px', minHeight: '44px', borderRadius: '999px' } },
  },
});
