import type { ApiError, CalendarRow } from '../api/client';
import type { Lang } from '../state/AppState';

export const locale = { es: 'es-MX', en: 'en-US', pt: 'pt-BR' } as const;
export const words = {
  es: { activity: 'Actividad del último mes con datos', return: 'Periodo de retorno', peak: 'Pico de temporada típico', reliability: 'Confiabilidad de la serie', map: 'Mapa', calendar: 'Calendario de actividad', empty: 'No hay datos en este periodo', retry: 'No se pudieron cargar los datos', count: 'puntos', years: 'años', estimated: 'estimado', median: 'mediana', mean: 'promedio' },
  en: { activity: 'Activity in latest data month', return: 'Return period', peak: 'Typical seasonal peak', reliability: 'Series reliability', map: 'Map', calendar: 'Activity calendar', empty: 'No data in this period', retry: 'Could not load data', count: 'detections', years: 'years', estimated: 'estimated', median: 'median', mean: 'mean' },
  pt: { activity: 'Atividade no último mês com dados', return: 'Período de retorno', peak: 'Pico sazonal típico', reliability: 'Confiabilidade da série', map: 'Mapa', calendar: 'Calendário de atividade', empty: 'Sem dados neste período', retry: 'Não foi possível carregar os dados', count: 'pontos', years: 'anos', estimated: 'estimado', median: 'mediana', mean: 'média' },
} as const;
export const fmt = (n: number | null | undefined, lang: Lang, digits = 0) => n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat(locale[lang], { maximumFractionDigits: digits }).format(n);
export const compact = (n: number | null | undefined, lang: Lang) => n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat(locale[lang], { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export const calendarCellValue = (n: number | null | undefined, lang: Lang) => n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat(locale[lang], { maximumFractionDigits: Math.abs(n) >= 10 ? 0 : 1 }).format(n);
export const newest = (rows: CalendarRow[]) => [...rows].sort((a, b) => b.year - a.year || b.month - a.month)[0];
export const apiMessage = (error: unknown, lang: Lang) => {
  const e = error as ApiError;
  const base = words[lang].retry;
  return e?.status ? `${base} (${e.status}${e.code ? ` · ${e.code}` : ''})` : base;
};
