import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createGeography, cameraFor } from '../src/map/geography.js';
import { completionColor, marginColor, mix, MAP_BASE, partyColor } from '../src/lib/color.js';

// Node has no Canvas. Geometry tests only collect bounds and membership;
// drawing and pointer selection are checked in the browser.
globalThis.Path2D = class { moveTo() {} lineTo() {} closePath() {} addPath() {} };
const atlas = JSON.parse(readFileSync(new URL('../public/data/brasil.topo.json', import.meta.url), 'utf8'));
const geo = createGeography(atlas, { m: {} });

test('the atlas has 5,570 municipalities in 27 states', () => {
  assert.equal(geo.municipalities.length, 5570);
  assert.equal(Object.keys(geo.states).length, 27);
  assert.equal(geo.states.SP.municipalities.length, 645);
  for (const m of geo.municipalities) {
    assert.ok(m.box.every(Number.isFinite));
    assert.ok(geo.states[m.uf]);
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

test('every map colour step stands out from the page background in both themes', () => {
  const page = { dark: '#101216', light: '#f6f7f9' };
  for (const theme of ['dark', 'light']) {
    for (const party of ['PL', 'PT', 'PSD', 'MDB', 'NOVO', 'UNIÃO', 'XYZ']) {
      for (const margin of [0, .06, .2, .5]) {
        const color = marginColor(partyColor(party), margin, theme);
        assert.match(color, /^#[0-9a-f]{6}$/);
        assert.ok(contrast(color, page[theme]) >= 1.6, `${party} ${margin} ${theme}: ${contrast(color, page[theme]).toFixed(2)}`);
      }
    }
    for (const ratio of [0, .3, .6, .9, 1]) assert.ok(contrast(completionColor(ratio, theme), page[theme]) >= 1.3);
  }
  assert.equal(mix(MAP_BASE.dark, '#ffffff', 0), MAP_BASE.dark);
});
