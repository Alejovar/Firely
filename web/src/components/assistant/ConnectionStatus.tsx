import { useEffect, useState } from 'react';
import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ArrowPathIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { API_URL } from '../../api/client';
import type { Lang } from '../../i18n';

const labels = {
  es: { checking: 'Conectando con Firely…', online: 'Conectado a Firely', offline: 'Sin conexión con el servidor', mock: 'Servidor con datos simulados', retry: 'Comprobar conexión' },
  en: { checking: 'Connecting to Firely…', online: 'Connected to Firely', offline: 'Server unreachable', mock: 'Server with simulated data', retry: 'Check connection' },
  pt: { checking: 'Conectando ao Firely…', online: 'Conectado ao Firely', offline: 'Sem conexão com o servidor', mock: 'Servidor com dados simulados', retry: 'Verificar conexão' },
};

export default function ConnectionStatus({ lang }: { lang: Lang }) {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline' | 'mock'>('checking');
  const [attempt, setAttempt] = useState(0), t = labels[lang];
  useEffect(() => {
    const controller = new AbortController();
    setStatus('checking');
    async function check() {
      try {
        if (!API_URL) throw Error('unconfigured');
        const response = await fetch(`${API_URL}/openapi.json`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]) });
        if (!response.ok) throw Error(String(response.status));
        const schema = await response.json();
        if (!String(schema.info?.title).startsWith('Firely API') || !schema.paths?.['/calendar']) throw Error('incompatible');
        if (!controller.signal.aborted) setStatus(String(schema.info.title).includes('(mock)') ? 'mock' : 'online');
      } catch { if (!controller.signal.aborted) setStatus('offline'); }
    }
    void check();
    const reconnect = () => setAttempt(value => value + 1);
    const disconnect = () => setStatus('offline');
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', disconnect);
    return () => { controller.abort(); window.removeEventListener('online', reconnect); window.removeEventListener('offline', disconnect); };
  }, [attempt]);
  return <HStack gap={2} vAlign="center" aria-live="polite">
    {status === 'online' ? <CheckCircleIcon width="1em" aria-hidden="true" /> : status === 'offline' ? <ExclamationCircleIcon width="1em" aria-hidden="true" /> : null}
    <Text type="supporting">{t[status]}</Text>
    {status === 'offline' && <IconButton label={t.retry} size="sm" variant="ghost" icon={<ArrowPathIcon />} onClick={() => setAttempt(value => value + 1)} />}
  </HStack>;
}
