import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { splitMesh } from '../scripts/geo-split.mjs';
import { addMunicipalities, addPlaces, createGeography, createStateGeography } from '../src/map/geography.js';

// Item 10 (PR #2): the first visit ships only the states mesh; each state's municipalities come when it is opened.
globalThis.Path2D = class { moveTo() {} lineTo() {} closePath() {} addPath() {} };
const atlas = JSON.parse(readFileSync(new URL('../geo/brasil.topo.json', import.meta.url), 'utf8'));
const full = createGeography(atlas, { m: {} });
const { statesFile, perUf, names } = await splitMesh(atlas);
const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < .01);

test('the states mesh is a small fraction of the full mesh and frames Brazil the same way', () => {
  const size = JSON.stringify(statesFile).length;
  assert.ok(size < JSON.stringify(atlas).length / 8, `estados.json has ${size} bytes`);
  const geo = createStateGeography(statesFile);
  assert.equal(Object.keys(geo.states).length, 27);
  assert.equal(geo.municipalities.length, 0, 'no municipality on the first visit');
  assert.ok(close(geo.box, full.box));
  for (const uf of Object.keys(full.states)) {
    assert.ok(close(geo.states[uf].box, full.states[uf].box), uf);
    assert.ok(close(geo.states[uf].center, full.states[uf].center), uf);
  }
});

test('opening a state adds only its municipalities, aligned with the full mesh', () => {
  let geo = createStateGeography(statesFile);
  geo = addMunicipalities(geo, 'RJ', JSON.parse(JSON.stringify(perUf.RJ)));
  assert.equal(geo.states.RJ.municipalities.length, full.states.RJ.municipalities.length);
  assert.equal(geo.municipalities.length, geo.states.RJ.municipalities.length);
  assert.ok(geo.states.RJ.loaded && !geo.states.SP.loaded);
  const rio = geo.byId.get('3304557'), rioFull = full.byId.get('3304557');
  assert.equal(rio.name, 'Rio de Janeiro');
  assert.ok(close(rio.box, rioFull.box) && close(rio.center, rioFull.center));
  const total = Object.values(perUf).reduce((n, t) => n + t.objects.municipios.geometries.length, 0);
  assert.equal(total, 5571);
  geo = addPlaces(geo, names);
  assert.equal(geo.places.length, 5571);
  assert.equal(geo.byId.get('3304557').path !== undefined, true, 'a meshed municipality keeps its shape');
  assert.equal(geo.byId.get('3550308').name, 'São Paulo');
});

test('the app never fetches the full mesh; the first load asks only for the states file', () => {
  const src = readFileSync(new URL('../src/map/useGeography.js', import.meta.url), 'utf8');
  assert.match(src, /data\/geo\/estados\.json/);
  assert.match(src, /data\/geo\/mun\/\$\{uf\}\.json/);
  assert.doesNotMatch(src, /brasil\.topo/);
  const app = readFileSync(new URL('../src/App.js', import.meta.url), 'utf8');
  assert.match(app, /useGeography\(needsMap, \{ uf: route\.uf/);
});
