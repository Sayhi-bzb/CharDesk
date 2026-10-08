import type { CellRect, SceneEntry, SceneSnapshot, WidgetTree } from "./types.js";

export type CellBoundarySegment = Readonly<{
  orientation: "horizontal" | "vertical";
  start: number;
  end: number;
  coordinate: number;
  ownerId: string;
  semanticOwnerId?: string;
  priority?: number;
}>;
export type SplitJunction = Readonly<{ x: number; y: number; glyph: string }>;
export type CellBoundaryTopology = Readonly<{
  segments: readonly CellBoundarySegment[];
  junctions: ReadonlyMap<string, readonly SplitJunction[]>;
}>;

const glyphs: Record<number, string | undefined> = { 3: "│", 12: "─", 6: "┐", 10: "┌", 5: "┘", 9: "└", 7: "┤", 11: "├", 14: "┬", 13: "┴", 15: "┼" };
const covers = (s: CellBoundarySegment, x: number, y: number) => s.orientation === "vertical"
  ? x === s.coordinate && y >= s.start && y <= s.end
  : y === s.coordinate && x >= s.start && x <= s.end;
const coversAny = (ss: readonly CellBoundarySegment[], x: number, y: number, orientation: CellBoundarySegment["orientation"]) =>
  ss.some((s) => s.orientation === orientation && covers(s, x, y));

const addFrame = (segments: CellBoundarySegment[], entry: SceneEntry, ownerId: string) => {
  const { x, y, width, height } = entry.layoutBounds;
  if (width < 2 || height < 2) return;
  const right = x + width - 1, bottom = y + height - 1;
  segments.push(
    { orientation: "horizontal", start: x, end: right, coordinate: y, ownerId, priority: 1 },
    { orientation: "horizontal", start: x, end: right, coordinate: bottom, ownerId, priority: 1 },
    { orientation: "vertical", start: y, end: bottom, coordinate: x, ownerId, priority: 1 },
    { orientation: "vertical", start: y, end: bottom, coordinate: right, ownerId, priority: 1 },
  );
};
const addLine = (segments: CellBoundarySegment[], entry: SceneEntry, ownerId: string, orientation: CellBoundarySegment["orientation"], priority: number) => {
  const { x, y, width, height } = entry.layoutBounds;
  segments.push(orientation === "vertical"
    ? { orientation, start: y, end: y + height - 1, coordinate: x, ownerId, semanticOwnerId: ownerId, priority }
    : { orientation, start: x, end: x + width - 1, coordinate: y, ownerId, semanticOwnerId: ownerId, priority });
};

export const resolveCellBoundaryTopology = (tree: WidgetTree, scene: SceneSnapshot): CellBoundaryTopology => {
  const segments: CellBoundarySegment[] = [], splitters: string[] = [];
  for (const id of scene.paintList) {
    const node = tree.nodes.get(id), entry = scene.entries.get(id);
    if (!node || !entry || !entry.paintVisible) continue;
    if (node.frame === "bordered") addFrame(segments, entry, id);
    if (node.kind === "separator" || node.kind === "splitter") {
      addLine(segments, entry, id, node.orientation === "vertical" ? "vertical" : "horizontal", node.kind === "splitter" ? 3 : 2);
      if (node.kind === "splitter") splitters.push(id);
    }
  }
  const junctions = new Map<string, SplitJunction[]>();
  for (const id of splitters) {
    const entry = scene.entries.get(id), node = tree.nodes.get(id);
    if (!entry || !node) continue;
    const vertical = node.orientation === "vertical", b = entry.layoutBounds;
    // Open splitters do not own end caps. Junctions are emitted only when
    // another real boundary segment (frame, separator, or splitter) meets
    // the endpoint, so an open editor edge remains open.
    const candidates: Array<{ x: number; y: number }> = [];
    for (const other of segments) {
      if (other.ownerId === id || other.orientation === (vertical ? "vertical" : "horizontal")) continue;
      const point = vertical
        ? { x: b.x, y: other.coordinate }
        : { x: other.coordinate, y: b.y };
      const otherCovers = covers(other, point.x, point.y)
        || (other.priority !== 1 && !vertical && other.orientation === "vertical" && (point.y === other.start - 1 || point.y === other.end + 1))
        || (other.priority !== 1 && vertical && other.orientation === "horizontal" && (point.x === other.start - 1 || point.x === other.end + 1));
      if (otherCovers && covers({ orientation: vertical ? "vertical" : "horizontal", start: vertical ? b.y - 1 : b.x - 1, end: vertical ? b.y + b.height : b.x + b.width, coordinate: vertical ? b.x : b.y, ownerId: id }, point.x, point.y)) candidates.push(point);
    }
    const seen = new Set<string>();
    for (const point of candidates) {
      const key = `${point.x}:${point.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // At an internal crossing the horizontal splitter owns the tee. The
      // vertical line remains a continuous `│` and must not be overwritten.
      if (vertical && segments.some((segment) => segment.orientation === "horizontal"
        && segment.priority !== 1 && segment.coordinate === point.y
        && segment.start === point.x + 1)) continue;
      const mask = (coversAny(segments, point.x, point.y - 1, "vertical") ? 1 : 0)
        | (coversAny(segments, point.x, point.y + 1, "vertical") ? 2 : 0)
        | (coversAny(segments, point.x - 1, point.y, "horizontal") ? 4 : 0)
        | (coversAny(segments, point.x + 1, point.y, "horizontal") ? 8 : 0);
      let glyph = glyphs[mask];
      let junction = point;
      // Only a real bordered frame owns a left/right endpoint tee. Open
      // splitter boundaries stay open; their internal vertical joins still
      // resolve through the normal four-direction mask.
      const frameAtLeft = !vertical && point.x === b.x - 1 && segments.some((segment) =>
        segment.priority === 1 && segment.orientation === "vertical" && segment.coordinate === point.x
        && point.y >= segment.start && point.y <= segment.end);
      const frameAtRight = !vertical && point.x === b.x + b.width && segments.some((segment) =>
        segment.priority === 1 && segment.orientation === "vertical" && segment.coordinate === point.x
        && point.y >= segment.start && point.y <= segment.end);
      if (frameAtLeft) {
        glyph = "├";
        junction = { x: point.x + 1, y: point.y };
      } else if (frameAtRight) {
        glyph = "┤";
        junction = { x: point.x, y: point.y };
      }
      if (glyph && mask !== 3 && mask !== 12) junctions.set(id, [...(junctions.get(id) ?? []), { ...junction, glyph }]);
    }
  }
  return { segments, junctions };
};

export const resolveSplitTopology = (tree: WidgetTree, scene: SceneSnapshot) => resolveCellBoundaryTopology(tree, scene).junctions;
export const splitPaintBounds = (line: CellRect, junctions: readonly SplitJunction[]): CellRect => {
  const x = Math.min(line.x, ...junctions.map((j) => j.x)), y = Math.min(line.y, ...junctions.map((j) => j.y));
  return { x, y, width: Math.max(line.x + line.width, ...junctions.map((j) => j.x + 1)) - x, height: Math.max(line.y + line.height, ...junctions.map((j) => j.y + 1)) - y };
};
