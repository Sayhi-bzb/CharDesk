export function normalizeContentRgb(color: string): string | null {
  if (/^#[\da-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(color))
    return (
      '#' +
      [...color.slice(1)]
        .map((byte) => byte + byte)
        .join('')
        .toLowerCase()
    );
  const rgb =
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*1(?:\.0+)?)?\s*\)$/i.exec(color);
  if (!rgb) return null;
  const bytes = rgb.slice(1, 4).map(Number);
  return bytes.every((byte) => byte >= 0 && byte <= 255)
    ? '#' + bytes.map((byte) => Math.round(byte).toString(16).padStart(2, '0')).join('')
    : null;
}
const luminance = (color: string) => {
  const rgb = [1, 3, 5].map((at) => {
    const value = Number.parseInt(color.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
};
export const contentColorContrast = (a: string, b: string) => {
  const left = luminance(a),
    right = luminance(b);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
};
/** Derive neutral ink from a Host palette, preserving a minimum contrast against its background. */
export function deriveContentNeutral(
  palette: Readonly<{ foreground: string; background: string }>,
  weight: number,
  minimumContrast: number
) {
  const mix = (amount: number) =>
    '#' +
    [1, 3, 5]
      .map((at) => {
        const fg = Number.parseInt(palette.foreground.slice(at, at + 2), 16);
        const bg = Number.parseInt(palette.background.slice(at, at + 2), 16);
        return Math.round(bg + (fg - bg) * amount)
          .toString(16)
          .padStart(2, '0');
      })
      .join('');
  for (let amount = weight; amount < 1; amount += 0.05) {
    const color = mix(amount);
    if (contentColorContrast(color, palette.background) >= minimumContrast) return color;
  }
  return palette.foreground;
}
