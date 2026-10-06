import { render } from 'preact';
import { html } from './lib/html.js';
import { createGeography } from './map/geography.js';
import { App } from './App.js';
import './styles/index.css';

const asset = import.meta.env.BASE_URL;
const DATA_FILES = [asset + 'data/brasil.topo.json', asset + 'data/zonas.json', asset + 'data/tse.json'];
const root = document.getElementById('app');

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Não foi possível carregar ${url} (HTTP ${response.status}).`);
  return response.json();
}

function BootError({ error }) {
  return html`<div class="boot" role="alert">
    <h1>O mapa não carregou</h1>
    <p>${error.message}</p>
    <button class="button" onClick=${() => location.reload()}>Tentar de novo</button>
  </div>`;
}

try {
  const [topology, zones, tse] = await Promise.all(DATA_FILES.map(loadJson));
  const { setTse } = await import('./data/mocks.js');
  setTse(tse);
  root.replaceChildren();
  render(html`<${App} geo=${createGeography(topology, zones)}/>`, root);
} catch (error) {
  root.replaceChildren();
  render(html`<${BootError} error=${error}/>`, root);
}
