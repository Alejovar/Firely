import { lazy, Suspense } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Theme } from '@astryxdesign/core/theme';
import { AppShell } from '@astryxdesign/core/AppShell';
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { TopNav } from '@astryxdesign/core/TopNav';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { Badge } from '@astryxdesign/core/Badge';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Icon } from '@astryxdesign/core/Icon';
import { BeakerIcon, ChatBubbleLeftRightIcon, MapIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { AppStateProvider, useApp, type Lang } from './state/AppState';
import { useNav } from './i18n';
import { themes } from './astryx-themes';
import AreaSearch from './components/AreaSearch';

const styles = stylex.create({
  // the TopNav search is for desktop; on phones Explorer renders its own inline search
  searchSlot: { width: 'clamp(260px, 38vw, 540px)', display: { default: 'flex', '@media (max-width: 720px)': 'none' } },
  hideOnSmall: { display: { default: 'flex', '@media (max-width: 720px)': 'none' } },
});

const Explorer = lazy(() => import('./pages/Explorer'));
const Assistant = lazy(() => import('./pages/Assistant'));
const Method = lazy(() => import('./pages/Method'));

function Shell() {
  const app = useApp();
  const t = useNav(app.lang);
  const page = app.page;
  return (
    <AppShell
      height="fill"
      variant="wash"
      contentPadding={0}
      topNav={
        <TopNav
          label={t.main}
          heading={<SideNavHeading heading="FIRELY" />}
          centerContent={page === 'explorar' ? <VStack xstyle={styles.searchSlot}><AreaSearch /></VStack> : undefined}
          endContent={
            <HStack gap={2} vAlign="center">
              <HStack xstyle={styles.hideOnSmall}><Badge label={t.tagline} variant="neutral" /></HStack>
              <Selector
                label={t.language}
                value={app.lang}
                onChange={(value) => app.setLang(value as Lang)}
                options={[{ value: 'es', label: 'ES' }, { value: 'en', label: 'EN' }, { value: 'pt', label: 'PT' }]}
              />
              <Button
                label={app.scheme === 'dark' ? t.light : t.dark}
                variant="ghost"
                isIconOnly
                icon={<Icon icon={app.scheme === 'dark' ? SunIcon : MoonIcon} />}
                onClick={app.toggleScheme}
              />
            </HStack>
          }
        />
      }
      sideNav={
        <SideNav collapsible>
          <SideNavSection title={t.main} isHeaderHidden>
            <SideNavItem label={t.explore} icon={MapIcon} isSelected={page === 'explorar'} onClick={() => app.navigate('explorar')} />
            <SideNavItem label={t.assistant} icon={ChatBubbleLeftRightIcon} isSelected={page === 'asistente'} onClick={() => app.navigate('asistente')} />
            <SideNavItem label={t.method} icon={BeakerIcon} isSelected={page === 'metodo'} onClick={() => app.navigate('metodo')} />
          </SideNavSection>
        </SideNav>
      }
    >
      <Suspense fallback={<Skeleton width="100%" height="60vh" />}>
        {page === 'explorar' && <Explorer />}
        {page === 'asistente' && <Assistant />}
        {page === 'metodo' && <Method />}
      </Suspense>
    </AppShell>
  );
}

function ThemedShell() {
  const { scheme } = useApp();
  return <Theme theme={themes.firely} mode={scheme}><Shell /></Theme>;
}

export default function App() {
  return <AppStateProvider><ThemedShell /></AppStateProvider>;
}
