import { formatCharDeskStyleNotes, getGraphemeCellWidth } from "@chardesk/protocol";
import type { NodeBounds } from "@/shared/types";
import type { CanvasSurfaceReader } from "./cell-plane/model";
import { isCanvasCellOccupied as occupied, readCanvasTextRegion } from "./textRegion";

export type CanvasReadViewport = readonly [x: number, y: number, width: number, height: number];
export type CanvasReadImageDetail = "low" | "high" | "original" | "auto";
export type CanvasReadProjection = Readonly<{
  viewport: CanvasReadViewport | null;
  sampleSize: number;
  mode: "text" | "projection" | "density";
  overviewOnly: boolean;
  content: string;
}>;
export type CanvasReadOptions = Readonly<{ defaultForeground?: string; includeStyles?: boolean }>;

export type CanvasReadImage = Readonly<{
  mimeType: "image/svg+xml";
  data: string;
  width: number;
  height: number;
  scale: number;
}>;

export type CanvasReadImageOptions = Readonly<{
  /** Canonical stored foreground, e.g. Canvas' #000000 default. */
  defaultForeground?: string;
  /** Theme-projected foreground used when the canonical default is found. */
  foreground?: string;
}>;

const quadrants = [" ", "▘", "▝", "▀", "▖", "▌", "▞", "▛", "▗", "▚", "▐", "▜", "▄", "▙", "▟", "█"];

const niceTickInterval = (minimum: number) => {
  const magnitude = 10 ** Math.floor(Math.log10(minimum));
  for (const factor of [1, 2, 5]) if (factor * magnitude >= minimum) return factor * magnitude;
  return 10 * magnitude;
};

/** A sampled bucket can contain a tick without starting on that coordinate. */
const tickInBucket = (start: number, size: number, interval: number): number | null => {
  const remainder = start % interval;
  const offset = remainder <= 0 ? -remainder : interval - remainder;
  return offset < size ? start + offset : null;
};

const escapeXml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const encodeBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

const imageMetrics = (detail: CanvasReadImageDetail) => {
  switch (detail) {
    case "low": return { cellWidth: 8, cellHeight: 16, scale: 1 };
    case "high": return { cellWidth: 12, cellHeight: 22, scale: 1.5 };
    case "original": return { cellWidth: 16, cellHeight: 28, scale: 2 };
    default: return { cellWidth: 10, cellHeight: 19, scale: 1.25 };
  }
};

/**
 * Produces a lossless, browser-renderable intermediate image without requiring
 * a canvas DOM node. The tool boundary converts this SVG to a model-compatible
 * PNG before exposing it through MCP.
 */
