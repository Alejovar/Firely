import { useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import type { Lang } from '../../i18n';
import type { Country, Harmonization } from './data';

const copy = {
  es: { improve: 'Cuánto mejora', error: 'de error', base: 'Factor fijo', validation: 'Error anual absoluto medio relativo, validación dejando un año fuera, 2012–2025', data: 'Ver datos', trust: 'Cuánto confiar', observed: 'MODIS y VIIRS observan a la vez; dato directo (VIIRS observado).', estimated: 'Estimación armonizada desde MODIS', cloudy: 'Pocas observaciones válidas: celda rayada (solo Coahuila por ahora).', recent: 'Meses finales sin VIIRS: estimado desde MODIS.', api: 'Toda respuesta de la API incluye methodology_version y harmonization_uncertainty.', steps: 'El método en 5 pasos', stepsLead: 'Para el brigadista, la idea. Para el científico, el detalle.', brigade: 'Brigadista', scientist: 'Científico' },
  en: { improve: 'How much better', error: 'less error', base: 'Fixed factor', validation: 'Mean absolute relative annual error, leave-one-year-out validation, 2012–2025', data: 'View data', trust: 'How much to trust', observed: 'MODIS and VIIRS observe together; direct data (observed VIIRS).', estimated: 'Harmonized estimate from MODIS', cloudy: 'Few valid observations: hatched cell (Coahuila only for now).', recent: 'Final months without VIIRS: estimated from MODIS.', api: 'Every API response includes methodology_version and harmonization_uncertainty.', steps: 'The method in 5 steps', stepsLead: 'The idea for firefighters. The detail for scientists.', brigade: 'Firefighter', scientist: 'Scientist' },
  pt: { improve: 'Quanto melhora', error: 'menos erro', base: 'Fator fixo', validation: 'Erro anual absoluto relativo médio, validação deixando um ano de fora, 2012–2025', data: 'Ver dados', trust: 'Quanto confiar', observed: 'MODIS e VIIRS observam juntos; dado direto (VIIRS observado).', estimated: 'Estimativa harmonizada do MODIS', cloudy: 'Poucas observações válidas: célula hachurada (apenas Coahuila por enquanto).', recent: 'Meses finais sem VIIRS: estimados do MODIS.', api: 'Toda resposta da API inclui methodology_version e harmonization_uncertainty.', steps: 'O método em 5 etapas', stepsLead: 'A ideia para a brigada. O detalhe para a ciência.', brigade: 'Brigadista', scientist: 'Cientista' },
} as const;

const steps = {
  es: [
    ['Limpiar', 'Quitamos señales que no representan incendios de vegetación y repetidas.', 'Filtramos type=0, homologamos confianza MODIS/VIIRS y eliminamos duplicados exactos.'],
    ['Aprender del traslape', 'Desde 2012 aprendemos con los años en que ambos sensores observaron.', 'Calibración 2012–2025: S-NPP es la referencia VIIRS; Terra y Aqua MODIS se combinan.'],
    ['Traducir por paisaje y mes', 'El ajuste cambia según el régimen de fuego o bioma y el mes.', 'Razón mensual por grupos de celdas; el total se reparte con vecindad. No se usa quantile mapping.'],
    ['Marcar nubes', 'Señalamos los meses con pocas vistas despejadas; no cambiamos sus valores.', 'Fracción nubosa MYD08, disponible solo para Coahuila por ahora. Sin corrección de conteos.'],
    ['Medir el error', 'Escondemos un año y comprobamos cuánto se equivoca la estimación.', 'Validación año-fuera, backcast, prueba de quiebre de 2012 y contraste independiente CONAFOR.'],
  ],
  en: [
    ['Clean', 'We remove repeated signals and those unrelated to vegetation fire.', 'Filter type=0, harmonize MODIS/VIIRS confidence and remove exact duplicates.'],
    ['Learn from overlap', 'Since 2012 both sensors observed the same years.', 'Calibration 2012–2025: S-NPP is the VIIRS reference; Terra and Aqua MODIS are combined.'],
    ['Translate by landscape and month', 'The adjustment varies by fire regime or biome and month.', 'Monthly ratio by cell group; neighboring cells distribute the total. No quantile mapping.'],
    ['Mark clouds', 'We flag months with few clear views without changing values.', 'MYD08 cloud fraction, currently Coahuila only. No count correction.'],
    ['Measure error', 'We hide a year and test the estimate.', 'Leave-one-year-out validation, backcast, 2012 break test and independent CONAFOR check.'],
  ],
  pt: [
    ['Limpar', 'Removemos sinais repetidos e os que não são fogo de vegetação.', 'Filtro type=0, confiança MODIS/VIIRS harmonizada e remoção de duplicatas exatas.'],
    ['Aprender com a sobreposição', 'Desde 2012, ambos os sensores observaram os mesmos anos.', 'Calibração 2012–2025: S-NPP é a referência VIIRS; Terra e Aqua MODIS são combinados.'],
    ['Traduzir por paisagem e mês', 'O ajuste muda conforme regime de fogo ou bioma e mês.', 'Razão mensal por grupo de células; células vizinhas distribuem o total. Sem quantile mapping.'],
    ['Marcar nuvens', 'Indicamos meses com poucas observações claras sem alterar valores.', 'Fração de nuvens MYD08, apenas Coahuila por enquanto. Sem correção das contagens.'],
    ['Medir o erro', 'Escondemos um ano e testamos a estimativa.', 'Validação ano-fora, backcast, teste de quebra de 2012 e comparação independente CONAFOR.'],
  ],
} as const;

export function MethodEvidence({ country, data, lang, dataUrl }: { country: Country; data: Harmonization; lang: Lang; dataUrl: string }) {
  const [audience, setAudience] = useState<'brigadista' | 'cientifico'>('brigadista');
  const t = copy[lang];
  const max = Math.max(country.baseline_error_pct, country.annual_error_pct, 1);
  const p = (value: number) => `${value.toFixed(1)}%`;
  return <VStack gap={8}>
    <Grid columns={{ minWidth: 280, max: 2 }} gap={4}>
      <Card padding={6}><VStack gap={4}>
        <Text type="label" color="secondary">{t.improve}, {country.label}</Text>
        <HStack gap={3} vAlign="end" wrap="wrap"><Text type="display-1" hasTabularNumbers>−{country.error_reduction_pct.toFixed(0)}%</Text><Text>{t.error}</Text></HStack>
        <Text>{lang === 'es' ? 'Frente a multiplicar MODIS por un factor fijo, Firely reduce el error anual.' : lang === 'en' ? 'Compared with multiplying MODIS by a fixed factor, Firely reduces annual error.' : 'Em comparação com um fator fixo sobre o MODIS, Firely reduz o erro anual.'}</Text>
        <ProgressBar label={t.base} value={country.baseline_error_pct} max={max} variant="neutral" hasValueLabel formatValueLabel={() => p(country.baseline_error_pct)} />
        <ProgressBar label="Firely" value={country.annual_error_pct} max={max} variant="accent" hasValueLabel formatValueLabel={() => p(country.annual_error_pct)} />
        <Text type="supporting">{t.validation} · {data.attribution} · {data.data_cutoff} · v{data.methodology_version} · <Link href={dataUrl} download="harmonization.json">{t.data}</Link></Text>
      </VStack></Card>
      <Card padding={6}><VStack gap={4}>
        <Text type="label" color="secondary">{t.trust}</Text>
        <Grid columns={{ minWidth: 160, max: 2 }} gap={2}>
          {[
            { label: '2012–' + (lang === 'es' ? 'hoy' : lang === 'en' ? 'today' : 'hoje'), detail: t.observed },
            { label: '2001–2011', detail: `${t.estimated} ±${p(country.band_pct)}.` },
            { label: lang === 'es' ? 'Nublado' : lang === 'en' ? 'Cloudy' : 'Nublado', detail: t.cloudy },
            { label: lang === 'es' ? 'Meses finales' : lang === 'en' ? 'Final months' : 'Meses finais', detail: t.recent },
          ].map(item => <Card key={item.label} padding={3}><VStack gap={1}><Text type="label">{item.label}</Text><Text type="supporting">{item.detail}</Text></VStack></Card>)}
        </Grid>
        <Text type="supporting">{t.api} · {data.attribution} · {data.data_cutoff} · v{data.methodology_version}</Text>
      </VStack></Card>
    </Grid>
    <VStack gap={4}>
      <Text type="label" color="secondary">{t.steps}</Text><Heading level={2}>{t.stepsLead}</Heading>
      <SegmentedControl label={t.stepsLead} value={audience} onChange={value => setAudience(value as typeof audience)}><SegmentedControlItem value="brigadista" label={t.brigade}/><SegmentedControlItem value="cientifico" label={t.scientist}/></SegmentedControl>
      <Grid columns={{ minWidth: 180, max: 5 }} gap={3}>{steps[lang].map(([title, plain, technical], index) => <Card key={title} padding={4}><VStack gap={3}><Text type="display-3" color="accent">{String(index + 1).padStart(2, '0')}</Text><Heading level={3}>{title}</Heading><Text>{audience === 'brigadista' ? plain : technical}</Text></VStack></Card>)}</Grid>
      <Text type="supporting">{data.attribution} · {data.data_cutoff} · v{data.methodology_version}</Text>
    </VStack>
  </VStack>;
}
