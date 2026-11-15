// Based on the settings template: scrolling content, header and section spacing.
import { useEffect, useRef, useState } from 'react';
import { Layout, LayoutContent, LayoutHeader, VStack, HStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { List, ListItem } from '@astryxdesign/core/List';
import { Divider } from '@astryxdesign/core/Divider';
import { Banner } from '@astryxdesign/core/Banner';
import { useApp } from '../state/AppState';
import type { UrlState } from '../state/hash';
import { API_URL } from '../api/client';
import { fieldStore, type FieldPack } from '../mobile/fieldStore';
import { downloadFieldPack } from '../mobile/fieldDownload';

const copy = {
  es: { title: 'Áreas de campo', download: 'Guardar área para campo', downloads: 'Áreas descargadas', empty: 'Todavía no tienes áreas descargadas.', open: 'Abrir área', remove: 'Borrar descarga', cancel: 'Cancelar', loading: 'Descargando', saved: 'Área guardada. Puedes consultar sus datos sin señal.', error: 'No se pudo completar la operación', partial: 'Algunos análisis no están disponibles en esta descarga.', scope: 'Se guardan el calendario y los análisis disponibles para esta área, periodo y filtros. El detalle diario se incluye solo para el mes seleccionado.', limit: 'El mapa base, las detecciones recientes, los pronósticos y el asistente requieren conexión. Las descargas no describen las condiciones actuales.', date: 'Descargada', cutoff: 'Datos hasta', optional: 'Consultas no incluidas', noServer: 'Las descargas no están disponibles en este momento.' },
  en: { title: 'Field areas', download: 'Download field area', downloads: 'Downloaded areas', empty: 'No areas downloaded yet.', open: 'Open area', remove: 'Delete download', cancel: 'Cancel', loading: 'Downloading', saved: 'Area saved. You can view its data without a connection.', error: 'Could not complete the operation', partial: 'Some analyses are unavailable in this download.', scope: 'Saves the calendar and available analyses for this area, period and filters. Daily detail is included only for the selected month.', limit: 'The basemap, recent detections, forecasts and assistant need a connection. Downloads do not describe current conditions.', date: 'Downloaded', cutoff: 'Data until', optional: 'Queries not included', noServer: 'Downloads are currently unavailable.' },
  pt: { title: 'Áreas de campo', download: 'Baixar área para campo', downloads: 'Áreas baixadas', empty: 'Nenhuma área baixada ainda.', open: 'Abrir área', remove: 'Excluir download', cancel: 'Cancelar', loading: 'Baixando', saved: 'Área salva. Você pode consultar seus dados sem conexão.', error: 'Não foi possível concluir a operação', partial: 'Algumas análises não estão disponíveis neste download.', scope: 'Salva o calendário e as análises disponíveis para esta área, período e filtros. O detalhe diário inclui apenas o mês selecionado.', limit: 'O mapa base, as detecções recentes, as previsões e o assistente precisam de conexão. Os downloads não descrevem as condições atuais.', date: 'Baixada', cutoff: 'Dados até', optional: 'Consultas não incluídas', noServer: 'Os downloads estão indisponíveis no momento.' },
};

export default function Field() {
  const app = useApp(), t = copy[app.lang];
  const [packs, setPacks] = useState<FieldPack[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    void fieldStore.list(API_URL).then(rows => { if (active) setPacks(rows); }).catch(error => { if (active) setError(String(error)); });
    return () => { active = false; controller.current?.abort(); };
  }, []);

  async function run(task: (signal: AbortSignal) => Promise<void>) {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true); setError(''); setMessage('');
    try { await task(request.signal); }
    catch (error) { if (!request.signal.aborted) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (controller.current === request) controller.current = null; setBusy(false); setProgress(''); }
  }

  const selection: UrlState = { page: 'explorar', area: app.area, from: app.from, to: app.to, metric: app.metric, reference: app.reference, mode: app.mode, burn: app.burn, selected: app.selected };
  const download = () => run(async signal => {
    const pack = await downloadFieldPack(API_URL, selection, signal, (done, total) => setProgress(`${done}/${total}`));
    setPacks(await fieldStore.list(API_URL));
    setMessage(pack.unavailable.length ? `${t.saved} ${t.partial}` : t.saved);
  });


  return <Layout height="auto" contentWidth={1440}
    header={<LayoutHeader hasDivider><Heading level={1}>{t.title}</Heading></LayoutHeader>}
    content={<LayoutContent padding={4}><VStack gap={4}>
      {error && <Banner status="error" title={t.error} description={error} />}
      {message && <Banner status="success" title={message} />}
      <VStack gap={4}>
        <Heading level={2}>{app.area.label}</Heading>
        <Text>{app.from} — {app.to} · {app.metric} · {app.reference} · {app.burn}</Text>
        <Text>{t.scope}</Text>
        <Banner status="info" title={t.limit} />
        {!API_URL && <Text>{t.noServer}</Text>}
        <HStack gap={3} wrap="wrap">
          <Button label={busy && progress ? `${t.loading} ${progress}` : t.download} variant="primary" isDisabled={!API_URL || busy} onClick={() => void download()} />
          {busy && <Button label={t.cancel} onClick={() => controller.current?.abort()} />}
        </HStack>
        <Text type="supporting" aria-live="polite">{progress ? `${t.loading}: ${progress}` : ''}</Text>
      </VStack>
      <Divider />
      <VStack gap={4}>
        <Heading level={2}>{t.downloads}</Heading>
        {packs.length === 0 && <Text>{t.empty}</Text>}
        <List hasDividers edge="flush">{packs.map(pack => <ListItem key={pack.id}
          label={<Heading level={3}>{pack.selection.area.label}</Heading>}
          description={<VStack gap={2}>
            <Text>{pack.selection.from} — {pack.selection.to} · {pack.selection.metric} · {pack.selection.reference} · {pack.selection.burn}</Text>
            <Text type="supporting">{t.date}: {new Date(pack.savedAt).toLocaleString(app.lang)} · {(pack.bytes / 1024 / 1024).toLocaleString(app.lang, { maximumFractionDigits: 2 })} MB</Text>
            <Text type="supporting">{pack.attribution} · v{pack.methodologyVersion} · {t.cutoff}: {pack.dataCutoff}</Text>
            {pack.unavailable.length > 0 && <Text type="supporting">{t.optional}: {pack.unavailable.map(path => path.split('?')[0]).join(', ')}</Text>}
            <HStack gap={3} wrap="wrap">
              <Button label={t.open} isDisabled={busy} onClick={() => { app.setLive(0); app.patch({ ...pack.selection, page: 'explorar' }); }} />
              <Button label={pendingDelete === pack.id ? `${t.remove}?` : t.remove} isDisabled={busy} variant="ghost" onClick={() => {
                if (pendingDelete !== pack.id) { setPendingDelete(pack.id); return; }
                void run(async () => { await fieldStore.remove(pack.id); setPacks(await fieldStore.list(API_URL)); setPendingDelete(null); });
              }} />
              {pendingDelete === pack.id && <Button label={t.cancel} variant="ghost" onClick={() => setPendingDelete(null)} />}
            </HStack>
          </VStack>} />)}</List>
      </VStack>
    </VStack></LayoutContent>} />;
}
