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
import { ApiError, createServerSubscription, deleteServerSubscription, listServerSubscriptions, type ServerSubscription } from '../../api/client';
import { useApp } from '../../state/AppState';
import { notifySubscriptionsChanged, parseChatId, subscribableArea } from '../../lib/alerts';
import { Box, Caption } from '../../ui/kit';

const s = stylex.create({
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', paddingBlock: '10px', borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--color-border)' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', borderWidth: '1px', borderStyle: 'dashed', borderColor: 'var(--color-border-emphasized)', borderRadius: '10px' },
});
const T = {
  es: { title: 'Suscripciones en el servidor', add: 'Suscribir esta área', name: 'Nombre', chat: 'Chat de Telegram (chat_id)', chatHelp: 'Número que te da el bot con /start; los grupos son negativos.', min: 'Índice de prioridad mínimo (0–100)', pending: 'PENDIENTE DE APROBACIÓN', approved: 'APROBADA', remove: 'Quitar', none: 'Sin suscripciones todavía.', drawn: 'Las áreas dibujadas aún no se pueden suscribir: usa un municipio, un rectángulo o un punto con radio.', badChat: 'chat_id no válido', exercise: 'Los mensajes son de ejercicio/prueba y no salen hasta que un operador aprueba la suscripción en el servidor.', created: 'Creada. Queda pendiente de aprobación humana en el servidor.', cells: 'celdas', index: 'índice ≥' },
  en: { title: 'Server subscriptions', add: 'Subscribe this area', name: 'Name', chat: 'Telegram chat (chat_id)', chatHelp: 'Number the bot gives you with /start; groups are negative.', min: 'Minimum priority index (0–100)', pending: 'PENDING APPROVAL', approved: 'APPROVED', remove: 'Remove', none: 'No subscriptions yet.', drawn: 'Drawn areas cannot be subscribed yet: use a municipality, a box or a point with radius.', badChat: 'Invalid chat_id', exercise: 'Messages are exercise/test only and nothing is sent until an operator approves the subscription on the server.', created: 'Created. Pending human approval on the server.', cells: 'cells', index: 'index ≥' },
  pt: { title: 'Assinaturas no servidor', add: 'Assinar esta área', name: 'Nome', chat: 'Chat do Telegram (chat_id)', chatHelp: 'Número que o bot dá com /start; grupos são negativos.', min: 'Índice de prioridade mínimo (0–100)', pending: 'AGUARDANDO APROVAÇÃO', approved: 'APROVADA', remove: 'Remover', none: 'Nenhuma assinatura ainda.', drawn: 'Áreas desenhadas ainda não podem ser assinadas: use um município, um retângulo ou um ponto com raio.', badChat: 'chat_id inválido', exercise: 'As mensagens são de exercício/teste e nada é enviado até um operador aprovar a assinatura no servidor.', created: 'Criada. Aguarda aprovação humana no servidor.', cells: 'células', index: 'índice ≥' },
};
const errText = (e: unknown) => e instanceof ApiError ? `API ${e.status}${e.code ? ` · ${e.code}` : ''}` : String(e);

export default function Subscriptions() {
  const app = useApp(), t = T[app.lang];
  const [rows, setRows] = useState<ServerSubscription[] | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const [name, setName] = useState(app.area.label), [chat, setChat] = useState(''), [minIndex, setMinIndex] = useState(55);
  useEffect(() => setName(app.area.label), [app.area.label]);
  useEffect(() => { const c = new AbortController(); setError(''); listServerSubscriptions(c.signal).then(r => setRows(r.rows)).catch(e => { if (!c.signal.aborted) { setError(errText(e)); setRows([]); } }); return () => c.abort(); }, [reload]);
  const area = subscribableArea(app.area.area), chatId = parseChatId(chat);
  const create = async () => {
    if (!area || chatId == null) return;
    setBusy(true); setError(''); setNotice('');
    try { await createServerSubscription({ name: name.trim() || app.area.label, area, chat_id: chatId, min_index: minIndex, lang: app.lang }); setNotice(t.created); setChat(''); setReload(n => n + 1); notifySubscriptionsChanged(); }
    catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  const remove = async (id: string) => { setBusy(true); try { await deleteServerSubscription(id); setReload(n => n + 1); notifySubscriptionsChanged(); } catch (e) { setError(errText(e)); } finally { setBusy(false); } };
  return <VStack gap={3}>
    <Heading level={3}>{t.title}</Heading>
    <Banner status="warning" title="EXERCISE / TEST" description={t.exercise} />
    {error && <Banner status="error" title={error} />}
    {notice && <Banner status="success" title={notice} />}
    <Box xs={s.form}>
      <Caption>{t.add} · {app.area.label}</Caption>
      {!area ? <Text type="supporting">{t.drawn}</Text> : <>
        <TextInput label={t.name} value={name} onChange={setName} />
        <TextInput label={t.chat} value={chat} onChange={setChat} description={t.chatHelp} status={chat && chatId == null ? { type: 'error', message: t.badChat } : undefined} />
        <NumberInput label={t.min} value={minIndex} min={0} max={100} onChange={setMinIndex} />
        <HStack gap={2}><Button label={t.add} variant="primary" onClick={create} isDisabled={chatId == null || busy} isLoading={busy} /></HStack>
      </>}
    </Box>
    {rows == null ? <Skeleton height="3rem" width="100%" /> : rows.length === 0 ? <Text type="supporting">{t.none}</Text> : rows.map(r => <Box key={r.id} xs={s.row}>
      <VStack gap={1}><Text>{r.name}</Text><Text type="supporting">{t.index} {r.min_index}{r.min_anomaly_ratio ? ` · ≥ ${r.min_anomaly_ratio}×` : ''} · {r.area_cells} {t.cells} · Telegram {r.chat_id_masked ?? '—'} · {r.created_at.slice(0, 10)}</Text></VStack>
      <HStack gap={2} vAlign="center"><Badge label={r.approved ? t.approved : t.pending} variant={r.approved ? 'success' : 'warning'} /><Button label={t.remove} size="sm" variant="ghost" onClick={() => remove(r.id)} isDisabled={busy} /></HStack>
    </Box>)}
  </VStack>;
}
