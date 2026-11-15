import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { useApp } from '../state/AppState';
import { API_URL } from '../api/client';
import { isMobileApp } from './backend';

export function NativeSupport() {
  const app = useApp();
  const current = useRef(app);
  current.current = app;
  const [online, setOnline] = useState(navigator.onLine);
  const [stored, setStored] = useState<{ savedAt: string; label: string } | null>(null);
  useEffect(() => {
    const onNetwork = () => setOnline(navigator.onLine);
    const onStored = (event: Event) => setStored((event as CustomEvent).detail);
    window.addEventListener('online', onNetwork);
    window.addEventListener('offline', onNetwork);
    window.addEventListener('firely:field-response', onStored);
    const network = Capacitor.isNativePlatform() ? Network.addListener('networkStatusChange', status => setOnline(status.connected)) : null;
    if (Capacitor.isNativePlatform()) void Network.getStatus().then(status => setOnline(status.connected));
    const back = Capacitor.isNativePlatform() ? NativeApp.addListener('backButton', () => {
      // Let the focused dialog consume Back as Escape before changing pages.
      const dialog = document.querySelector('[role="dialog"], dialog[open]');
      if (dialog) {
        (document.activeElement ?? dialog).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      } else if (current.current.page !== 'explorar') current.current.navigate('explorar');
      else void NativeApp.minimizeApp();
    }) : null;
    return () => {
      window.removeEventListener('online', onNetwork);
      window.removeEventListener('offline', onNetwork);
      window.removeEventListener('firely:field-response', onStored);
      void network?.then(handle => handle.remove());
      void back?.then(handle => handle.remove());
    };
  }, []);
  useEffect(() => setStored(null), [app.page, app.area, app.from, app.to, app.metric, app.reference, app.burn]);
  const en = app.lang === 'en', pt = app.lang === 'pt';
  if (isMobileApp && !API_URL) return <Banner container="section" status="info"
    title={en ? 'Connect to your Firely server' : pt ? 'Conecte ao servidor Firely' : 'Conecta con tu servidor Firely'}
    endContent={<Button label={en ? 'Configure' : pt ? 'Configurar' : 'Configurar'} onClick={() => app.navigate('campo')} />} />;
  if (!online || stored) return <Banner container="section" status="warning"
    title={en ? 'Field data · not current conditions' : pt ? 'Dados guardados · não são condições atuais' : 'Datos de campo · no son condiciones actuales'}
    description={stored ? `${stored.label} · ${en ? 'Downloaded' : pt ? 'Baixado' : 'Descargado'} ${new Date(stored.savedAt).toLocaleString(app.lang)}` :
      en ? 'No connection. Only previously downloaded queries are available. The basemap needs internet.' : pt ? 'Sem conexão. Apenas consultas baixadas estão disponíveis. O mapa base requer internet.' : 'Sin conexión. Solo están disponibles las consultas descargadas. El mapa base necesita internet.'}
    endContent={<Button label={en ? 'Field areas' : pt ? 'Áreas de campo' : 'Áreas de campo'} onClick={() => app.navigate('campo')} />} />;
  return null;
}
