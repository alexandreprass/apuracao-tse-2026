import { useLayoutEffect, useState } from 'preact/hooks';

const STORAGE_KEY = 'apuracao:tema';

function storedTheme() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

// index.html applies the same rule before first paint to avoid a flash.
function initialTheme() {
  const stored = storedTheme();
  if (stored === 'light' || stored === 'dark') return stored;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);

  // Layout effect: the page tokens must flip in the same frame as the map canvas.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
  }, [theme]);

  const toggle = () => setTheme(current => {
    const next = current === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage unavailable: keep in memory */ }
    return next;
  });

  return [theme, toggle];
}
