import { COLOR_PRIMARY_TEXT, EXPORT_PADDING } from "@/shared/lib/constants";
import { getCellOccupancy } from "@/shared/metrics";
import type { GridCell, GridCellSource, SelectionArea } from "@/shared/types";
import {
  cloneTextAttributes,
  isSameTextAttributes,
  parseAnsiHexColor,
  toShortestAnsiColor,
} from "@/shared/utils/ansi";
import { GridManager } from "@/shared/utils/grid";
import { getSelectionsBoundingBox } from "@/shared/utils/selection";

const ANSI_RESET = "\u001b[m";
const ANSI_DEFAULT_FOREGROUND_COLORS = new Set([
  "#000000",
  COLOR_PRIMARY_TEXT.toLowerCase(),
  "#0f172a",
]);
const isAnsiDefaultForeground = (color: string) => {
  const parsedColor = parseAnsiHexColor(color);
  return (
    ANSI_DEFAULT_FOREGROUND_COLORS.has(color.toLowerCase()) ||
    (parsedColor?.red === 0 && parsedColor.green === 0 && parsedColor.blue === 0)
  );
};

type AnsiPiece = {
  char: string;
  cell: GridCell | null;
};

type AnsiExportOptions = { includeColor?: boolean };

type ActiveAnsiStyle = {
  foreground: string | null;
  background: string | null;
  attrs?: GridCell["attrs"];
};

type ActiveAnsiState = ActiveAnsiStyle & {
  href?: string;
};

const DEFAULT_ANSI_STYLE: ActiveAnsiStyle = {
  foreground: null,
  background: null,
};

const buildAnsiPiecesFromBounds = (
  grid: GridCellSource,
  minX: number,
  maxX: number,
  y: number,
  options?: AnsiExportOptions
) => {
  const pieces: AnsiPiece[] = [];

  for (let x = minX; x <= maxX; x++) {
    const cell = grid.get({ x, y });
    if (cell) {
      pieces.push({
        char: cell.char,
        cell: options?.includeColor === false ? null : cell,
      });
      if (getCellOccupancy(cell.char) === 2) x++;
      continue;
    }
    pieces.push({ char: " ", cell: null });
  }

  return pieces;
};

const serializeAnsiRows = (
  grid: GridCellSource,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  options?: AnsiExportOptions
) => {
  const lines: string[] = [];
  for (let y = minY; y <= maxY; y++) {
    const pieces = trimTrailingAnsiSpaces(
      buildAnsiPiecesFromBounds(grid, minX, maxX, y, options)
    );
    lines.push(serializeAnsiLine(pieces));
  }
  return lines.join("\n");
};

const resolveAnsiPieceStyle = (piece: AnsiPiece): ActiveAnsiState => {
  if (!piece.cell) return DEFAULT_ANSI_STYLE;
  const style = piece.cell;
  const foregroundColor =
    parseAnsiHexColor(style.color) && !isAnsiDefaultForeground(style.color)
      ? style.color
      : null;
  const backgroundColor =
    style.bgColor && parseAnsiHexColor(style.bgColor) ? style.bgColor : null;
  return {
    foreground: foregroundColor
      ? toShortestAnsiColor(38, foregroundColor)
      : null,
    background: backgroundColor
      ? toShortestAnsiColor(48, backgroundColor)
      : null,
    attrs: style.attrs,
    ...(piece.cell.href ? { href: piece.cell.href } : {}),
  };
};

const isAnsiSignificantPiece = (piece: AnsiPiece) => {
  if (piece.char !== " ") return true;
  if (!piece.cell) return false;
  const style = resolveAnsiPieceStyle(piece);
  return (
    !!style.background ||
    !!style.href ||
    !!style.attrs?.underline ||
    !!style.attrs?.inverse ||
    !!style.attrs?.strike
  );
};

const trimTrailingAnsiSpaces = (pieces: AnsiPiece[]) => {
  let end = pieces.length;
  while (end > 0 && !isAnsiSignificantPiece(pieces[end - 1])) {
    end -= 1;
  }
  return pieces.slice(0, end);
};

const sameAnsiStyle = (a: ActiveAnsiStyle, b: ActiveAnsiStyle) => {
  return (
    a.foreground === b.foreground &&
    a.background === b.background &&
    isSameTextAttributes(a.attrs, b.attrs)
  );
};

const getAnsiStyleCodes = (style: ActiveAnsiStyle) => {
  const codes: string[] = [];
  if (style.attrs?.bold) codes.push("1");
  if (style.attrs?.italic) codes.push("3");
  if (style.attrs?.underline) codes.push("4");
  if (style.attrs?.inverse) codes.push("7");
  if (style.attrs?.strike) codes.push("9");
  if (style.foreground) codes.push(style.foreground);
  if (style.background) codes.push(style.background);
  return codes;
};

const toAnsiSequence = (codes: string[]) =>
  codes.length > 0 ? `\u001b[${codes.join(";")}m` : "";

const getAnsiStyleDiffCodes = (
  previous: ActiveAnsiStyle,
  next: ActiveAnsiStyle
) => {
  const codes: string[] = [];
  if (previous.attrs?.bold && !next.attrs?.bold) codes.push("22");
  if (previous.attrs?.italic && !next.attrs?.italic) codes.push("23");
  if (previous.attrs?.underline && !next.attrs?.underline) codes.push("24");
  if (previous.attrs?.inverse && !next.attrs?.inverse) codes.push("27");
  if (previous.attrs?.strike && !next.attrs?.strike) codes.push("29");
  if (!previous.attrs?.bold && next.attrs?.bold) codes.push("1");
  if (!previous.attrs?.italic && next.attrs?.italic) codes.push("3");
  if (!previous.attrs?.underline && next.attrs?.underline) codes.push("4");
  if (!previous.attrs?.inverse && next.attrs?.inverse) codes.push("7");
  if (!previous.attrs?.strike && next.attrs?.strike) codes.push("9");
  if (previous.foreground !== next.foreground) {
    codes.push(next.foreground ?? "39");
  }
  if (previous.background !== next.background) {
    codes.push(next.background ?? "49");
  }
  return codes;
};

