import * as stylex from '@stylexjs/stylex';
import { VStack } from '@astryxdesign/core/VStack';
import MapPanel from '../components/MapPanel';
import TopBarTools from '../components/topbar/TopBarTools';
import RightPanel from '../components/explorer/RightPanel';
const s = stylex.create({
  frame: { display: 'grid', gridTemplateColumns: { default: 'minmax(0, 1fr) minmax(35rem, 37.5rem)', '@media (max-width: 1099px)': 'minmax(0, 1fr)' }, width: '100%', height: { default: 'calc(100dvh - var(--spacing-16))', '@media (max-width: 1099px)': 'auto' }, minHeight: 0, minWidth: 0, overflow: 'hidden' },
  map: { position: 'relative', minWidth: 0, minHeight: { default: 0, '@media (max-width: 1099px)': '60vh' }, height: { default: '100%', '@media (max-width: 1099px)': '60vh' }, overflow: 'hidden' },
  panel: { minWidth: 0, minHeight: 0, height: { default: '100%', '@media (max-width: 1099px)': 'auto' }, overflowY: 'auto', backgroundColor: 'var(--color-background-surface)', borderLeft: 'thin solid var(--color-border)' },
  mobileSearch: { display: { default: 'none', '@media (max-width: 720px)': 'flex' }, padding: 'var(--spacing-2)', backgroundColor: 'var(--color-background-surface)' },
});
export default function Explorer() {
  return <VStack xstyle={s.frame}><VStack xstyle={s.mobileSearch}><TopBarTools /></VStack><VStack xstyle={s.map}><MapPanel /></VStack><VStack xstyle={s.panel}><RightPanel /></VStack></VStack>;
}
