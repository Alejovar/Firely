import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Box } from '../../ui/kit';
import { getCalendar, type CalendarResponse } from '../../api/client';
import { useApp } from '../../state/AppState';
import { apiMessage } from '../../lib/explorerLabels';
import AnalysisTabs from '../AnalysisTabs';
import Semaforo from './Semaforo';
import CalendarPanel from './CalendarPanel';
import Downloads from './Downloads';

const s = stylex.create({ root: { display: 'flex', flexDirection: 'column' }, section: { borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--color-border)', padding: '14px 22px 18px', '@media (max-width: 720px)': { padding: '14px 16px' } } });
export default function RightPanel() {
  const app = useApp();
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const areaKey = JSON.stringify(app.area.area);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setData(null);
    getCalendar(app.area.area, app.from, app.to, app.metric, app.reference, controller.signal, app.burn === 'all' ? undefined : app.burn)
      .then(setData).catch(error => { if (!controller.signal.aborted) setError(apiMessage(error, app.lang)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [areaKey, app.from, app.to, app.metric, app.reference, app.burn, app.lang]);
  return <Box xs={s.root}>
    <Semaforo data={data} loading={loading} error={error} />
    <CalendarPanel data={data} loading={loading} error={error} />
    <Box as="section" xs={s.section}><AnalysisTabs /></Box>
    <Box as="section" xs={s.section}><Downloads data={data} loading={loading} error={error} /></Box>
  </Box>;
}
