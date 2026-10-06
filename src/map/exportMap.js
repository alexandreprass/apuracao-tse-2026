import { MAP_THEMES } from './mapTheme.js';

/** Flattens the map canvas and its HTML state labels into a PNG download. */
export function exportMap({ frame, theme, filename }) {
  const canvas = frame?.querySelector('canvas');
  if (!canvas) return;

  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = MAP_THEMES[theme].background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);

  const canvasBounds = canvas.getBoundingClientRect();
  const scale = out.width / canvasBounds.width;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const label of frame.querySelectorAll('.state-labels button')) {
    const bounds = label.getBoundingClientRect(), style = getComputedStyle(label);
    const x = (bounds.left - canvasBounds.left) * scale, y = (bounds.top - canvasBounds.top) * scale;
    const width = bounds.width * scale, height = bounds.height * scale;
    if (label.classList.contains('state-callout')) {
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(x, y, width, height);
    }
    ctx.fillStyle = style.color;
    ctx.font = `${style.fontWeight} ${parseFloat(style.fontSize) * scale}px Geist, sans-serif`;
    const text = [...label.children].map(part => part.textContent).join(' ') || label.textContent;
    ctx.fillText(text, x + width / 2, y + height / 2);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = MAP_THEMES[theme].focus;
  ctx.font = `500 ${Math.max(12, out.width / 45)}px Geist, sans-serif`;
  ctx.fillText('DADOS SIMULADOS', 16, out.height - 16);

  out.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