const toAnsiStyleDiffSequence = (
  previous: ActiveAnsiStyle,
  next: ActiveAnsiStyle
) => {
  if (sameAnsiStyle(previous, next)) return "";

  const diffCodes = getAnsiStyleDiffCodes(previous, next);
  const resetCodes = ["0", ...getAnsiStyleCodes(next)];
  return toAnsiSequence(
    resetCodes.join(";").length < diffCodes.join(";").length
      ? resetCodes
      : diffCodes
  );
};

const toHyperlinkSequence = (href: string) => `]8;;${href}\\`;
const closeHyperlinkSequence = () => "]8;;\\";

const hasVisibleAnsiSpaceStyle = (style: ActiveAnsiState) => {
  return (
    !!style.background ||
    !!style.href ||
    !!style.attrs?.underline ||
    !!style.attrs?.inverse ||
    !!style.attrs?.strike
  );
};

const serializeAnsiLine = (pieces: AnsiPiece[]) => {
  if (pieces.length === 0) return "";

  let out = "";
  let activeStyle = DEFAULT_ANSI_STYLE;
  let activeHref: string | undefined;

  pieces.forEach((piece) => {
    const resolvedStyle = resolveAnsiPieceStyle(piece);
    const isFlexibleSpace =
      piece.char === " " && !hasVisibleAnsiSpaceStyle(resolvedStyle);
    const canCarryActiveStyle =
      !activeHref && !hasVisibleAnsiSpaceStyle(activeStyle);
    const nextStyle = isFlexibleSpace
      ? canCarryActiveStyle
        ? activeStyle
        : DEFAULT_ANSI_STYLE
      : resolvedStyle;
    const nextHref = isFlexibleSpace ? undefined : resolvedStyle.href;

    if (activeHref !== nextHref) {
      if (activeHref) {
        out += closeHyperlinkSequence();
      }
    }
    out += toAnsiStyleDiffSequence(activeStyle, nextStyle);
    if (activeHref !== nextHref && nextHref) {
      out += toHyperlinkSequence(nextHref);
    }
    out += piece.char;
    activeStyle = nextStyle;
    activeHref = nextHref;
  });

  if (activeHref) out += closeHyperlinkSequence();
  if (!sameAnsiStyle(activeStyle, DEFAULT_ANSI_STYLE)) out += ANSI_RESET;
  return out;
};

const generateStringFromBounds = (
  grid: GridCellSource,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): string => {
  const lines: string[] = [];

  for (let y = minY; y <= maxY; y++) {
    let line = "";
    for (let x = minX; x <= maxX; x++) {
      const cell = grid.get({ x, y });
      if (cell) {
        line += cell.char;
        if (getCellOccupancy(cell.char) === 2) x++;
      } else {
        line += " ";
      }
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  return lines.join("\n");
};

export const exportToString = (grid: GridCellSource) => {
  if (!grid.getContentBounds()) return "";
  const { minX, maxX, minY, maxY } = GridManager.getGridBounds(grid);

  return generateStringFromBounds(
    grid,
    minX - EXPORT_PADDING,
    maxX + EXPORT_PADDING,
    minY - EXPORT_PADDING,
    maxY + EXPORT_PADDING
  );
};

export const exportSelectionToString = (
  grid: GridCellSource,
  selections: SelectionArea[]
) => {
  if (selections.length === 0) return "";
  const { minX, maxX, minY, maxY } = getSelectionsBoundingBox(selections);
  return generateStringFromBounds(grid, minX, maxX, minY, maxY);
};

export const exportSelectionToAnsi = (
  grid: GridCellSource,
  selections: SelectionArea[],
  options?: AnsiExportOptions
) => {
  if (selections.length === 0) return "";
  const { minX, maxX, minY, maxY } = getSelectionsBoundingBox(selections);
  return serializeAnsiRows(grid, minX, maxX, minY, maxY, options);
};

export const exportToAnsi = (
  grid: GridCellSource,
  options?: AnsiExportOptions
) => {
  if (!grid.getContentBounds()) return "";

  const { minX, maxX, minY, maxY } = GridManager.getGridBounds(grid);
  return serializeAnsiRows(grid, minX, maxX, minY, maxY, options);
};

export const exportToCharDesk = (
  grid: GridCellSource,
  options?: AnsiExportOptions
) => exportToAnsi(grid, options).replaceAll("\u001b[", "[");

export const exportSelectionToJSON = (
  grid: GridCellSource,
  selections: SelectionArea[]
) => {
  if (selections.length === 0) return null;
  const { minX, minY, maxX, maxY } = getSelectionsBoundingBox(selections);

  const cells: { x: number; y: number; char: string; color: string }[] = [];

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const cell = grid.get({ x, y });
      if (cell) {
        cells.push({
          x: x - minX,
          y: y - minY,
          char: cell.char,
          color: cell.color,
          ...(cell.bgColor ? { bgColor: cell.bgColor } : {}),
          ...(cloneTextAttributes(cell.attrs)
            ? { attrs: cloneTextAttributes(cell.attrs) }
            : {}),
          ...(cell.href ? { href: cell.href } : {}),
        });
      }
    }
  }

  return JSON.stringify({
    type: "ascii-metropolis-zone",
    version: 1,
    cells,
  });
};
