// A polled data feed: loads, keeps the last good value, schedules the next check and tells its
// subscribers what changed. Pure JavaScript (no DOM, no Preact), so the polling rules are tested in Node.
import { POLL_ELECTION_DAY_MS, POLL_LIVE_MS, POLL_WAITING_MS, ROUNDS } from '../config.js';
import { modeFor, signature } from './source.js';

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
 * - Not published yet: every minute from an hour before the polls close, every 5 minutes before that.
 * - Finished count from a good source: stop.
 */
export function pollDelay(data, round, now = Date.now()) {
  if (!data) return null;
  if (data.status === 'error') return POLL_LIVE_MS;
  if (data.status === 'not-published') {
    const start = new Date(ROUNDS[round].closesAt).getTime();
    return now >= start - 3600_000 && now <= start + 86400_000 ? POLL_ELECTION_DAY_MS : POLL_WAITING_MS;
  }
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

const feeds = new Map();
/** One shared feed per key, so two components showing the same data make one request. */
export function getFeed(key, create) {
  if (!feeds.has(key)) feeds.set(key, create());
  return feeds.get(key);
}
export const clearFeeds = () => { for (const feed of feeds.values()) feed.stop(); feeds.clear(); };
