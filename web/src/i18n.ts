// UI strings. Pages may add their own keys; shared navigation strings live here.
export type Lang = 'es' | 'en' | 'pt';

export const nav = {
  es: { explore: 'Mapa', assistant: 'Asistente', method: 'Método', history: 'Historia', platform: 'Alertas y API', sheet: 'Ficha', widget: 'Widget', identity: 'Identidad', tagline: 'MODIS + VIIRS · 2001–2026', dataUntil: 'Datos hasta', language: 'Idioma', dark: 'Modo oscuro', light: 'Modo claro', search: 'Buscar lugar o escribir una consulta, ej. «incendios en Arteaga en marzo de 2021»', main: 'Navegación principal' },
  en: { explore: 'Map', assistant: 'Assistant', method: 'Method', history: 'Story', platform: 'Alerts & API', sheet: 'Brief', widget: 'Widget', identity: 'Identity', tagline: 'MODIS + VIIRS · 2001–2026', dataUntil: 'Data until', language: 'Language', dark: 'Dark mode', light: 'Light mode', search: 'Search a place or type a request, e.g. “fires in Arteaga in March 2021”', main: 'Main navigation' },
  pt: { explore: 'Mapa', assistant: 'Assistente', method: 'Método', history: 'História', platform: 'Alertas e API', sheet: 'Ficha', widget: 'Widget', identity: 'Identidade', tagline: 'MODIS + VIIRS · 2001–2026', dataUntil: 'Dados até', language: 'Idioma', dark: 'Modo escuro', light: 'Modo claro', search: 'Busque um lugar ou escreva uma consulta, ex. “queimadas em Arteaga em março de 2021”', main: 'Navegação principal' },
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
