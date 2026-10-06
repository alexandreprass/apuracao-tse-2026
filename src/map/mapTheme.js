// Canvas colours per theme. `background` mirrors --bg in styles/tokens.css:
// state borders are drawn in it so they read as gaps between the shapes.
export const MAP_THEMES = {
  dark: {
    background: '#101216',
    municipalityBorder: 'rgba(16,18,22,.32)',
    coast: 'rgba(255,255,255,.12)',
    stateOutline: 'rgba(255,255,255,.62)',
    focus: '#f7f8fa',
    focusGlow: 'rgba(255,255,255,.42)',
    hover: 'rgba(255,255,255,.85)',
    calloutLine: 'rgba(255,255,255,.32)',
  },
  light: {
    background: '#f6f7f9',
    municipalityBorder: 'rgba(246,247,249,.5)',
    coast: 'rgba(20,24,33,.16)',
    stateOutline: 'rgba(20,24,33,.6)',
    focus: '#141821',
    focusGlow: 'rgba(20,24,33,.3)',
    hover: 'rgba(20,24,33,.85)',
    calloutLine: 'rgba(20,24,33,.34)',
  },
};

const INK_ON_LIGHT = '#141821';
const INK_ON_DARK = '#ffffff';

/** Text colour that stays legible on top of a `#rrggbb` map fill. */
export function inkOn(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const luminance = .2126 * r + .7152 * g + .0722 * b;
  return luminance > .3 ? INK_ON_LIGHT : INK_ON_DARK;
}
