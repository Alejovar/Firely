import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { ApiError, createServerSubscription, listServerSubscriptions, previewServerSubscription, testServerSubscription, type ServerSubscription, type SubscriptionPreview } from '../../api/client';
import { useApp } from '../../state/AppState';
import { notifySubscriptionsChanged, parseChatId, subscribableArea } from '../../lib/alerts';
import { Box, Caption } from '../../ui/kit';

const s = stylex.create({
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', paddingBlock: '10px', borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--color-border)' },
  msg: { fontFamily: 'var(--font-family-code)', fontSize: '12.5px', whiteSpace: 'pre-wrap', margin: 0, padding: '12px', borderRadius: '8px', backgroundColor: 'var(--color-background-muted)' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', borderWidth: '1px', borderStyle: 'dashed', borderColor: 'var(--color-border-emphasized)', borderRadius: '10px' },
});
const T = {
  es: { title: 'Suscripciones en el servidor', add: 'Suscribir esta área', name: 'Nombre', chat: 'Chat de Telegram (chat_id)', chatHelp: 'Opcional. Abre @FirelyGotita_bot en Telegram y escribe /start: te responde con este número. Déjalo vacío para solo usar la vista previa.', send: 'Enviar prueba a mi Telegram', sent: 'Enviado a Telegram: revisa tu teléfono.', wait: 'Espera dos minutos entre pruebas.', noBot: 'Abre el bot en Telegram y escribe /start antes de la prueba.', min: 'Índice de prioridad mínimo (0–100)', pending: 'Pendiente de aprobación', approved: 'Activa', remove: 'Quitar', none: 'Sin suscripciones todavía.', drawn: 'Las áreas dibujadas aún no se pueden suscribir: usa un municipio, un rectángulo o un punto con radio.', badChat: 'chat_id no válido', exercise: 'Los mensajes llegan solo a tu chat y van marcados como ejercicio. Para darte de baja escribe /baja al bot.', created: 'Suscripción activa. Pulsa «Enviar prueba a mi Telegram» para verla llegar.', cells: 'celdas', index: 'índice ≥', preview: 'Vista previa', status: { below_threshold: 'Hoy no se dispara: el área está por debajo del umbral.', no_chat: 'Se dispararía, pero esta suscripción no tiene chat: solo vista previa.', pending_approval: 'Se dispararía, pero falta la aprobación del operador.', telegram_not_configured: 'Se dispararía y está aprobada, pero el bot de Telegram no está configurado en el servidor.', would_send: 'Se enviaría en la próxima corrida diaria (06:30 UTC).' } },
  en: { title: 'Server subscriptions', add: 'Subscribe this area', name: 'Name', chat: 'Telegram chat (chat_id)', chatHelp: 'Optional. Open @FirelyGotita_bot in Telegram and send /start: it replies with this number. Leave it empty to only use the preview.', send: 'Send a test to my Telegram', sent: 'Sent to Telegram: check your phone.', wait: 'Wait two minutes between tests.', noBot: 'Open the bot in Telegram and send /start before testing.', min: 'Minimum priority index (0–100)', pending: 'Pending approval', approved: 'Active', remove: 'Remove', none: 'No subscriptions yet.', drawn: 'Drawn areas cannot be subscribed yet: use a municipality, a box or a point with radius.', badChat: 'Invalid chat_id', exercise: 'Messages go only to your chat and are marked as exercises. To unsubscribe, send /baja to the bot.', created: 'Subscription active. Press «Send a test to my Telegram» to see it arrive.', cells: 'cells', index: 'index ≥', preview: 'Preview', status: { below_threshold: 'Not triggered today: the area is below the threshold.', no_chat: 'It would trigger, but this subscription has no chat: preview only.', pending_approval: 'It would trigger, but operator approval is missing.', telegram_not_configured: 'It would trigger and is approved, but the Telegram bot is not configured on the server.', would_send: 'It would be sent on the next daily run (06:30 UTC).' } },
  pt: { title: 'Assinaturas no servidor', add: 'Assinar esta área', name: 'Nome', chat: 'Chat do Telegram (chat_id)', chatHelp: 'Opcional. Abra @FirelyGotita_bot no Telegram e envie /start: ele responde com este número. Deixe vazio para só usar a prévia.', send: 'Enviar teste ao meu Telegram', sent: 'Enviado ao Telegram: confira seu celular.', wait: 'Espere dois minutos entre testes.', noBot: 'Abra o bot no Telegram e envie /start antes do teste.', min: 'Índice de prioridade mínimo (0–100)', pending: 'Aguardando aprovação', approved: 'Ativa', remove: 'Remover', none: 'Nenhuma assinatura ainda.', drawn: 'Áreas desenhadas ainda não podem ser assinadas: use um município, um retângulo ou um ponto com raio.', badChat: 'chat_id inválido', exercise: 'As mensagens chegam só ao seu chat e são marcadas como exercício. Para cancelar, envie /baja ao bot.', created: 'Assinatura ativa. Clique em «Enviar teste ao meu Telegram» para vê-la chegar.', cells: 'células', index: 'índice ≥', preview: 'Prévia', status: { below_threshold: 'Hoje não dispara: a área está abaixo do limiar.', no_chat: 'Dispararia, mas esta assinatura não tem chat: só prévia.', pending_approval: 'Dispararia, mas falta a aprovação do operador.', telegram_not_configured: 'Dispararia e está aprovada, mas o bot do Telegram não está configurado no servidor.', would_send: 'Seria enviada na próxima execução diária (06:30 UTC).' } },
};
const errText = (e: unknown) => e instanceof ApiError ? `API ${e.status}${e.code ? `, ${e.code}` : ''}` : String(e);

