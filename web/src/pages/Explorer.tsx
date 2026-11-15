import * as stylex from '@stylexjs/stylex';
import MapPanel from '../components/MapPanel';
import TopBarTools from '../components/topbar/TopBarTools';
import RightPanel from '../components/explorer/RightPanel';
import { Box } from '../ui/kit';

const s = stylex.create({
  frame: { display: 'grid', gridTemplateColumns: { default: 'minmax(0, 1fr) minmax(32rem, 620px)', '@media (max-width: 1100px)': 'minmax(0, 1fr)' }, width: '100%', height: { default: '100%', '@media (max-width: 1100px)': 'auto' }, minHeight: 0, overflow: { default: 'hidden', '@media (max-width: 1100px)': 'visible' } },
  map: { position: 'relative', minWidth: 0, minHeight: 0, height: { default: '100%', '@media (max-width: 1100px)': 'min(72vh, 640px)' }, overflow: 'hidden', borderRightWidth: { default: '1px', '@media (max-width: 1100px)': 0 }, borderRightStyle: 'solid', borderRightColor: 'var(--color-border)' },
  panel: { minWidth: 0, minHeight: 0, height: { default: '100%', '@media (max-width: 1100px)': 'auto' }, overflowY: { default: 'auto', '@media (max-width: 1100px)': 'visible' }, backgroundColor: 'var(--color-background-surface)' },
  mobileSearch: { display: { default: 'none', '@media (max-width: 720px)': 'flex' }, padding: '10px 16px', backgroundColor: 'var(--color-background-surface)', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--color-border)' },
});
export default function Explorer() {
  return <Box xs={s.frame}>
    <Box xs={s.mobileSearch}><TopBarTools /></Box>
    <Box as="section" xs={s.map}><MapPanel /></Box>
    <Box as="aside" xs={s.panel}><RightPanel /></Box>
  </Box>;
}
