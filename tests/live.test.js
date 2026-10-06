// Live read of the TSE: what happens when it fails, recovers, repeats itself or loses a state.
// fetch is replaced by a fake TSE; timers are driven by hand.
import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { Feed, pollDelay } from '../src/data/feed.js';
import { cached, getJson, loadOffice, setFetchTimeout, signature, Unavailable } from '../src/data/source.js';
import { announcement, statusInfo } from '../src/data/status.js';
import { stateRows } from '../src/data/analysis.js';
import { UFS } from '../src/data/states.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/br-c0001-e006257-u.json', import.meta.url), 'utf8'));

/** A TSE results file for one place of the 2º turno, mid-count, generated at `gen`. */
function rawFile(place, gen) {
  const raw = structuredClone(fixture);
  Object.assign(raw, { ele: '6258', t: '2', cdabr: place, tpabr: place === 'br' ? 'br' : 'uf', tf: 'n', dg: '25/10/2026', hg: gen, dt: '25/10/2026', ht: gen });
  raw.s.st = '250000';
  raw.carg[0].agr = raw.carg[0].agr.filter(a => a.par.some(p => ['22', '13'].includes(p.n)));
  return raw;
}

/**
 * Fake TSE. `mode`: "up", "down" (network error), "refuse" (403) or "hang" (never answers until aborted).
 * `failing`: places that throw. `copy`: shipped copy of the 2º turno (published by the workflow), or null.
 */
