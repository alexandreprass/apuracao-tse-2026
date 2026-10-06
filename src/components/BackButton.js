import { html } from '../lib/html.js';
import { Icon } from './Icon.js';

/** Labelled way out of the current place: names where it leads instead of a bare "x". */
export function BackButton({ to, article = '', onClick }) {
  return html`<button class="back-button" onClick=${onClick} aria-label=${`Voltar para ${article}${to}`} aria-keyshortcuts="Escape" title="Voltar (Esc)">
    <${Icon} name="left" size=${16}/>${to}
  </button>`;
}
