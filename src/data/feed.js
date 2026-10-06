// A polled data feed: loads, keeps the last good value, schedules the next check and tells its
// subscribers what changed. Pure JavaScript (no DOM, no Preact), so the polling rules are tested in Node.
import { POLL_LIVE_MS, POLL_WAITING_MS, pollsClosed } from '../config.js';
import { boletimKey, loadMunicipality, modeFor, signature } from './source.js';
import { ufOfIbge } from './states.js';

export function isFinished(data) {
  if (!data || data.status) return false;
  if (data.br) return data.br.finished;
  if (data.result) return data.result.finished;
  const states = Object.values(data.uf || {});
  return states.length > 0 && states.every(s => s.finished);
}

/**
 * How long to wait before checking again, or null to stop.
 * - TSE unreachable (with or without data on screen) or some state stale: every 30 s, until it answers.
 * - Live count running: every 30 s.
 * - Not published yet: every 5 minutes until the polls close (17h in Brasília on the round's date,
 *   ROUNDS[round].closesAt), every 30 s from then on.
 * - Finished count from a good source: stop.
 */
export function pollDelay(data, round, now = Date.now()) {
  if (!data) return null;
  if (data.status === 'error') return POLL_LIVE_MS;
  if (data.status === 'not-published') return pollsClosed(round, now) ? POLL_LIVE_MS : POLL_WAITING_MS;
  if (data.liveError || data.staleUfs?.length) return POLL_LIVE_MS;
  if (isFinished(data)) return null;
  if (data.source === 'tse') return POLL_LIVE_MS;
  // A copy of a count still running: keep asking the TSE when this round reads it live.
  if (data.source === 'local' && modeFor(round) !== 'bundle-only' && modeFor(round) !== 'bundle-first') return POLL_LIVE_MS;
  return null;
}

const defaultTimers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) };
const pageHidden = () => typeof document !== 'undefined' && document.hidden;

/**
 * Events sent to subscribers:
 * - "data": a new boletim (or a new warning) — re-render the results;
 * - "check": same boletim, only the "verificado às" time moved;
 * - "loading": a request started or ended.
 */
export class Feed {
  constructor(load, { delay = () => null, sign = signature, timers = defaultTimers, hidden = pageHidden } = {}) {
    Object.assign(this, { load, delay, sign, timers, hidden });
    this.data = null;
    this.checkedAt = null;
    this.loading = false;
    this.listeners = new Set();
    this.timer = null;
    this.inflight = null;
    this.refresh = () => this.run();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.stop();
    };
  }

  emit(event) { for (const listener of [...this.listeners]) listener(event); }

  start() {
    if (this.inflight || this.timer) return;
    if (!this.data || this.delay(this.data) != null) this.run();
  }

  stop() {
    this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  schedule() {
    this.stop();
    if (!this.listeners.size) return;
    const ms = this.delay(this.data);
    if (ms == null) return;
    const tick = () => {
      this.timer = null;
      // A hidden tab waits; it catches up within 5 s of being shown again.
      if (this.hidden()) { this.timer = this.timers.setTimeout(tick, 5000); return; }
      this.run();
    };
    this.timer = this.timers.setTimeout(tick, ms);
  }

  run() {
    if (this.inflight) return this.inflight;
    this.stop();
    this.loading = true;
    this.emit('loading');
    this.inflight = (async () => {
      let next;
      try { next = await this.load(this.data); }
      catch (error) { next = this.data && !this.data.status
        ? { ...this.data, stale: true, liveError: error?.message || 'Erro ao ler os dados.', checkedAt: new Date() }
        : { status: 'error', message: error?.message || 'Erro ao ler os dados.', checkedAt: new Date() }; }
      this.checkedAt = next?.checkedAt || new Date();
      this.loading = false;
      this.inflight = null;
      if (this.sign(next) !== this.sign(this.data)) {
        this.data = next;
        this.emit('data');
      } else {
        this.emit('check');
      }
      this.emit('loading');
      this.schedule();
      return this.data;
    })();
    return this.inflight;
  }
}

/**
 * Makes `child` follow the boletim of `parent`: whenever the parent publishes new data whose
 * `keyOf` differs from the one the child last loaded (`child.data.boletim`), the child reloads.
 * Returns the unsubscribe function.
 */
export function followFeed(child, parent, keyOf) {
  let alive = true;
  const check = () => {
    if (!alive) return;
    // A load already under way may have used the previous key: look again when it ends.
    if (child.inflight) { child.inflight.then(check); return; }
    const key = keyOf(parent.data);
    if (key != null && child.data && child.data.boletim !== key) child.run();
  };
  const off = parent.subscribe(event => { if (event === 'data') check(); });
  check();
  return () => { alive = false; off(); };
}

/**
 * One municipality read live from the TSE. It does not poll the TSE on its own: it reloads when the
 * boletim of its office changes (the office feed polls only the national file), and retries every
 * 30 s after a failure. Use with followFeed(feed, officeFeed, feed.keyOf).
 */
export function municipalityFeed(round, office, ibge, parent, options = {}) {
  const keyOf = data => boletimKey(data, ufOfIbge(ibge));
  const feed = new Feed(previous => loadMunicipality(round, office, ibge, previous, new Date(), keyOf(parent.data)), {
    delay: data => (data && (data.liveError || data.status === 'error') ? POLL_LIVE_MS : null),
    ...options,
  });
  feed.keyOf = keyOf;
  return feed;
}

const feeds = new Map();
/** One shared feed per key, so two components showing the same data make one request. */
export function getFeed(key, create) {
  if (!feeds.has(key)) feeds.set(key, create());
  return feeds.get(key);
}
export const clearFeeds = () => { for (const feed of feeds.values()) feed.stop(); feeds.clear(); };
