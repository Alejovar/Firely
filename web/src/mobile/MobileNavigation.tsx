import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Button } from '@astryxdesign/core/Button';
import { useApp } from '../state/AppState';
import { useNav } from '../i18n';
import type { Page } from '../state/hash';

const styles = stylex.create({
  dock: { position: 'fixed', insetInline: 0, bottom: 0, zIndex: 30,
    paddingTop: 'var(--spacing-2)', paddingInline: 'max(var(--spacing-2), env(safe-area-inset-left))',
    paddingBottom: 'max(var(--spacing-2), env(safe-area-inset-bottom))',
    backgroundColor: 'var(--color-background-surface)', borderTop: 'var(--border-width-1, 1px) solid var(--color-border)' },
});

export default function MobileNavigation() {
  const app = useApp(), t = useNav(app.lang);
  const [more, setMore] = useState(false);
  const go = (page: Page) => { app.navigate(page); setMore(false); window.scrollTo(0, 0); };
  const en = app.lang === 'en', pt = app.lang === 'pt';
  return <VStack as="nav" aria-label={t.main} gap={2} xstyle={styles.dock}>
    {more && <HStack gap={2} wrap="wrap" padding={3}>
      {([['metodo', t.method], ['historia', t.history], ['plataforma', t.platform], ['ficha', t.sheet], ['widget', t.widget], ['identidad', t.identity]] as [Page, string][])
        .map(([page, label]) => <Button key={page} label={label} variant="ghost" aria-current={app.page === page ? 'page' : undefined} onClick={() => go(page)} />)}
    </HStack>}
    <HStack gap={1} hAlign="between">
      <Button label={en ? 'Explore' : 'Explorar'} width="25%" size="lg" variant={app.page === 'explorar' ? 'primary' : 'ghost'} aria-current={app.page === 'explorar' ? 'page' : undefined} onClick={() => go('explorar')} />
      <Button label={t.assistant} width="25%" size="lg" variant={app.page === 'asistente' ? 'primary' : 'ghost'} aria-current={app.page === 'asistente' ? 'page' : undefined} onClick={() => go('asistente')} />
      <Button label={en ? 'Field' : 'Campo'} width="25%" size="lg" variant={app.page === 'campo' ? 'primary' : 'ghost'} aria-current={app.page === 'campo' ? 'page' : undefined} onClick={() => go('campo')} />
      <Button label={en ? 'More' : pt ? 'Mais' : 'Más'} width="25%" size="lg" variant="ghost" aria-expanded={more} onClick={() => setMore(value => !value)} />
    </HStack>
  </VStack>;
}
