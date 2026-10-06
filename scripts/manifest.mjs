#!/usr/bin/env node
// Writes public/data/manifest.json: which rounds and offices the shipped copy has, read from the files
// actually on disk. The site re-reads it on every poll and only asks for a bundle file it lists, so a
// round that was not copied yet never costs a 404. Run by `npm run build` and by scripts/fetch-tse.mjs.
import { readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFICES } from '../src/config.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const exists = path => stat(path).then(() => true, () => false);

export async function buildManifest(dataDir = DATA) {
  const rounds = {};
  for (const round of ['1', '2']) {
    const dir = join(dataDir, 'tse', round);
    if (!(await exists(dir))) continue;
    const entries = new Set(await readdir(dir));
    const offices = Object.keys(OFFICES).filter(o => entries.has(`${o}.json`) || (OFFICES[o].proportional && entries.has(o)));
    if (!offices.length) continue;
    rounds[round] = { offices, municipal: Object.keys(OFFICES).filter(o => entries.has(`${o}-municipios`)) };
  }
  return { rounds }; // no timestamp: the file only changes when the copy does
}

export async function writeManifest(dataDir = DATA) {
  const manifest = await buildManifest(dataDir);
  await writeFile(join(dataDir, 'manifest.json'), JSON.stringify(manifest) + '\n');
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const m = await writeManifest();
  console.log(`manifest.json: ${Object.entries(m.rounds).map(([r, v]) => `${r}º turno (${v.offices.join(', ')})`).join(' · ') || 'nenhum turno copiado'}`);
}
