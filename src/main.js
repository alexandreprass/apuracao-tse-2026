import { render } from 'preact';
import { html } from './lib/html.js';
import { createGeography } from './map/geography.js';
import { App } from './App.js';
import './styles/index.css';

const root = document.getElementById('app');

function BootError({ error }) {
  return html`<div class="boot" role="alert">
    <h1>O site não carregou</h1>
    <p>${error.message}</p>
    <button class="button" onClick=${() => location.reload()}>Tentar de novo</button>
  </div>`;
}

try {
  const response = await fetch(import.meta.env.BASE_URL + 'data/brasil.topo.json');
  if (!response.ok) throw new Error(`Não foi possível carregar o mapa (HTTP ${response.status}).`);
  const geo = createGeography(await response.json(), { m: {} });
  root.replaceChildren();
  render(html`<${App} geo=${geo}/>`, root);
} catch (error) {
  root.replaceChildren();
  render(html`<${BootError} error=${error}/>`, root);
}
