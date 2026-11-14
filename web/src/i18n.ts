// UI strings. Pages may add their own keys; shared navigation strings live here.
export type Lang = 'es' | 'en' | 'pt';

export const nav = {
  es: { explore: 'Explorar', assistant: 'Asistente', method: 'Cómo armonizamos', tagline: 'MODIS + VIIRS · 2001–2026', dataUntil: 'Datos hasta', language: 'Idioma', dark: 'Modo oscuro', light: 'Modo claro', search: 'Buscar lugar o escribir una consulta, ej. «incendios en Arteaga en marzo de 2021»', main: 'Navegación principal' },
  en: { explore: 'Explore', assistant: 'Assistant', method: 'How we harmonize', tagline: 'MODIS + VIIRS · 2001–2026', dataUntil: 'Data until', language: 'Language', dark: 'Dark mode', light: 'Light mode', search: 'Search a place or type a request, e.g. “fires in Arteaga in March 2021”', main: 'Main navigation' },
  pt: { explore: 'Explorar', assistant: 'Assistente', method: 'Como harmonizamos', tagline: 'MODIS + VIIRS · 2001–2026', dataUntil: 'Dados até', language: 'Idioma', dark: 'Modo escuro', light: 'Modo claro', search: 'Busque um lugar ou escreva uma consulta, ex. “queimadas em Arteaga em março de 2021”', main: 'Navegação principal' },
} as const;

export const useNav = (lang: Lang) => nav[lang];

export const monthNames: Record<Lang, string[]> = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
};
export const monthShort: Record<Lang, string[]> = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
};
