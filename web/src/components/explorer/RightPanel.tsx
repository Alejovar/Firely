import { useEffect, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { getCalendar, type CalendarResponse } from '../../api/client';
import { useApp } from '../../state/AppState';
import { apiMessage } from '../../lib/explorerLabels';
import AnalysisTabs from '../AnalysisTabs';
import Semaforo from './Semaforo';
import CalendarPanel from './CalendarPanel';
import CellPanel from './CellPanel';
import Downloads from './Downloads';

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
  return <VStack gap={4} padding={4}>
    <Semaforo data={data} loading={loading} error={error} />
    <CalendarPanel data={data} loading={loading} error={error} />
    {app.selected && <CellPanel data={data} loading={loading} error={error} />}
    <AnalysisTabs />
    <Downloads data={data} loading={loading} error={error} />
  </VStack>;
}
