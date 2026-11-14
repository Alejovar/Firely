import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Banner } from '@astryxdesign/core/Banner';
import { Text } from '@astryxdesign/core/Text';
import { getCalendar, type CalendarResponse } from '../api/client';
import { useApp } from '../state/AppState';
import AnalysisTabs from '../components/AnalysisTabs';
import FilterBar from '../components/FilterBar';
import StatTiles from '../components/StatTiles';
import MapPanel from '../components/MapPanel';
import CalendarHeatmap from '../components/CalendarHeatmap';
import DailyDrawer from '../components/DailyDrawer';
import { AreaSearchInline } from '../components/AreaSearch';
import { apiMessage } from '../lib/explorerLabels';
const s=stylex.create({mobileSearch:{display:{default:'none','@media (max-width: 720px)':'flex'}}});

export default function Explorer() {
  const app = useApp();
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const areaKey = JSON.stringify(app.area.area);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setData(null);
    getCalendar(app.area.area, app.from, app.to, app.metric, app.reference, controller.signal)
      .then(setData).catch((e: unknown) => { if (!controller.signal.aborted) setError(apiMessage(e, app.lang)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [areaKey, app.from, app.to, app.metric, app.reference, app.lang]);
  return <Layout height="fill" content={<LayoutContent padding={6} label="FIRELY Explorar">
    <VStack gap={6}>
      <VStack xstyle={s.mobileSearch}><AreaSearchInline /></VStack>
      <FilterBar />
      {error && <Banner status="error" title={error} />}
      <StatTiles data={data} loading={loading} error={error} />
      <Grid columns={{ minWidth: 500, max: 2 }} gap={6}>
        <MapPanel />
        <CalendarHeatmap data={data} loading={loading} error={error} />
      </Grid>
      {data && <Text type="supporting" color="secondary">{data.attribution || 'NASA FIRMS'} · {data.methodology_version} · {data.data_cutoff}</Text>}
      <AnalysisTabs />
    </VStack>
    <DailyDrawer calendar={data} />
  </LayoutContent>} />;
}
