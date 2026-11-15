// Story narration. The voice is synthesized on the server (GET /tts, Piper) so it sounds the same on every device:
// browser speechSynthesis depends on the voices of the operating system and Chrome on Linux usually has none.
// The browser voice remains a fallback when the API cannot answer.
import { API_URL } from '../api/client';
import type { Lang } from '../i18n';

const BCP47: Record<Lang, string> = { es: 'es-MX', en: 'en-US', pt: 'pt-BR' };

export function ttsUrl(text: string, lang: Lang): string {
  return `${API_URL}/tts?${new URLSearchParams({ text: text.slice(0, 800), lang })}`;
}

/** Speak `text`; calls onEnd when finished and onNoVoice when neither the server nor the browser can speak.
 *  Returns a function that stops it. */
export function narrate(text: string, lang: Lang, { onEnd, onNoVoice }: { onEnd?: () => void; onNoVoice?: () => void } = {}): () => void {
  let stopped = false, fallbackStop: (() => void) | null = null;
  const audio = new Audio(ttsUrl(text, lang));
  const fallback = () => {
    if (stopped || fallbackStop) return;
    fallbackStop = browserSpeak(text, lang, onEnd, onNoVoice);
  };
  audio.onended = () => { if (!stopped) onEnd?.(); };
  audio.onerror = fallback;
  audio.play().catch(fallback);
  return () => { stopped = true; audio.pause(); audio.removeAttribute('src'); fallbackStop?.(); };
}

function browserSpeak(text: string, lang: Lang, onEnd?: () => void, onNoVoice?: () => void): () => void {
  if (!('speechSynthesis' in window)) { onNoVoice?.(); return () => {}; }
  const synth = window.speechSynthesis, tag = BCP47[lang];
  let timer = 0;
  const speak = () => {
    const voices = synth.getVoices();
    if (!voices.length) { onNoVoice?.(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = tag;
    u.voice = voices.find(v => v.lang === tag) ?? voices.find(v => v.lang.slice(0, 2) === tag.slice(0, 2)) ?? null;
    u.onend = () => onEnd?.();
    synth.speak(u);
  };
  if (synth.getVoices().length) speak();
  else { synth.addEventListener('voiceschanged', speak, { once: true }); timer = window.setTimeout(speak, 1500); }
  return () => { window.clearTimeout(timer); synth.removeEventListener('voiceschanged', speak); synth.cancel(); };
}
