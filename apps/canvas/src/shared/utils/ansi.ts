import type { GridCell, TextAttributes } from "@/shared/types";
import { BACKGROUND_COLOR } from "@/shared/lib/constants";

export type AnsiStyleState = {
  color: string;
  bgColor?: string;
  attrs?: TextAttributes;
  href?: string;
};

const DEFAULT_BACKGROUND = BACKGROUND_COLOR;
const BASIC_COLORS = [
  "#000000",
  "#800000",
  "#008000",
  "#808000",
  "#000080",
  "#800080",
  "#008080",
  "#c0c0c0",
] as const;
const BRIGHT_COLORS = [
  "#808080",
  "#ff0000",
  "#00ff00",
  "#ffff00",
  "#0000ff",
  "#ff00ff",
  "#00ffff",
  "#ffffff",
] as const;

const normalizeAnsiHexColor = (color: string) => {
  const parsed = parseAnsiHexColor(color);
  if (!parsed) return null;
  return `#${toHexByte(parsed.red)}${toHexByte(parsed.green)}${toHexByte(
    parsed.blue
  )}`;
};

const normalizeTextAttributes = (
  attrs?: Partial<TextAttributes> | null
): TextAttributes | undefined => {
  if (!attrs) return undefined;
  const next: TextAttributes = {};
  if (attrs.bold) next.bold = true;
  if (attrs.italic) next.italic = true;
  if (attrs.underline) next.underline = true;
  if (attrs.strike) next.strike = true;
  if (attrs.inverse) next.inverse = true;
  return Object.keys(next).length > 0 ? next : undefined;
};

export const cloneTextAttributes = (attrs?: TextAttributes) =>
  normalizeTextAttributes(attrs);

export const normalizeCellStyle = <T extends { color: string }>(
  cell: T
): T & Pick<GridCell, "bgColor" | "attrs"> => {
  const source = cell as T & {
    bgColor?: unknown;
    attrs?: Partial<TextAttributes>;
  };
  const attrs = normalizeTextAttributes(source.attrs);
  return {
    ...cell,
    ...(typeof source.bgColor === "string" ? { bgColor: source.bgColor } : {}),
    ...(attrs ? { attrs } : {}),
  };
};

export const normalizeCellHref = (href?: unknown) => {
  return typeof href === "string" && href.length > 0 ? href : undefined;
};

export const isSameTextAttributes = (
  a?: TextAttributes,
  b?: TextAttributes
) => {
  const left = normalizeTextAttributes(a);
  const right = normalizeTextAttributes(b);
  return (
    !!left === !!right &&
    left?.bold === right?.bold &&
    left?.italic === right?.italic &&
    left?.underline === right?.underline &&
    left?.strike === right?.strike &&
    left?.inverse === right?.inverse
  );
};

export const effectiveCellStyle = (cell: GridCell) => {
  if (!cell.attrs?.inverse) {
    return {
      color: cell.color,
      bgColor: cell.bgColor,
      attrs: cell.attrs,
    };
  }
  return {
    color: cell.bgColor ?? DEFAULT_BACKGROUND,
    bgColor: cell.color,
    attrs: cell.attrs,
  };
};

const toHexByte = (value: number) => {
  return Math.max(0, Math.min(255, value))
    .toString(16)
    .padStart(2, "0");
};

export const parseAnsiHexColor = (value: string) => {
  const shortHex = /^#([\da-f]{3})$/i.exec(value);
  if (shortHex) {
    const [red, green, blue] = shortHex[1].split("");
    return {
      red: Number.parseInt(`${red}${red}`, 16),
      green: Number.parseInt(`${green}${green}`, 16),
      blue: Number.parseInt(`${blue}${blue}`, 16),
    };
  }

  const fullHex = /^#([\da-f]{6})$/i.exec(value);
  if (fullHex) {
    return {
      red: Number.parseInt(fullHex[1].slice(0, 2), 16),
      green: Number.parseInt(fullHex[1].slice(2, 4), 16),
      blue: Number.parseInt(fullHex[1].slice(4, 6), 16),
    };
  }

  return null;
};

const toAnsiTruecolor = (prefix: 38 | 48, color: string) => {
  const parsed = parseAnsiHexColor(color);
  if (!parsed) return null;
  return `${prefix};2;${parsed.red};${parsed.green};${parsed.blue}`;
};

const toAnsi16Color = (prefix: 38 | 48, color: string) => {
  const normalized = normalizeAnsiHexColor(color);
  if (!normalized) return null;

  const basicIndex = BASIC_COLORS.indexOf(
    normalized as (typeof BASIC_COLORS)[number]
  );
  if (basicIndex >= 0) {
    return String((prefix === 38 ? 30 : 40) + basicIndex);
  }

  const brightIndex = BRIGHT_COLORS.indexOf(
    normalized as (typeof BRIGHT_COLORS)[number]
  );
  if (brightIndex >= 0) {
    return String((prefix === 38 ? 90 : 100) + brightIndex);
  }

  return null;
};

const colorFrom256 = (index: number) => {
  const clamped = Math.max(0, Math.min(255, index));
  if (clamped < 8) return BASIC_COLORS[clamped];
  if (clamped < 16) return BRIGHT_COLORS[clamped - 8];
  if (clamped >= 232) {
    const value = 8 + (clamped - 232) * 10;
    return `#${toHexByte(value)}${toHexByte(value)}${toHexByte(value)}`;
  }
  const cube = clamped - 16;
  const red = Math.floor(cube / 36);
  const green = Math.floor((cube % 36) / 6);
  const blue = cube % 6;
  const component = (value: number) => (value === 0 ? 0 : 55 + value * 40);
  return `#${toHexByte(component(red))}${toHexByte(component(green))}${toHexByte(
    component(blue)
  )}`;
};

const ANSI_256_INDEX_BY_COLOR = new Map<string, number>();
for (let index = 0; index < 256; index += 1) {
  const color = colorFrom256(index);
  const current = ANSI_256_INDEX_BY_COLOR.get(color);
  if (current === undefined || String(index).length < String(current).length) {
    ANSI_256_INDEX_BY_COLOR.set(color, index);
  }
}

const toAnsi256Color = (prefix: 38 | 48, color: string) => {
  const normalized = normalizeAnsiHexColor(color);
  if (!normalized) return null;
  const index = ANSI_256_INDEX_BY_COLOR.get(normalized);
  return index === undefined ? null : `${prefix};5;${index}`;
};

export const toShortestAnsiColor = (prefix: 38 | 48, color: string) => {
  const candidates = [
    toAnsi16Color(prefix, color),
    toAnsi256Color(prefix, color),
    toAnsiTruecolor(prefix, color),
  ].filter((candidate): candidate is string => !!candidate);

  return candidates.reduce<string | null>((shortest, candidate) => {
    return !shortest || candidate.length < shortest.length ? candidate : shortest;
  }, null);
};

export const styleStateToCell = (
  char: string,
  style: AnsiStyleState
): GridCell => ({
  char,
  color: style.color,
  ...(style.bgColor ? { bgColor: style.bgColor } : {}),
  ...(style.attrs ? { attrs: { ...style.attrs } } : {}),
  ...(style.href ? { href: style.href } : {}),
});
