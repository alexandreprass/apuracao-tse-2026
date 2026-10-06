import { html } from '../lib/html.js';

const PATHS = {
  search: html`<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>`,
  close: html`<path d="m6 6 12 12M6 18 18 6"/>`,
  left: html`<path d="m14 5-7 7 7 7"/>`,
  up: html`<path d="m5 14 7-7 7 7"/>`,
  down: html`<path d="m5 10 7 7 7-7"/>`,
  right: html`<path d="m10 5 7 7-7 7"/>`,
  download: html`<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>`,
  plus: html`<path d="M12 5v14M5 12h14"/>`,
  minus: html`<path d="M5 12h14"/>`,
  recenter: html`<circle cx="12" cy="12" r="3"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>`,
  sun: html`<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/>`,
  share: html`<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>`,
  refresh: html`<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8m0-4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16m0 4v-4h-4"/>`,
  map: html`<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2Z"/><path d="M9 4v14m6-12v14"/>`,
  info: html`<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.5"/>`,
  moon: html`<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>`,
};

export function Icon({ name, size = 18 }) {
  return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}
