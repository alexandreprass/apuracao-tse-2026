import { useEffect, useRef } from 'preact/hooks';

const isTyping = target => ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;

/** Calls `handler` when `key` is pressed anywhere on the page, unless `enabled` is false. */
export function useHotkey(key, handler, { enabled = true, whileTyping = false } = {}) {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = event => {
      if (event.key !== key || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!whileTyping && isTyping(event.target)) return;
      latest.current(event);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [key, enabled, whileTyping]);
}
