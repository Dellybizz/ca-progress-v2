export const refinementR2ColorPairs = Object.freeze([
  ["light body", "#172033", "#f6f7fa", 4.5], ["light secondary", "#59647a", "#ffffff", 4.5],
  ["light primary", "#ffffff", "#5b5bd6", 4.5], ["dark body", "#f4f5f7", "#101219", 4.5],
  ["dark secondary", "#b4b8c3", "#191c25", 4.5], ["dark primary", "#101219", "#8b8cf1", 4.5],
  ["light focus", "#7070e8", "#ffffff", 3], ["dark focus", "#a3a4fa", "#191c25", 3],
]);
const channel = value => { const normalized = value / 255; return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4; };
export const contrastRatio = (foreground, background) => {
  const luminance = hex => { const value = hex.replace("#", ""); const [red, green, blue] = [0, 2, 4].map(index => channel(Number.parseInt(value.slice(index, index + 2), 16))); return 0.2126 * red + 0.7152 * green + 0.0722 * blue; };
  const first = luminance(foreground); const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