const tse = { mode: 'up', gen: '19:30:00', failing: new Set(), requests: [], copy: null };
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const fakeFetch = async (url, options = {}) => {
  url = String(url);
  tse.requests.push(url);
  if (!url.startsWith('https://')) return tse.copy ? response(200, tse.copy) : response(404, null);
  if (tse.mode === 'hang') {
    return new Promise((_, reject) => options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  }
  const place = /dados\/\w+\/(\w+)-c0001/.exec(url)?.[1];
  if (tse.mode === 'down' || tse.failing.has(place)) throw new TypeError('Failed to fetch');
  if (tse.mode === 'refuse') return response(403, null);
  if (!place) return response(404, null);
  return response(200, rawFile(place, tse.gen));
};
globalThis.fetch = fakeFetch;

/** Timers driven by the test: `fire()` runs the next scheduled callback. */
function fakeTimers() {
  const pending = new Map();
  let id = 0;
  return {
    pending,
    setTimeout(fn, ms) { pending.set(++id, { fn, ms }); return id; },
    clearTimeout(i) { pending.delete(i); },
    next() { return [...pending.values()].at(-1); },
    fire() { const [i, t] = [...pending.entries()].at(-1); pending.delete(i); t.fn(); },
  };
}

function presidentFeed(timers) {
  return new Feed(previous => loadOffice(2, 'presidente', previous), { delay: data => pollDelay(data, 2), timers, hidden: () => false });
}

beforeEach(() => { Object.assign(tse, { mode: 'up', gen: '19:30:00', requests: [], copy: null }); tse.failing.clear(); globalThis.fetch = fakeFetch; setFetchTimeout(10_000); });

test('network errors are "unavailable", missing files are "not published"', async () => {
  tse.mode = 'down';
  await assert.rejects(getJson('https://resultados.tse.jus.br/x.json'), Unavailable);
  tse.mode = 'up';
  assert.equal(await getJson('https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/nada.json'), null);
});

test('caso 1: TSE failing then recovering keeps polling every 30 s', async () => {
  const timers = fakeTimers();
  const feed = presidentFeed(timers);
  tse.mode = 'down';
  feed.subscribe(() => {});
  await feed.inflight;
  assert.equal(feed.data.status, 'error', 'nothing to show yet, but it is an error, not "not published"');
  assert.equal(timers.next().ms, 30000, 'keeps trying');
  tse.mode = 'up';
  timers.fire();
  await feed.inflight;
  assert.equal(feed.data.source, 'tse');
  assert.equal(feed.data.br.candidates[0].votes, 56104503);
  assert.equal(timers.next().ms, 30000, 'live count: keeps polling');
  // Fails again later: still polling, never stops.
  tse.mode = 'down';
  timers.fire();
  await feed.inflight;
  assert.ok(feed.data.stale);
  assert.equal(timers.next().ms, 30000);
  tse.mode = 'up'; tse.gen = '19:31:00';
  timers.fire();
  await feed.inflight;
  assert.equal(feed.data.stale, undefined);
  assert.equal(feed.data.liveError, undefined);
  assert.equal(timers.pending.size, 1);
});

test('caso 2: a network/CORS error or a refusal keeps the last good data and shows the warning', async () => {
  const timers = fakeTimers();
  const feed = presidentFeed(timers);
  feed.subscribe(() => {});
  await feed.inflight;
  const good = feed.data;
  assert.equal(statusInfo(good, { round: 2 }).kind, 'live');
  for (const mode of ['down', 'refuse']) {
    tse.mode = mode;
    timers.fire();
    await feed.inflight;
    const data = feed.data;
    assert.notEqual(data.status, 'not-published', `${mode}: never back to the countdown`);
    assert.deepEqual(data.br, good.br, `${mode}: results kept`);
    assert.equal(Object.keys(data.uf).length, 27);
    assert.ok(data.stale && data.liveError);
    const info = statusInfo(data, { round: 2, now: new Date('2026-10-25T20:00:00-03:00') });
    assert.equal(info.kind, 'stale');
    assert.match(info.state, /^TSE indisponível · mostrando o boletim das \d\d:\d\d$/);
    assert.match(info.retry, /a cada 30 s/);
    assert.equal(pollDelay(data, 2), 30000);
  }
  // The screen reader hears the change of state, not each poll.
  assert.match(announcement(statusInfo(good, { round: 2 }), statusInfo(feed.data, { round: 2 })), /TSE está indisponível/);
  assert.equal(announcement(statusInfo(feed.data, { round: 2 }), statusInfo(feed.data, { round: 2 })), null);
  tse.mode = 'up'; tse.gen = '19:40:00';
  timers.fire();
  await feed.inflight;
  assert.match(announcement({ kind: 'stale' }, statusInfo(feed.data, { round: 2 })), /restabelecida/);
});

test('caso 3: an unchanged boletim does not re-render; only "verificado às" moves', async () => {
  const timers = fakeTimers();
  const feed = presidentFeed(timers);
  const events = [];
  feed.subscribe(event => { if (event !== 'loading') events.push(event); });
  await feed.inflight;
  const first = feed.data, firstChecked = feed.checkedAt;
  await new Promise(r => setTimeout(r, 5));
  timers.fire();
  await feed.inflight;
  assert.deepEqual(events, ['data', 'check']);
  assert.equal(feed.data, first, 'same object: memoized map and tables are not recomputed');
  assert.ok(feed.checkedAt > firstChecked);
  assert.equal(signature(first), signature(await loadOffice(2, 'presidente', first)));
  tse.gen = '19:35:00';
  timers.fire();
  await feed.inflight;
  assert.deepEqual(events, ['data', 'check', 'data']);
  assert.notEqual(feed.data, first);
});

test('caso 4: a state that fails keeps its last good result and is flagged', async () => {
  const timers = fakeTimers();
  const feed = presidentFeed(timers);
  feed.subscribe(() => {});
  await feed.inflight;
  const before = feed.data;
  tse.failing.add('sp');
  tse.gen = '19:45:00';
  timers.fire();
  await feed.inflight;
  const data = feed.data;
  assert.equal(Object.keys(data.uf).length, 27, 'no state disappears from the map');
  assert.equal(data.uf.SP, before.uf.SP, 'SP keeps the last good result');
  assert.notEqual(data.uf.RJ, before.uf.RJ, 'the others are fresh');
  assert.deepEqual(data.staleUfs, ['SP']);
  assert.equal(stateRows(data).SP.stale, true);
  assert.equal(stateRows(data).RJ.stale, undefined);
  const info = statusInfo(data, { round: 2 });
  assert.equal(info.kind, 'partial');
  assert.equal(info.partial.text, '1 estado com boletim atrasado');
  assert.equal(pollDelay(data, 2), 30000);
  tse.failing.clear();
  timers.fire();
  await feed.inflight;
  assert.equal(feed.data.staleUfs, undefined);
});

test('the national file is asked for directly, without waiting for ele-c.json', async () => {
  const data = await loadOffice(2, 'presidente');
  assert.equal(data.source, 'tse');
  assert.ok(!tse.requests.some(u => u.includes('ele-c.json')));
  assert.ok(tse.requests.some(u => u.endsWith('/br/br-c0001-e006258-u.json')));
  assert.equal(tse.requests.filter(u => u.startsWith('https://')).length, 2 + UFS.length);
});

test('while the boletim does not change, each cycle asks only for the national file', async () => {
  const first = await loadOffice(2, 'presidente');
  tse.requests = [];
  const again = await loadOffice(2, 'presidente', first);
  assert.deepEqual(tse.requests.filter(u => u.startsWith('https://')), ['https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json']);
  assert.equal(signature(again), signature(first));
  tse.gen = '19:50:00';
  tse.requests = [];
  await loadOffice(2, 'presidente', again);
  assert.equal(tse.requests.filter(u => u.startsWith('https://')).length, 29, 'new boletim: states and abroad again');
});

test('timeout: a request that hangs is abandoned and the polling goes on', async () => {
  setFetchTimeout(30);
  const timers = fakeTimers();
  const feed = presidentFeed(timers);
  feed.subscribe(() => {});
  await feed.inflight;
  const good = feed.data;
  tse.mode = 'hang';
  timers.fire();
  const started = Date.now();
  await feed.inflight;
  assert.ok(Date.now() - started < 2000, 'gave up quickly');
  assert.equal(feed.loading, false, 'not stuck in "Atualizando…"');
  assert.ok(feed.data.stale);
  assert.match(feed.data.liveError, /demorou/);
  assert.deepEqual(feed.data.br, good.br);
  assert.equal(timers.next().ms, 30000, 'next check scheduled');
  tse.mode = 'up'; tse.gen = '19:55:00';
  timers.fire();
  await feed.inflight;
  assert.equal(feed.data.stale, undefined);
});

test('with a shipped copy of the 2º turno, one TSE failure neither stops the polling nor hides the warning', async () => {
  // The workflow copy: same files, an earlier boletim.
  const copy = await loadOffice(2, 'presidente');
  tse.copy = { ...copy, br: { ...copy.br, updated: '25/10/2026 19:00:00' }, fetchedAt: '2026-10-25T22:00:00Z' };
  delete tse.copy.source;
  const timers = fakeTimers();
  const feed = presidentFeed(timers);
  feed.subscribe(() => {});
  await feed.inflight;
  assert.equal(feed.data.source, 'tse');
  tse.mode = 'down';
  timers.fire();
  await feed.inflight;
  assert.equal(feed.data.source, 'tse', 'the last live boletim is newer than the copy, so it stays');
  assert.equal(statusInfo(feed.data, { round: 2 }).kind, 'stale');
  assert.equal(timers.next().ms, 30000);
  // A fresh visitor while the TSE is down: the copy, flagged.
  const fresh = await loadOffice(2, 'presidente');
  assert.equal(fresh.source, 'local');
  assert.ok(fresh.liveError);
  assert.equal(pollDelay(fresh, 2), 30000);
  assert.match(statusInfo(fresh, { round: 2 }).source, /cópia/);
});

test('before the round is published: "not published", polled every minute on election day', async () => {
  globalThis.fetch = (orig => async url => (String(url).startsWith('https://') ? response(404, null) : orig(url)))(globalThis.fetch);
  const data = await loadOffice(2, 'presidente');
  assert.equal(data.status, 'not-published');
  assert.equal(pollDelay(data, 2, new Date('2026-10-25T16:30:00-03:00').getTime()), 60000);
  assert.equal(pollDelay(data, 2, new Date('2026-10-10T12:00:00-03:00').getTime()), 300000);
});

test('static caches expire and keep the old value when a refresh fails', async () => {
  const store = new Map();
  let calls = 0;
  const load = () => { calls++; return Promise.resolve(calls === 2 ? null : { n: calls }); };
  assert.deepEqual(await cached(store, 'k', load, 0), { n: 1 });
  assert.deepEqual(await cached(store, 'k', load, 1000), { n: 1 });
  assert.equal(calls, 1);
  assert.deepEqual(await cached(store, 'k', load, 11 * 60_000), { n: 1 }, 'failed refresh keeps the good value');
  assert.equal(calls, 2);
  assert.deepEqual(await cached(store, 'k', load, 30 * 60_000), { n: 3 });
});
