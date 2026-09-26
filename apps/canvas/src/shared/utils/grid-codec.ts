import { COLOR_PRIMARY_TEXT } from "@/shared/lib/constants";
import type { GridCell, TextAttributes } from "@/shared/types";
import {
  cloneTextAttributes,
  normalizeCellHref,
} from "@/shared/utils/ansi";
import { GridManager } from "@/shared/utils/grid";
import { writeStyledCell } from "@/shared/utils/grid-ops";

const normalizeGridCellEntries = (entries: [string, GridCell][]) => {
  const latestByKey = new Map(entries);
  const sortable: Array<{ key: string; cell: GridCell; x: number; y: number }> = [];
  const passthrough: [string, GridCell][] = [];
  latestByKey.forEach((cell, key) => {
    const coordinates = key.split(",");
    const isValidKey =
      coordinates.length === 2 &&
      coordinates.every((coordinate) => /^-?\d+$/.test(coordinate));
    const point = GridManager.fromKey(key);
    if (
      isValidKey &&
      typeof cell?.char === "string" &&
      Number.isSafeInteger(point.x) &&
      Number.isSafeInteger(point.y)
    ) {
      sortable.push({ key, cell, ...point });
    } else {
      passthrough.push([key, cell]);
    }
  });
  sortable.sort((left, right) => left.y - right.y || left.x - right.x);
  const grid = new Map<string, GridCell>();
  sortable.forEach(({ cell, x, y }) => writeStyledCell(grid, x, y, cell));
  return [...grid.entries(), ...passthrough];
};

export const decodeGridEntries = (
  value: unknown,
  fallbackColor = COLOR_PRIMARY_TEXT
): [string, GridCell][] => {
  if (!Array.isArray(value)) return [];

  const decoded = value.reduce<[string, GridCell][]>((entries, item) => {
    if (!Array.isArray(item) || typeof item[0] !== "string") return entries;
    const [key, rawCell] = item;
    if (typeof rawCell === "string") {
      entries.push([key, { char: rawCell, color: fallbackColor }]);
      return entries;
    }
    if (!rawCell || typeof rawCell !== "object") return entries;
    const candidate = rawCell as Record<string, unknown>;
    if (typeof candidate.char !== "string") return entries;
    const rawAttrs = candidate.attrs;
    const attrs =
      rawAttrs && typeof rawAttrs === "object" && !Array.isArray(rawAttrs)
        ? cloneTextAttributes(
            Object.fromEntries(
              ["bold", "italic", "underline", "strike", "inverse"].flatMap(
                (key) =>
                  (rawAttrs as Record<string, unknown>)[key] === true
                    ? [[key, true]]
                    : []
              )
            ) as TextAttributes
          )
        : undefined;
    const href = normalizeCellHref(candidate.href);
    entries.push([
      key,
      {
        char: candidate.char,
        color:
          typeof candidate.color === "string"
            ? candidate.color
            : fallbackColor,
        ...(typeof candidate.bgColor === "string"
          ? { bgColor: candidate.bgColor }
          : {}),
        ...(attrs ? { attrs } : {}),
        ...(href ? { href } : {}),
      },
    ]);
    return entries;
  }, []);
  return normalizeGridCellEntries(decoded);
};

export const createGridMap = (value: unknown) =>
  new Map<string, GridCell>(decodeGridEntries(value));