export default function Subscriptions() {
  const app = useApp(), t = T[app.lang];
  const [rows, setRows] = useState<ServerSubscription[] | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const [preview, setPreview] = useState<SubscriptionPreview | null>(null), [previewing, setPreviewing] = useState('');
  const [name, setName] = useState(app.area.label), [chat, setChat] = useState(''), [minIndex, setMinIndex] = useState(55);
  useEffect(() => setName(app.area.label), [app.area.label]);
  useEffect(() => { const c = new AbortController(); setError(''); listServerSubscriptions(c.signal).then(r => setRows(r.rows)).catch(e => { if (!c.signal.aborted) { setError(errText(e)); setRows([]); } }); return () => c.abort(); }, [reload]);
  const area = subscribableArea(app.area.area), chatId = parseChatId(chat);
  const create = async () => {
    if (!area || (chat.trim() && chatId == null)) return;
    setBusy(true); setError(''); setNotice('');
    try { await createServerSubscription({ name: name.trim() || app.area.label, area, chat_id: chatId ?? undefined, min_index: minIndex, lang: app.lang }); setNotice(t.created); setChat(''); setReload(n => n + 1); notifySubscriptionsChanged(); }
    catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  const showPreview = async (id: string) => { setPreviewing(id); setPreview(null); setError(''); try { setPreview(await previewServerSubscription(id)); } catch (e) { setError(errText(e)); } finally { setPreviewing(''); } };
  const sendTest = async (id: string) => {
    setPreviewing(id); setError(''); setNotice('');
    try { await testServerSubscription(id); setNotice(t.sent); }
    catch (e) { setError(e instanceof ApiError && e.status === 429 ? t.wait : e instanceof ApiError && e.status === 502 ? t.noBot : errText(e)); }
    finally { setPreviewing(''); }
  };
  return <VStack gap={3}>
    <Heading level={3}>{t.title}</Heading>
    <Banner status="info" title={app.lang === 'en' ? 'Exercise messages' : app.lang === 'pt' ? 'Mensagens de exercício' : 'Mensajes de ejercicio'} description={t.exercise} />
    {error && <Banner status="error" title={error} />}
    {notice && <Banner status="success" title={notice} />}
    <Box xs={s.form}>
      <Caption>{t.add}, {app.area.label}</Caption>
      {!area ? <Text type="supporting">{t.drawn}</Text> : <>
        <TextInput label={t.name} value={name} onChange={setName} />
        <TextInput label={t.chat} value={chat} onChange={setChat} description={t.chatHelp} status={chat && chatId == null ? { type: 'error', message: t.badChat } : undefined} />
        <NumberInput label={t.min} value={minIndex} min={0} max={100} onChange={setMinIndex} />
        <HStack gap={2}><Button label={t.add} variant="primary" onClick={create} isDisabled={(chat.trim() !== '' && chatId == null) || busy} isLoading={busy} /></HStack>
      </>}
    </Box>
    {rows == null ? <Skeleton height="3rem" width="100%" /> : rows.length === 0 ? <Text type="supporting">{t.none}</Text> : rows.map(r => <Box key={r.id} xs={s.row}>
      <VStack gap={1}><Text>{r.name}</Text><Text type="supporting">{t.index} {r.min_index}{r.min_anomaly_ratio ? `, ≥ ${r.min_anomaly_ratio}×` : ''}, {r.area_cells} {t.cells}, Telegram {r.chat_id_masked ?? '—'}, {r.created_at.slice(0, 10)}</Text></VStack>
      <HStack gap={2} vAlign="center"><Badge label={r.approved ? t.approved : t.pending} variant={r.approved ? 'success' : 'warning'} /><Button label={t.preview} size="sm" variant="secondary" onClick={() => void showPreview(r.id)} isLoading={previewing === r.id} />{r.chat_id_masked && <Button label={t.send} size="sm" variant="primary" onClick={() => void sendTest(r.id)} isDisabled={previewing === r.id} />}</HStack>
    </Box>)}
    {preview && <VStack gap={2}>
      <Banner status={preview.evaluation.triggered ? 'warning' : 'info'} title={`${preview.subscription.name}: ${t.status[preview.status]}`}
        description={`${t.index.replace(' ≥', '')} ${preview.evaluation.index} (${preview.evaluation.level}), ${preview.evaluation.period}${preview.evaluation.anomaly_ratio != null ? `, ${preview.evaluation.anomaly_ratio}×` : ''}. ${preview.note}`} />
      <pre {...stylex.props(s.msg)}>{preview.message}</pre>
    </VStack>}
  </VStack>;
}
