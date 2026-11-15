import * as stylex from '@stylexjs/stylex';
import { Layout,LayoutContent,VStack,HStack } from '@astryxdesign/core/Layout';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading,Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Badge } from '@astryxdesign/core/Badge';
import { useApp } from '../state/AppState';
import { sequentialSteps,divergingSteps } from '../lib/dataviz';
import { Caption } from '../ui/kit';
const sx=stylex.create({
  logo:{width:'var(--spacing-10)',height:'var(--spacing-10)'},
  swatch:{height:'var(--spacing-8)',minWidth:'var(--spacing-8)',flex:'1 1 0',borderRadius:'var(--radius-1)'},
  chip:{height:'var(--spacing-8)',width:'var(--spacing-10)',borderRadius:'var(--radius-1)',borderWidth:'1px',borderStyle:'solid',borderColor:'var(--color-border)'},
  stripe:{backgroundImage:'repeating-linear-gradient(135deg,var(--color-data-neutral) 0,var(--color-data-neutral) var(--spacing-0-5),var(--color-background-muted) var(--spacing-0-5),var(--color-background-muted) var(--spacing-2))'},
  estimate:{backgroundColor:'var(--color-data-blue-3)',borderBottom:'var(--spacing-1) solid var(--color-data-neutral)'},
  selected:{backgroundColor:'var(--color-data-blue-2)',outline:'var(--spacing-0-5) solid var(--color-text-primary)'},
  dark:{backgroundColor:'var(--color-background-inverse)',padding:'var(--spacing-5)',borderRadius:'var(--radius-3)',color:'var(--color-text-inverse)'},
  light:{backgroundColor:'var(--color-background)',padding:'var(--spacing-5)',borderRadius:'var(--radius-3)',borderWidth:'1px',borderStyle:'solid',borderColor:'var(--color-border)'},
  mono:{fontFamily: 'var(--font-family-code)'},
  serif:{fontFamily: 'var(--font-family-heading)',fontSize:'var(--font-size-3xl)',fontWeight:600,lineHeight:1.1},
  serifItalic:{fontFamily: 'var(--font-family-heading)',fontStyle:'italic',fontSize:'var(--font-size-lg)'},
  big:{fontSize:'var(--font-size-xl)'},
  brand:{fill:'var(--color-accent)'},ash:{fill:'var(--color-text-secondary)'},orbit:{stroke:'var(--color-text-secondary)',fill:'none'},
});
function Logo({variant}:{variant:'a'|'b'|'c'}){return <svg {...stylex.props(sx.logo)} viewBox="0 0 48 48" role="img" aria-label={`Firely logo ${variant.toUpperCase()}`}>{variant==='a'?Array.from({length:9},(_,i)=><rect key={i} x={9+(i%3)*11} y={9+Math.floor(i/3)*11} width="7" height="7" {...stylex.props(i===4?sx.brand:sx.ash)}/>):variant==='b'?<><circle cx="24" cy="24" r="17" {...stylex.props(sx.orbit)} strokeWidth="2"/><circle cx="24" cy="24" r="6" {...stylex.props(sx.brand)}/><circle cx="39" cy="15" r="2" {...stylex.props(sx.ash)}/></>:<><path d="M6 13h36M6 22h28M14 31h28M6 40h36" {...stylex.props(sx.orbit)} strokeWidth="3"/><circle cx="31" cy="26" r="5" {...stylex.props(sx.brand)}/></>}</svg>}
const txt={
  es:{guide:'Guía de identidad',tag:'Una carta de campo para leer 25 años de fuego.',back:'Volver al mapa',logos:'Logo',palette:'Color',ramps:'Color de los datos',type:'Tipografía',themes:'Modo oscuro y claro',rule:'El naranja de seguridad marca acciones (botón principal, pestaña activa, foco). Nunca codifica datos.',a:'Píxel encendido',b:'Brasa en órbita',c:'Bajo la ceniza',inUse:'En uso'},
  en:{guide:'Identity guide',tag:'A field sheet for reading 25 years of fire.',back:'Back to the map',logos:'Logo',palette:'Color',ramps:'Data color',type:'Typography',themes:'Dark and light modes',rule:'Safety orange marks actions (primary button, active tab, focus). It never encodes data.',a:'Lit pixel',b:'Orbiting ember',c:'Under the ash',inUse:'In use'},
  pt:{guide:'Guia de identidade',tag:'Uma carta de campo para ler 25 anos de fogo.',back:'Voltar ao mapa',logos:'Logo',palette:'Cor',ramps:'Cor dos dados',type:'Tipografia',themes:'Modos escuro e claro',rule:'O laranja de segurança marca ações (botão principal, aba ativa, foco). Nunca codifica dados.',a:'Pixel aceso',b:'Brasa em órbita',c:'Sob a cinza',inUse:'Em uso'},
};
const PALETTE:[string,string,string][]=[
  ['Naranja de seguridad','var(--color-accent)','Equipo de alta visibilidad de brigada'],
  ['Carbón de monte','var(--color-background-body)','Fondo; matorral quemado, no negro'],
  ['Ladera','var(--color-background-surface)','Paneles'],
  ['Curva de nivel','var(--color-border)','Filetes y divisiones'],
  ['Liquen','var(--color-text-secondary)','Texto secundario'],
  ['Papel de carta','var(--color-text-primary)','Texto'],
];
export default function Identity(){const app=useApp(),t=txt[app.lang];return <Layout height="auto" contentWidth={1120} content={<LayoutContent padding={6}><VStack gap={10}>
  <VStack gap={3}><Text type="supporting" color="secondary">{t.guide}</Text><Heading level={1}>{t.tag}</Heading><HStack><Button label={t.back} href="#/explorar" variant="ghost"/></HStack></VStack>
  <VStack gap={4}><Heading level={2}>{t.logos}</Heading><Grid columns={{minWidth:220,max:3}} gap={4}>{(['a','b','c'] as const).map(v=><Card key={v} padding={5}><VStack gap={3}><HStack gap={3} vAlign="center"><Logo variant={v}/><Heading level={3}>{t[v]}</Heading>{v==='a'&&<Badge label={t.inUse} variant="neutral"/>}</HStack><Text type="supporting">{v==='a'?'Un píxel de satélite se enciende entre sus vecinos apagados.':v==='b'?'La brasa al centro y el paso del satélite alrededor.':'Capas de ceniza como líneas de barrido del sensor.'}</Text></VStack></Card>)}</Grid></VStack>
  <VStack gap={4}><Heading level={2}>{t.palette}</Heading><Text>Tomado de las cartas topográficas del INEGI y del equipo de las brigadas.</Text><Grid columns={{minWidth:160,max:3}} gap={4}>{PALETTE.map(([label,color,use])=><HStack key={label} gap={3} vAlign="center"><VStack xstyle={sx.chip} style={{backgroundColor:color}}/><VStack gap={0}><Text weight="semibold">{label}</Text><Text type="supporting">{use}</Text></VStack></HStack>)}</Grid><Text>{t.rule}</Text></VStack>
  <VStack gap={4}><Heading level={2}>{t.ramps}</Heading><Heading level={3}>Conteos (secuencial)</Heading><HStack gap={1}>{sequentialSteps(app.scheme).map((color,i)=><VStack key={i} xstyle={sx.swatch} style={{backgroundColor:color}}/>)}</HStack><HStack hAlign="between"><Text type="supporting">0 puntos</Text><Text type="supporting">Máximo</Text></HStack><Heading level={3}>Anomalías (divergente)</Heading><HStack gap={1}>{divergingSteps().map((color,i)=><VStack key={i} xstyle={sx.swatch} style={{backgroundColor:color}}/>)}</HStack><HStack hAlign="between"><Text type="supporting">¼ de la referencia</Text><Text type="supporting">Igual a la referencia</Text><Text type="supporting">4 veces</Text></HStack><HStack gap={5} wrap="wrap"><VStack gap={1}><VStack xstyle={[sx.swatch,sx.stripe]}/><Text>Rayado: nubes</Text></VStack><VStack gap={1}><VStack xstyle={[sx.swatch,sx.estimate]}/><Text>Barra: estimación</Text></VStack><VStack gap={1}><VStack xstyle={[sx.swatch,sx.selected]}/><Text>Contorno: seleccionado</Text></VStack></HStack></VStack>
  <VStack gap={4}><Heading level={2}>{t.type}</Heading><Grid columns={{minWidth:250,max:3}} gap={6}>
    <VStack gap={2}><Caption>Atkinson Hyperlegible Next, para leer</Caption><Text xstyle={sx.big}>Firely muestra el fuego de tu zona.</Text><Text>Diseñada para baja visión: cada letra se distingue de sus vecinas, también al sol y en pantallas pequeñas.</Text></VStack>
    <VStack gap={2}><Caption>Source Serif 4, títulos y cifras</Caption><Text xstyle={sx.serif}>84,8× en marzo de 2021</Text><Text xstyle={sx.serifItalic}>Sierra de Arteaga</Text><Text>Años del calendario, cifras grandes y rasgos naturales del mapa en itálica, como en una carta topográfica.</Text></VStack>
    <VStack gap={2}><Caption>Atkinson Hyperlegible Mono, solo código</Caption><Text xstyle={sx.mono}>GET /v1/calendar?admin=05004</Text><Text>Consultas SQL, API y el código del widget.</Text></VStack>
  </Grid></VStack>
  <VStack gap={4}><Heading level={2}>{t.themes}</Heading><Grid columns={{minWidth:250,max:2}} gap={4}><VStack xstyle={sx.dark} gap={3}><HStack gap={2} vAlign="center"><Logo variant="a"/><Heading level={3}>Firely</Heading></HStack><Text>Centro de monitoreo</Text><HStack gap={2}><Button label="Ficha PDF" variant="primary" href="#/ficha"/><Button label="Ver datos" href="#/explorar"/></HStack></VStack><VStack xstyle={sx.light} gap={3}><HStack gap={2} vAlign="center"><Logo variant="a"/><Heading level={3}>Firely</Heading></HStack><Text>Ficha impresa</Text><HStack gap={2}><Button label="Ficha PDF" variant="primary" href="#/ficha"/><Button label="Ver datos" href="#/explorar"/></HStack></VStack></Grid></VStack>
</VStack></LayoutContent>}/>}