export const renderCanvasViewportImage = (
  surface: CanvasSurfaceReader,
  viewport: CanvasReadViewport,
  detail: CanvasReadImageDetail = "auto",
  options: CanvasReadImageOptions = {},
): CanvasReadImage => {
  const [x, y, width, height] = viewport;
  const { cellWidth, cellHeight, scale } = imageMetrics(detail);
  const pixelWidth = width * cellWidth;
  const pixelHeight = height * cellHeight;
  const elements: string[] = [];
  for (const row of surface.rows({ x, y, width, height })) {
    let cellX = row.spans[0]?.x ?? x;
    for (const span of row.spans) {
      cellX = span.x;
      for (const cell of span.cells) {
        const graphemeWidth = getGraphemeCellWidth(cell.char);
        const localX = cellX - x;
        const localY = row.y - y;
        if (localX >= 0 && localX < width && localY >= 0 && localY < height && graphemeWidth > 0) {
          const fill = cell.bgColor && cell.bgColor !== "transparent" ? escapeXml(cell.bgColor) : null;
          if (fill) elements.push(`<rect x="${localX * cellWidth}" y="${localY * cellHeight}" width="${graphemeWidth * cellWidth}" height="${cellHeight}" fill="${fill}"/>`);
          if (cell.char.trim() !== "") {
            const attrs = cell.attrs ?? {};
            const fontWeight = attrs.bold ? " font-weight=\"700\"" : "";
            const fontStyle = attrs.italic ? " font-style=\"italic\"" : "";
            const decoration = [attrs.underline ? "underline" : "", attrs.strike ? "line-through" : ""].filter(Boolean).join(" ");
            const textDecoration = decoration ? ` text-decoration="${decoration}"` : "";
            const color = options.defaultForeground && options.foreground &&
              cell.color.toLowerCase() === options.defaultForeground.toLowerCase()
              ? options.foreground
              : cell.color;
            elements.push(`<text x="${localX * cellWidth}" y="${(localY + 1) * cellHeight - 3}" fill="${escapeXml(color)}"${fontWeight}${fontStyle}${textDecoration}>${escapeXml(cell.char)}</text>`);
          }
        }
        cellX += graphemeWidth;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${pixelWidth} ${pixelHeight}"><rect width="100%" height="100%" fill="transparent"/><g font-family="monospace" font-size="${cellHeight - 4}px" xml:space="preserve">${elements.join("")}</g></svg>`;
  return {
    mimeType: "image/svg+xml",
    data: encodeBase64(svg),
    width: pixelWidth,
    height: pixelHeight,
    scale,
  };
};

export const isCanvasReadViewport = (value: unknown): value is CanvasReadViewport =>
  Array.isArray(value) && value.length === 4 && value.every(Number.isSafeInteger)
  && value[2] > 0 && value[3] > 0
  && Number.isSafeInteger(value[0] + value[2]) && Number.isSafeInteger(value[1] + value[3]);

export const readCanvasViewport = (
  surface: CanvasSurfaceReader,
  requested?: CanvasReadViewport,
  options: CanvasReadOptions = {},
): CanvasReadProjection => {
  if (requested !== undefined && !isCanvasReadViewport(requested)) throw new Error("Invalid viewport: expected [x,y,width,height] with safe integer coordinates and positive sizes.");
  const storedBounds = surface.getContentBounds();
  let bounds: NodeBounds | null = requested
    ? { x: requested[0], y: requested[1], width: requested[2], height: requested[3] }
    : null;
  if (!requested && storedBounds) {
    for (const row of surface.rows(storedBounds)) for (const span of row.spans) {
      let x = span.x;
      for (const cell of span.cells) {
        const width = getGraphemeCellWidth(cell.char);
        if (occupied(cell) && width > 0) {
          const right = Math.max(bounds ? bounds.x + bounds.width : x + width, x + width);
          const bottom = Math.max(bounds ? bounds.y + bounds.height : row.y + 1, row.y + 1);
          const left = Math.min(bounds?.x ?? x, x);
          const top = Math.min(bounds?.y ?? row.y, row.y);
          bounds = { x: left, y: top, width: right - left, height: bottom - top };
        }
        x += width;
      }
    }
  }
  if (!bounds) return { viewport: null, sampleSize: 1, mode: "text", overviewOnly: false, content: "" };
  const { x, y, width, height } = bounds;
  const sampleSize = Math.max(1, Math.ceil(width / 80), Math.ceil(height / 24));
  const columns = Math.ceil(width / sampleSize);
  const rows = Math.ceil(height / sampleSize);
  const mode = sampleSize === 1 ? "text" : sampleSize <= 4 ? "projection" : "density";
  const exact = mode === "text" ? readCanvasTextRegion(surface, bounds) : null;
  const text = exact?.text ?? Array.from({ length: rows }, () => Array<string>(columns).fill(" "));
  const counts = new Float64Array(rows * columns);
  const masks = new Uint8Array(rows * columns);
  const query = { x: x - 1, y, width: width + 1, height };
  if (storedBounds && mode !== "text") for (const row of surface.rows(query)) for (const span of row.spans) {
    let cellX = span.x;
    for (const cell of span.cells) {
      const cellWidth = getGraphemeCellWidth(cell.char);
      const localY = row.y - y;
      if (occupied(cell) && localY >= 0 && localY < height) {
        for (let offset = 0; offset < cellWidth; offset++) {
          const localX = cellX + offset - x;
          if (localX < 0 || localX >= width) continue;
          const column = Math.floor(localX / sampleSize);
          const outputRow = Math.floor(localY / sampleSize);
          const index = outputRow * columns + column;
          counts[index]++;
          const quadrantX = Math.floor((localX % sampleSize) * 2 / sampleSize);
          const quadrantY = Math.floor((localY % sampleSize) * 2 / sampleSize);
          masks[index] |= 1 << (quadrantY * 2 + quadrantX);
        }
      }
      cellX += cellWidth;
    }
  }
  if (mode !== "text") for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const index = row * columns + column;
    const area = Math.min(sampleSize, width - column * sampleSize) * Math.min(sampleSize, height - row * sampleSize);
    const density = counts[index] / area;
    text[row][column] = mode === "projection" ? quadrants[masks[index]]
      : density === 0 ? "·" : density <= 1 / 16 ? "░" : density <= 1 / 4 ? "▒" : density <= 1 / 2 ? "▓" : "█";
  }
  const xLabelWidth = Math.max(String(x).length, String(x + width - 1).length);
  const labelWidth = Math.max(String(y).length, String(y + height - 1).length, Math.floor(xLabelWidth / 2));
  const xMinor = niceTickInterval(sampleSize * Math.max(5, Math.ceil((xLabelWidth + 2) / 2)));
  const yInterval = niceTickInterval(5 * sampleSize);
  const prefix = labelWidth + 2;
  const ruler = Array<string>(prefix + columns + Math.ceil(xLabelWidth / 2)).fill(" ");
  const rulerMarks = Array<string>(columns).fill("─");
  let previousEnd = -1;
  for (let column = 0; column < columns; column++) {
    const start = x + column * sampleSize;
    const tick = tickInBucket(start, Math.min(sampleSize, width - column * sampleSize), xMinor);
    if (tick === null) continue;
    rulerMarks[column] = "┬";
    if (tick % (2 * xMinor) !== 0) continue;
    const label = String(tick);
    const offset = prefix + column - Math.floor(label.length / 2);
    if (offset > previousEnd) {
      [...label].forEach((char, index) => { ruler[offset + index] = char; });
      previousEnd = offset + label.length;
    }
  }
  const notes = exact && options.includeStyles !== false ? formatCharDeskStyleNotes(exact.cells, { coordinates: "explicit", defaultForeground: options.defaultForeground }) : "styles:none";
  const content = [
    `viewport=[${x},${y},${width},${height}] sampleSize=${sampleSize} mode=${mode}`,
    ...(ruler.some((char) => char !== " ") ? [ruler.join("").trimEnd()] : []),
    `${" ".repeat(prefix)}${rulerMarks.join("")}`,
    ...text.map((line, row) => {
      const start = y + row * sampleSize;
      const tick = tickInBucket(start, Math.min(sampleSize, height - row * sampleSize), yInterval);
      const label = tick === null ? " ".repeat(labelWidth) : String(tick).padStart(labelWidth);
      return `${label} ${tick === null ? "│" : "┤"}${line.join("").replace(/ +$/u, "")}`;
    }),
    ...(notes === "styles:none" ? [] : ["", notes]),
    ...(mode !== "text" ? ["Styles omitted: navigation symbols only; read a smaller viewport for text and styles."] : []),
  ].join("\n");
  return { viewport: [x, y, width, height], sampleSize, mode, overviewOnly: mode !== "text", content };
};
