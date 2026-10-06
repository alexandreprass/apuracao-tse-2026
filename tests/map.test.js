import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createGeography, cameraFor } from '../src/map/geography.js';
import { IBGE_PREFIX, ufOfIbge } from '../src/data/states.js';
import { inkOn, MAP_THEMES } from '../src/map/mapTheme.js';
import { completionColor, marginColor, mix, MAP_BASE, partyColor } from '../src/lib/color.js';

// Node has no Canvas. Geometry tests only collect bounds and membership;
// drawing and pointer selection are checked in the browser.
globalThis.Path2D = class { moveTo() {} lineTo() {} closePath() {} addPath() {} };
const atlas = JSON.parse(readFileSync(new URL('../geo/brasil.topo.json', import.meta.url), 'utf8'));
const geo = createGeography(atlas, { m: {} });

test('the atlas has 5,571 municipalities in 27 states', () => {
  assert.equal(geo.municipalities.length, 5571);
  assert.equal(Object.keys(geo.states).length, 27);
  assert.equal(geo.states.SP.municipalities.length, 645);
  for (const m of geo.municipalities) {
    assert.ok(m.box.every(Number.isFinite));
    assert.ok(geo.states[m.uf]);
  }
});

test('every municipality the TSE publishes is drawn on the map (Boa Esperança do Norte included)', () => {
  const codes = JSON.parse(readFileSync(new URL('../public/data/tse/municipios.json', import.meta.url), 'utf8'));
  const missing = Object.keys(codes).filter(ibge => !geo.byId.has(ibge));
  assert.deepEqual(missing, []);
  assert.equal(Object.keys(codes).length, 5571);
  assert.equal(geo.byId.get('5101837').name, 'Boa Esperança do Norte');
  assert.equal(geo.byId.get('5101837').uf, 'MT');
});

test('IBGE code prefixes match the atlas', () => {
  for (const m of geo.municipalities) assert.equal(ufOfIbge(m.id), m.uf, m.name);
  assert.equal(Object.keys(IBGE_PREFIX).length, 27);
});

test('map labels pick the ink with more contrast (AA for the presidential finalists)', () => {
  for (const theme of ['dark', 'light']) for (const party of ['PL', 'PT', 'PSD', 'MDB', 'NOVO', 'UNIÃO']) for (const margin of [0, .06, .2, .5]) {
    const fill = marginColor(partyColor(party), margin, theme), ink = inkOn(fill);
    const other = ink === '#ffffff' ? '#141821' : '#ffffff';
    assert.ok(contrast(fill, ink) >= contrast(fill, other) - 1e-9, `${party} ${margin} ${theme}`);
    if (party === 'PL' || party === 'PT') assert.ok(contrast(fill, ink) >= 4.5, `${party} ${margin} ${theme}: ${contrast(fill, ink).toFixed(2)}`);
  }
});

test('cameras fit every state and every municipality', () => {
  for (const [width, height] of [[358, 358], [650, 650]]) {
    for (const uf of Object.keys(geo.states)) {
      const camera = cameraFor(geo, uf, null, width, height), box = geo.states[uf].box;
      assert.ok(camera.k > 0 && Number.isFinite(camera.k));
      assert.ok(box[0] * camera.k + camera.x >= 0 && box[2] * camera.k + camera.x <= width);
      assert.ok(box[1] * camera.k + camera.y >= 0 && box[3] * camera.k + camera.y <= height);
    }
  }
  for (const municipality of geo.municipalities) {
    const camera = cameraFor(geo, municipality.uf, municipality, 358, 358);
    assert.ok(Object.values(camera).every(Number.isFinite), municipality.name);
  }
});

/** WCAG relative luminance contrast between two #rrggbb colours. */
function contrast(a, b) {
  const lum = hex => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return .2126 * r + .7152 * g + .0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + .05) / (y + .05);
}

/** The state outline (rgba) composited over a fill. */
function outlineOver(hex, theme) {
  const [r, g, b, a] = MAP_THEMES[theme].stateOutline.match(/[\d.]+/g).map(Number);
  return '#' + [r, g, b].map((v, i) => Math.round(a * v + (1 - a) * parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16)).toString(16).padStart(2, '0')).join('');
}

test('every map colour step stands out from the page background in both themes', () => {
  const page = { dark: '#101216', light: '#f6f7f9' };
  for (const theme of ['dark', 'light']) {
    for (const party of ['PL', 'PT', 'PSD', 'MDB', 'NOVO', 'UNIÃO', 'XYZ']) {
      for (const margin of [0, .06, .2, .5]) {
        const color = marginColor(partyColor(party), margin, theme);
        assert.match(color, /^#[0-9a-f]{6}$/);
        // Central palette rule (design): the strongest step reaches 3:1 on the page; lighter steps are
        // delimited by the page or by the state outline. Measured minimum today: 2.93:1 (DC, light, step 2),
        // reported to design as just under the 3:1 of WCAG 1.4.11; this guards against regressions.
        if (margin >= .3) assert.ok(contrast(color, page[theme]) >= 3, `${party} ${margin} ${theme}: ${contrast(color, page[theme]).toFixed(2)}`);
        else assert.ok(Math.max(contrast(color, page[theme]), contrast(outlineOver(color, theme), color)) >= 2.9, `${party} ${margin} ${theme}: contorno`);
      }
    }
    for (const ratio of [0, .3, .6, .9, 1]) assert.ok(contrast(completionColor(ratio, theme), page[theme]) >= 1.3);
  }
  assert.equal(mix(MAP_BASE.dark, '#ffffff', 0), MAP_BASE.dark);
});
