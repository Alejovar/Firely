// Firely UI primitives. Astryx components carry most of the app; these small StyleX-styled elements give the denser
// field-sheet look (outlined buttons, toggle pills, safety-orange switches, printed-legend boxes) where Astryx does not.
// Colors are Astryx theme tokens so light/dark mode keeps working.
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';

/** Reading and UI text. */
export const SANS = 'var(--font-family-body)';
/** Titles, big figures, years of the calendar and natural features on the map (cartographic convention). */
export const SERIF = 'var(--font-family-heading)';
/** Code only (SQL, API, widget snippets). */
export const MONO = 'var(--font-family-code)';

const k = stylex.create({
  box: { minWidth: 0 },
  caption: { fontFamily: SANS, fontSize: '12px', fontWeight: 400, color: 'var(--color-text-secondary)', lineHeight: 1.35 },
  mono: { fontFamily: SANS, fontVariantNumeric: 'tabular-nums' },
  num: { fontFamily: SANS, fontVariantNumeric: 'tabular-nums' },
  figure: { fontFamily: SERIF, fontWeight: 600, fontVariantNumeric: 'lining-nums tabular-nums', lineHeight: 1 },
  btn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexShrink: 0, height: '32px', paddingInline: '11px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-emphasized)', borderRadius: '6px',
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-background-muted)' }, color: 'var(--color-text-primary)',
    fontFamily: SANS, fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', textDecoration: 'none',
    ':focus-visible': { outline: '2px solid var(--color-accent)', outlineOffset: '1px' },
    ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
  },
  btnLg: { height: '44px', paddingInline: '12px' },
  btnSm: { height: '26px', paddingInline: '9px', fontSize: '12.5px', borderRadius: '4px' },
  btnOn: { backgroundColor: 'var(--color-background-muted)', borderColor: 'var(--color-text-secondary)' },
  btnAccent: { backgroundColor: { default: 'var(--color-accent)', ':hover': 'var(--color-accent)' }, borderColor: 'var(--color-accent)', color: 'var(--color-on-accent)', fontWeight: 600 },
  pills: { display: 'flex', gap: '4px', flexWrap: 'wrap' },
  pill: {
    height: '26px', paddingInline: '10px', borderRadius: '13px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'transparent',
    backgroundColor: 'transparent', color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    fontFamily: SANS, fontSize: '12.5px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
    ':focus-visible': { outline: '2px solid var(--color-accent)', outlineOffset: '1px' },
  },
  pillOn: { backgroundColor: 'var(--color-text-primary)', color: { default: 'var(--color-background-surface)', ':hover': 'var(--color-background-surface)' }, borderColor: 'var(--color-text-primary)' },
  pillOff: { borderColor: 'var(--color-border-emphasized)' },
  seg: { display: 'inline-flex', borderRadius: '6px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-emphasized)', flexShrink: 0, overflow: 'hidden' },
  segItem: { height: '28px', paddingInline: '11px', borderWidth: 0, borderRadius: 0, backgroundColor: { default: 'transparent', ':hover': 'var(--color-background-muted)' }, color: 'var(--color-text-secondary)', fontFamily: SANS, fontSize: '12.5px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', ':focus-visible': { outline: '2px solid var(--color-accent)', outlineOffset: '-2px' } },
  segOn: { backgroundColor: { default: 'var(--color-text-primary)', ':hover': 'var(--color-text-primary)' }, color: 'var(--color-background-surface)' },
  link: {
    padding: 0, borderWidth: 0, backgroundColor: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 'inherit',
    color: { default: 'var(--color-text-primary)', ':hover': 'var(--color-text-accent)' }, textDecorationLine: 'underline',
    textDecorationColor: { default: 'var(--color-border-emphasized)', ':hover': 'var(--color-text-accent)' }, textUnderlineOffset: '3px', textDecorationThickness: '1px',
    ':focus-visible': { outline: '2px solid var(--color-accent)' },
  },
  toggle: { position: 'relative', flexShrink: 0, width: '30px', height: '16px', borderRadius: '8px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-emphasized)', padding: 0, cursor: 'pointer', backgroundColor: 'var(--color-background-muted)', ':focus-visible': { outline: '2px solid var(--color-accent)', outlineOffset: '2px' }, ':disabled': { opacity: 0.45, cursor: 'not-allowed' } },
  toggleOn: { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)' },
  knob: { position: 'absolute', top: '1px', left: '1px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--color-text-secondary)', transitionProperty: 'left', transitionDuration: '120ms' },
  knobOn: { left: '15px', backgroundColor: 'var(--color-on-accent)' },
  panel: { borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-emphasized)', borderRadius: '8px', backgroundColor: 'var(--color-background-surface)' },
  /** Boxes printed over the map: nearly square with a 1px rule, like the legend of a topographic sheet. */
  floating: { borderRadius: '2px', borderColor: 'var(--color-text-secondary)' },
  card2: { borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', borderRadius: '6px', backgroundColor: 'var(--color-background-muted)' },
});

