import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import QRCode from 'qrcode';
import { useApp } from '../state/AppState';
import { buildHash } from '../state/hash';
import { Box, Caption, Inline } from '../ui/kit';

const s = stylex.create({
  root: { display: 'flex', alignItems: 'center', gap: '12px' },
  code: { display: 'block', width: '96px', height: '96px', padding: '6px', backgroundColor: '#ffffff', borderRadius: '6px', flexShrink: 0 },
  text: { display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '14rem' },
  url: { fontVariantNumeric: 'tabular-nums', fontSize: '10px', color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' },
});

/** QR code that opens the live explorer with the same area, dates and selected month as this page. */
export default function LiveQr() {
  const app = useApp();
  const url = `${window.location.origin}${window.location.pathname}${buildHash({ page: 'explorar', area: app.area, from: app.from, to: app.to, metric: app.metric, reference: app.reference, mode: app.mode, burn: app.burn, selected: app.selected })}`;
  const [svg, setSvg] = useState('');
  useEffect(() => { let alive = true; QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#111315', light: '#ffffff' } }).then(out => { if (alive) setSvg(out); }).catch(() => setSvg('')); return () => { alive = false; }; }, [url]);
  const L = app.lang;
  return <Box xs={s.root}>
    {svg && <Inline xs={s.code} role="img" aria-label={L === 'en' ? 'QR code to the live view' : 'Código QR a la vista en vivo'} dangerouslySetInnerHTML={{ __html: svg }} />}
    <Box xs={s.text}><Caption>{L === 'en' ? 'Live view' : L === 'pt' ? 'Vista ao vivo' : 'Vista en vivo'}</Caption><Inline xs={s.url}>{url.length > 90 ? `${url.slice(0, 90)}…` : url}</Inline></Box>
  </Box>;
}
