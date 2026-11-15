// Firely UI primitives. Astryx components carry most of the app; these small StyleX-styled elements reproduce the
// denser "instrument panel" look of the design (mono captions, outlined buttons, pill toggles, ember switches)
// where Astryx does not give that aspect. Colors are Astryx theme tokens so light/dark mode keeps working.
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';

export const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
export const SANS = '"IBM Plex Sans", system-ui, sans-serif';

const k = stylex.create({
  box: { minWidth: 0 },
  caption: { fontFamily: MONO, fontSize: '10px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-disabled)', lineHeight: 1.3 },
  mono: { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' },
  btn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexShrink: 0, height: '32px', paddingInline: '10px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-emphasized)', borderRadius: '8px',
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-background-muted)' }, color: 'var(--color-text-primary)',
    fontFamily: SANS, fontSize: '12.5px', fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', textDecoration: 'none',
    ':focus-visible': { outline: '2px solid var(--color-accent)', outlineOffset: '1px' },
    ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
  },
  btnLg: { height: '44px', paddingInline: '11px', borderRadius: '10px' },
  btnSm: { height: '26px', paddingInline: '9px', fontSize: '12px', borderRadius: '6px' },
  btnOn: { backgroundColor: 'var(--color-background-muted)', borderColor: 'var(--color-text-disabled)' },
  btnAccent: { backgroundColor: { default: 'var(--color-accent)', ':hover': 'var(--color-accent)' }, borderColor: 'var(--color-accent)', color: 'var(--color-on-accent)' },
  pills: { display: 'flex', gap: '2px', flexWrap: 'wrap' },
  pill: {
    height: '26px', paddingInline: '10px', borderRadius: '13px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'transparent',
    backgroundColor: 'transparent', color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    fontFamily: SANS, fontSize: '12px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
    ':focus-visible': { outline: '2px solid var(--color-accent)', outlineOffset: '1px' },
  },
  pillOn: { backgroundColor: 'var(--color-text-primary)', color: { default: 'var(--color-background-surface)', ':hover': 'var(--color-background-surface)' }, borderColor: 'var(--color-text-primary)' },
  pillOff: { borderColor: 'var(--color-border-emphasized)' },
  seg: { display: 'inline-flex', padding: '2px', borderRadius: '8px', backgroundColor: 'var(--color-background-muted)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', flexShrink: 0 },
  segItem: { height: '26px', paddingInline: '10px', borderWidth: 0, borderRadius: '6px', backgroundColor: 'transparent', color: 'var(--color-text-secondary)', fontFamily: SANS, fontSize: '12px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', ':focus-visible': { outline: '2px solid var(--color-accent)' } },
  segOn: { backgroundColor: 'var(--color-background-surface)', color: 'var(--color-text-primary)', boxShadow: '0 1px 2px rgba(0,0,0,.25), inset 0 0 0 1px var(--color-border-emphasized)' },
  link: {
    padding: 0, borderWidth: 0, backgroundColor: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 'inherit',
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-accent)' }, textDecorationLine: 'underline',
    textDecorationColor: { default: 'var(--color-border-emphasized)', ':hover': 'var(--color-accent)' }, textUnderlineOffset: '2px',
    ':focus-visible': { outline: '2px solid var(--color-accent)' },
  },
  toggle: { position: 'relative', flexShrink: 0, width: '28px', height: '16px', borderRadius: '8px', borderWidth: 0, padding: 0, cursor: 'pointer', backgroundColor: 'var(--color-border-emphasized)', ':focus-visible': { outline: '2px solid var(--color-accent)', outlineOffset: '2px' }, ':disabled': { opacity: 0.45, cursor: 'not-allowed' } },
  toggleOn: { backgroundColor: 'var(--color-accent)' },
  knob: { position: 'absolute', top: '2px', left: '2px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ffffff', transitionProperty: 'left', transitionDuration: '120ms' },
  knobOn: { left: '14px' },
  panel: { borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-emphasized)', borderRadius: '10px', backgroundColor: 'var(--color-background-surface)' },
  floating: { boxShadow: '0 8px 24px rgba(0,0,0,.25)' },
  card2: { borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-emphasized)', borderRadius: '10px', backgroundColor: 'var(--color-background-muted)' },
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

/** Mono, spaced, uppercase caption ("ÁREA SELECCIONADA", "CAPAS"…). */
export function Caption({ children, xs, style, ...rest }: Omit<BoxProps, 'as'>) {
  return <Box as="span" xs={[k.caption, xs]} style={style} {...rest}>{children}</Box>;
}
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
/** Rounded pill choices (Tipo · Todas / Agrícola / Forestal). */
export function Pills<T extends string>({ value, options, onChange, label, outlined = true }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string; outlined?: boolean }) {
  return <Box role="radiogroup" aria-label={label} xs={k.pills}>{options.map(o => <button key={o.value} type="button" role="radio" aria-checked={value === o.value} title={o.title} onClick={() => onChange(o.value)} {...stylex.props(k.pill, value === o.value ? k.pillOn : outlined && k.pillOff)}>{o.label}</button>)}</Box>;
}
/** Boxed segmented control (Conteo / Anomalía). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string }) {
  return <Box role="radiogroup" aria-label={label} xs={k.seg}>{options.map(o => <button key={o.value} type="button" role="radio" aria-checked={value === o.value} title={o.title} onClick={() => onChange(o.value)} {...stylex.props(k.segItem, value === o.value && k.segOn)}>{o.label}</button>)}</Box>;
}
/** Small ember switch. */
export function Toggle({ isOn, onChange, label, disabled, title }: { isOn: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; title?: string }) {
  return <button type="button" role="switch" aria-checked={isOn} aria-label={label} title={title} disabled={disabled} onClick={() => onChange(!isOn)} {...stylex.props(k.toggle, isOn && k.toggleOn)}><Box as="span" xs={[k.knob, isOn && k.knobOn]} /></button>;
}
export const kit = k;
