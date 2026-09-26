import { parseCharDeskText } from "@chardesk/protocol";
import type { GridCell } from "@/shared/types";

const DEFAULT_ANSI_TEXT_COLOR = "#ffffff";

type AnsiTextCell = GridCell & {
  x: number;
  y: number;
};

export const parseAnsiTextCells = (
  input: string,
  defaultColor = DEFAULT_ANSI_TEXT_COLOR
): AnsiTextCell[] | null => {
  if (!input) return null;
  const parsed = parseCharDeskText(input, {
    defaultStyle: { color: defaultColor },
  });
  if (!parsed.hasAnsi || parsed.cells.length === 0) return null;

  return parsed.cells.map((cell) => ({
    x: cell.x,
    y: cell.y,
    char: cell.text,
    color: cell.color ?? defaultColor,
    ...(cell.bgColor ? { bgColor: cell.bgColor } : {}),
    ...(cell.attrs ? { attrs: { ...cell.attrs } } : {}),
    ...(cell.href ? { href: cell.href } : {}),
  }));
};

export const parsePlainTextCells = (
  input: string,
  defaultColor = DEFAULT_ANSI_TEXT_COLOR
): AnsiTextCell[] => {
  if (!input) return [];
  const parsed = parseCharDeskText(input, {
    syntax: "plain",
    defaultStyle: { color: defaultColor },
  });
  return parsed.cells.map((cell) => ({
    x: cell.x,
    y: cell.y,
    char: cell.text,
    color: cell.color ?? defaultColor,
  }));
};
