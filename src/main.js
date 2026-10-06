import { render } from 'preact';
import { html } from './lib/html.js';
import { App } from './App.js';
import './styles/index.css';

// The map mesh is no longer awaited here: App downloads it only on pages that draw the map.
const root = document.getElementById('app');
root.replaceChildren();
render(html`<${App}/>`, root);
