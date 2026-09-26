import type { LayoutEngine } from "./layout.js";
import { composeScene } from "./scene.js";
import type {
  CellRect, CellSize, LayoutSnapshot, SceneSnapshot, WidgetId, WidgetKind, WidgetTree,
} from "./types.js";

type RailInsets = Readonly<{ right: number; bottom: number }>;

const ownsFlowingScrollContent = (kind: WidgetKind): boolean =>
  kind === "scroll-area" || kind === "select-content" || kind === "combobox-content";

export const resolveCellUiScrollLayout = (
  tree: WidgetTree,
  viewport: CellSize,
  overlayViewport: CellRect,
  engine: LayoutEngine,
): Readonly<{ layout: LayoutSnapshot; scene: SceneSnapshot }> => {
  const owners = [...tree.nodes.values()].filter((node) => ownsFlowingScrollContent(node.kind));
  const reserved = new Map<WidgetId, RailInsets>();
  for (let pass = 0; pass <= owners.length * 2; pass += 1) {
    const layoutTree: WidgetTree = reserved.size === 0 ? tree : {
      ...tree,
      nodes: new Map([...tree.nodes].map(([id, node]) => {
        const rail = reserved.get(id);
        return [id, !rail ? node : {
          ...node,
          style: {
            ...node.style,
            paddingRight: (node.style.paddingRight ?? node.style.padding ?? 0) + rail.right,
            paddingBottom: (node.style.paddingBottom ?? node.style.padding ?? 0) + rail.bottom,
          },
        }];
      })),
    };
    const rawLayout = engine.compute(layoutTree, viewport);
    let layout: LayoutSnapshot = rawLayout;
    if (reserved.size > 0) {
      const entries = new Map(rawLayout.entries);
      for (const [id, railInsets] of reserved) {
        const entry = entries.get(id);
        if (entry) entries.set(id, { ...entry, railInsets });
      }
      layout = { ...rawLayout, entries };
    }
    const scene = composeScene(tree, layout, overlayViewport);
    let changed = false;
    for (const owner of owners) {
      const metrics = scene.entries.get(owner.id)?.scrollMetrics;
      const previous = reserved.get(owner.id);
      const right = metrics?.verticalTrack ? 1 : 0;
      const bottom = metrics?.horizontalTrack ? 1 : 0;
      if (right === (previous?.right ?? 0) && bottom === (previous?.bottom ?? 0)) continue;
      if (right || bottom) reserved.set(owner.id, { right, bottom });
      else reserved.delete(owner.id);
      changed = true;
    }
    if (!changed) return { layout, scene };
  }
  throw new Error("Scroll rail layout did not converge.");
};