type Xs = StyleXStyles | false | null | undefined | Xs[];
interface BoxProps extends HTMLAttributes<HTMLElement> { xs?: Xs; as?: 'div' | 'section' | 'aside' | 'header' | 'nav' | 'main' | 'footer' | 'span' | 'p' | 'b' | 'label' | 'ul' | 'li'; style?: CSSProperties; children?: ReactNode }

/** Layout element styled with StyleX (the design's own boxes). */
export const Box = forwardRef<HTMLElement, BoxProps>(function Box({ xs, as = 'div', style, children, ...rest }, ref) {
  const Tag = as as 'div';
  const sx = stylex.props(k.box, xs as StyleXStyles);
  return <Tag ref={ref as never} {...rest} className={sx.className} style={{ ...(sx.style as CSSProperties), ...style }}>{children}</Tag>;
});
export const Inline = (p: Omit<BoxProps, 'as'>) => <Box as="span" {...p} />;

/** Small secondary label in sentence case ("Área seleccionada", "Capas"). */
export function Caption({ children, xs, style, ...rest }: Omit<BoxProps, 'as'>) {
  return <Box as="span" xs={[k.caption, xs]} style={style} {...rest}>{children}</Box>;
}
/** Tabular figures in the reading face (not monospace). */
export function Mono({ children, xs, style, ...rest }: Omit<BoxProps, 'as'>) {
  return <Box as="span" xs={[k.mono, xs]} style={style} {...rest}>{children}</Box>;
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { size?: 'sm' | 'md' | 'lg'; isOn?: boolean; accent?: boolean; xs?: Xs }
export const OutlineButton = forwardRef<HTMLButtonElement, BtnProps>(function OutlineButton({ size = 'md', isOn, accent, xs, children, type = 'button', ...rest }, ref) {
  const sx = stylex.props(k.btn, size === 'lg' && k.btnLg, size === 'sm' && k.btnSm, isOn && k.btnOn, accent && k.btnAccent, xs as StyleXStyles);
  return <button ref={ref} type={type} {...rest} {...sx}>{children}</button>;
});

export function LinkButton({ children, xs, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { xs?: Xs }) {
  return <button type={type} {...rest} {...stylex.props(k.link, xs as StyleXStyles)}>{children}</button>;
}

interface Option<T extends string> { value: T; label: ReactNode; title?: string }
/** Rounded pill toggles (type: all, agricultural, forest). */
export function Pills<T extends string>({ value, options, onChange, label, outlined = true }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string; outlined?: boolean }) {
  return <Box role="radiogroup" aria-label={label} xs={k.pills}>{options.map(o => <button key={o.value} type="button" role="radio" aria-checked={value === o.value} title={o.title} onClick={() => onChange(o.value)} {...stylex.props(k.pill, value === o.value ? k.pillOn : outlined && k.pillOff)}>{o.label}</button>)}</Box>;
}
/** Boxed segmented control (count or anomaly). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string }) {
  return <Box role="radiogroup" aria-label={label} xs={k.seg}>{options.map(o => <button key={o.value} type="button" role="radio" aria-checked={value === o.value} title={o.title} onClick={() => onChange(o.value)} {...stylex.props(k.segItem, value === o.value && k.segOn)}>{o.label}</button>)}</Box>;
}
/** Small safety-orange switch. */
export function Toggle({ isOn, onChange, label, disabled, title }: { isOn: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; title?: string }) {
  return <button type="button" role="switch" aria-checked={isOn} aria-label={label} title={title} disabled={disabled} onClick={() => onChange(!isOn)} {...stylex.props(k.toggle, isOn && k.toggleOn)}><Box as="span" xs={[k.knob, isOn && k.knobOn]} /></button>;
}
/** Big figure in the serif (ratios, counts). */
export function Figure({ children, xs, style, ...rest }: Omit<BoxProps, 'as'>) {
  return <Box as="span" xs={[k.figure, xs]} style={style} {...rest}>{children}</Box>;
}
export const kit = k;
