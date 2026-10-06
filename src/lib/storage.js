// localStorage that never throws (private mode, full quota, blocked storage).
export const storage = {
  get(key, fallback = null) {
    try { const raw = globalThis.localStorage?.getItem(key); return raw == null ? fallback : JSON.parse(raw); }
    catch { return fallback; }
  },
  set(key, value) {
    try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  remove(key) { try { globalThis.localStorage?.removeItem(key); } catch { /* ignore */ } },
};
