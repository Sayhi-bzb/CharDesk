import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  dragAndDropFeature,
  hotkeysCoreFeature,
  isOrderedDragTarget,
  syncDataLoaderFeature,
  type DragTarget,
} from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
import { cn } from '@chardesk/ui';
import { moveCanvasAnchor, type CanvasAnchor } from '@/domains/canvas/public';

const ROOT_ID = '__canvas_anchors_root__';
const INDENT = 14;
const ROOT_ANCHOR: CanvasAnchor = {
  id: ROOT_ID,
  point: { x: 0, y: 0 },
  label: '',
  order: -1,
  parentId: null,
  detached: false,
};

export function CanvasAnchorTreeList({
  anchors,
  onMove,
  renderItem,
  ariaLabel,
  getItemLabel,
  getMoveAnnouncement,
  editable = true,
}: {
  anchors: readonly CanvasAnchor[];
  onMove: (id: string, parentId: string | null, siblingIndex: number) => void;
  renderItem: (anchor: CanvasAnchor) => ReactNode;
  ariaLabel: string;
  getItemLabel: (anchor: CanvasAnchor, depth: number, index: number, total: number) => string;
  getMoveAnnouncement: (anchor: CanvasAnchor) => string;
  editable?: boolean;
}) {
  const [announcement, setAnnouncement] = useState('');
  const renderedAnchors = useRef<readonly CanvasAnchor[] | null>(null);
  const byId = useMemo(() => new Map(anchors.map((anchor) => [anchor.id, anchor])), [anchors]);
  const children = useMemo(() => {
    const result = new Map<string, string[]>();
    result.set(ROOT_ID, []);
    for (const anchor of anchors) {
      const parentId = anchor.parentId ?? ROOT_ID;
      const siblings = result.get(parentId) ?? [];
      siblings.push(anchor.id);
      result.set(parentId, siblings);
    }
    return result;
  }, [anchors]);
  const expandedItems = useMemo(() => anchors.map((anchor) => anchor.id), [anchors]);

  const destination = (id: string, target: DragTarget<CanvasAnchor>) => {
    const parentId = target.item.getId() === ROOT_ID ? null : target.item.getId();
    const siblingIndex = isOrderedDragTarget(target)
      ? target.insertionIndex
      : (children.get(parentId ?? ROOT_ID)?.length ?? 0) -
        Number(byId.get(id)?.parentId === parentId);
    return { parentId, siblingIndex };
  };

  const tree = useTree<CanvasAnchor>({
    rootItemId: ROOT_ID,
    indent: INDENT,
    canReorder: editable,
    state: { expandedItems },
    getItemName: (item) => byId.get(item.getId())?.label ?? '',
    isItemFolder: (item) => (children.get(item.getId())?.length ?? 0) > 0,
    dataLoader: {
      getItem: (id) => byId.get(id) ?? ROOT_ANCHOR,
      getChildren: (id) => children.get(id) ?? [],
    },
    canDrop: (items, target) => {
      if (!editable) return false;
      if (items.length !== 1) return false;
      const { parentId, siblingIndex } = destination(items[0].getId(), target);
      return moveCanvasAnchor(anchors, items[0].getId(), parentId, siblingIndex) !== null;
    },
    onDrop: (items, target) => {
      if (!editable) return;
      const anchor = byId.get(items[0]?.getId());
      if (!anchor) return;
      const { parentId, siblingIndex } = destination(anchor.id, target);
      onMove(anchor.id, parentId, siblingIndex);
      setAnnouncement(getMoveAnnouncement(anchor));
    },
    features: [syncDataLoaderFeature, hotkeysCoreFeature, ...(editable ? [dragAndDropFeature] : [])],
  });
  if (renderedAnchors.current !== anchors) {
    tree.scheduleRebuildTree();
    renderedAnchors.current = anchors;
  }

  return (
    <>
      <div {...tree.getContainerProps(ariaLabel)} className="relative min-w-0">
        {tree.getItems().map((item) => {
          const anchor = byId.get(item.getId());
          if (!anchor) return null;
          const meta = item.getItemMeta();
          const props = item.getProps();
          return (
            <div
              {...props}
              key={item.getId()}
              data-anchor-row={anchor.id}
              data-reorder-item={anchor.id}
              data-drop-intent={editable && item.isUnorderedDragTarget() ? 'nest' : undefined}
              aria-label={getItemLabel(anchor, meta.level, meta.posInSet, meta.setSize)}
              className={cn(
                'min-h-7 min-w-0 focus-visible:outline-2 focus-visible:outline-ring',
                editable && item.isUnorderedDragTarget() && 'rounded-md bg-accent/40'
              )}
              style={{ paddingLeft: meta.level * INDENT }}
              onFocus={() => item.setFocused()}
              onKeyDown={(event) => {
                if (!editable || !event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
                event.preventDefault();
                event.stopPropagation();
                const next = meta.posInSet + (event.key === 'ArrowUp' ? -1 : 1);
                if (next < 0 || next >= meta.setSize) return;
                onMove(anchor.id, anchor.parentId, next);
                setAnnouncement(getMoveAnnouncement(anchor));
              }}
            >
              {renderItem(anchor)}
            </div>
          );
        })}
        {editable && <div
          aria-hidden="true"
          data-drag-line=""
          className="z-10 h-0.5 bg-primary"
          style={tree.getDragLineStyle()}
        />}
      </div>
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </>
  );
}
