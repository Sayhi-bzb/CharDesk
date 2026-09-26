import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { YogaLayoutEngine, createWidgetDescriptor, reconcileWidgetTree, resolveCellUiScrollLayout,
  type CellRect, type RootProps, type WidgetCommand } from "@chardesk/cell-ui";
import { CELL_SURFACE_GUARD_CELLS, DEFAULT_CELL_UI_METRICS } from "@chardesk/cell-ui/browser";
import { GallerySurface } from "./appearance";

type ArticleSurfaceProps = Readonly<{
  label: string;
  probeId: string;
  content: ReactElement<RootProps>;
  anchorIds: readonly string[];
  anchorTargets?: Readonly<Record<string, string>>;
  regionIds?: readonly string[];
  regionsRef?: { current: Readonly<Record<string, CellRect>> };
  onWidthChange?: (width: number) => void;
  focusedId: string | null;
  onCommand: (command: WidgetCommand) => void;
}>;

export function CellArticleSurface({ label, probeId, content, anchorIds, anchorTargets, regionIds = [],
  regionsRef, onWidthChange, focusedId, onCommand }: ArticleSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(72);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const next = Math.max(1,
        Math.floor(host.clientWidth / DEFAULT_CELL_UI_METRICS.cellWidth) - 2 * CELL_SURFACE_GUARD_CELLS);
      setWidth(next);
      onWidthChange?.(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [onWidthChange]);
  const measured = useMemo(() => {
    const { tree } = reconcileWidgetTree(undefined, createWidgetDescriptor(content));
    const layout = new YogaLayoutEngine();
    try {
      const viewport = { width, height: 4096 };
      const entries = resolveCellUiScrollLayout(tree, viewport,
        { x: 0, y: 0, ...viewport }, layout).layout.entries;
      const rootId = probeId + "-content";
      return {
        height: Math.max(1, entries.get(rootId)?.rect.height ?? 1),
        anchors: Object.fromEntries(anchorIds.map((id) => [id,
          entries.get(anchorTargets?.[id] ?? `${probeId}-${id}`)?.rect.y ?? 0])) as Record<string, number>,
        regions: Object.fromEntries(regionIds.map((id) => [id, entries.get(id)?.rect] as const)
          .filter((entry): entry is readonly [string, CellRect] => entry[1] !== undefined)),
      };
    } finally {
      layout.dispose();
    }
  }, [width, content, anchorIds, anchorTargets, regionIds, probeId]);
  useLayoutEffect(() => { if (regionsRef) regionsRef.current = measured.regions; }, [measured, regionsRef]);
  return <div ref={hostRef} className="cell-article-block">
    {anchorIds.map((id) => <span key={id} id={id} className="cell-article-anchor" aria-hidden="true"
      style={{ top: (measured.anchors[id]! + CELL_SURFACE_GUARD_CELLS) * DEFAULT_CELL_UI_METRICS.cellHeight }} />)}
    <GallerySurface label={label} probeId={probeId} linearSelection
      viewport={{ width, height: measured.height }} focusedId={focusedId} onCommand={onCommand}>
      {content}
    </GallerySurface>
  </div>;
}
