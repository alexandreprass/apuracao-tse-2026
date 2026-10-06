const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decimal1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const decimal2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const int = value => integer.format(Math.round(value || 0));
/** Percentage from a 0–100 value, as the TSE publishes it: 47.03 → "47,03%". */
export const pct = (value, digits = 2) => (digits === 2 ? decimal2 : digits === 1 ? decimal1 : integer).format(value || 0) + '%';
/** Percentage from a ratio: .4703 → "47,03%". */
export const ratio = (value, digits = 2) => pct((value || 0) * 100, digits);
export const points = value => (value > 0 ? '+' : value < 0 ? '−' : '') + decimal2.format(Math.abs(value || 0)) + ' p.p.';

export function compact(value) {
  if (value >= 1e6) return decimal1.format(value / 1e6) + ' mi';
  if (value >= 1e3) return integer.format(value / 1e3) + ' mil';
  return int(value);
}

export const signed = value => (value > 0 ? '+' : value < 0 ? '−' : '') + int(Math.abs(value));
export const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** "FLAVIO BOLSONARO" → "Flavio Bolsonaro" (the TSE publishes ballot names in capitals). */
const LOWER = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
export function titleCase(text) {
  return String(text || '').toLowerCase().split(/(\s+|-)/).map((word, i) =>
    (i && LOWER.has(word)) || !word.trim() ? word : word.charAt(0).toUpperCase() + word.slice(1)).join('')
    .replace(/\b(Ii|Iii|Iv)\b/g, w => w.toUpperCase());
}

export const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' });
export const brasiliaTime = date => timeFormat.format(date);
