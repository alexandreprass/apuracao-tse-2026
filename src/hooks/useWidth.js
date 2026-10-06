import { useLayoutEffect, useRef, useState } from 'preact/hooks';

/** Tracks an element's content width; returns `[ref, width]`. */
export function useWidth(initial = 0) {
  const ref = useRef();
  const [width, setWidth] = useState(initial);

  useLayoutEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
