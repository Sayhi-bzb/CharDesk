"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import { rx } from "./recipes.js";
import { cn } from "./utils.js";

// Interaction model adapted from Moumenlab's MIT-licensed drag-to-reorder-list.
// Rendering stays project-specific, and the whole card owns the drag gesture.

const POINTER_DRAG_THRESHOLD = 4;
const TOUCH_HOLD_DELAY = 300;
const TOUCH_HOLD_TOLERANCE = 6;
const AUTO_SCROLL_EDGE = 48;
const AUTO_SCROLL_MAX_STEP = 14;
const SLOT_SHIFT = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1],
} as const;

type ReorderEventType = "grab" | "move" | "drop" | "cancel";

export type ReorderAnnouncement<Item> = {
  type: ReorderEventType;
  item: Item;
  from: number;
  to: number;
  total: number;
};

type ReorderRenderState = {
  dragging: boolean;
  grabbed: boolean;
  lifted: boolean;
};

type DragData = {
  row: HTMLLIElement;
  pointerId: number;
  pointerType: string;
  index: number;
  startY: number;
  lastY: number;
  active: boolean;
  positions: { top: number; bottom: number; center: number }[];
  extent: number;
  to: number;
  rows: HTMLLIElement[];
  scrollParent: HTMLElement | null;
  startScrollTop: number;
  autoScrollFrame: number | null;
  holdTimer: number | null;
};

type ReorderableListProps<Item> = {
  items: readonly Item[];
  getId: (item: Item) => string;
  getItemLabel: (
    item: Item,
    index: number,
    total: number,
    grabbed: boolean
  ) => string;
  getAnnouncement: (event: ReorderAnnouncement<Item>) => string;
  onMove: (id: string, targetIndex: number) => void;
  renderItem: (
    item: Item,
    index: number,
    state: ReorderRenderState
  ) => ReactNode;
  ariaLabel: string;
  className?: string;
  itemClassName?: string;
};

function findScrollParent(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent) {
    const overflowY = getComputedStyle(parent).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

type ReorderableRowProps = {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
  lifted: boolean;
  onRegister: (id: string, value: MotionValue<number>) => () => void;
  onPointerDown: PointerEventHandler<HTMLLIElement>;
  onPointerMove: PointerEventHandler<HTMLLIElement>;
  onPointerUp: PointerEventHandler<HTMLLIElement>;
  onPointerCancel: PointerEventHandler<HTMLLIElement>;
  onClickCapture: React.MouseEventHandler<HTMLLIElement>;
  onKeyDown: React.KeyboardEventHandler<HTMLLIElement>;
  onTouchMove: React.TouchEventHandler<HTMLLIElement>;
};

function ReorderableRow({
  id,
  label,
  children,
  className,
  lifted,
  onRegister,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onClickCapture,
  onKeyDown,
  onTouchMove,
}: ReorderableRowProps) {
  const y = useMotionValue(0);

  useLayoutEffect(() => onRegister(id, y), [id, onRegister, y]);

  return (
    <motion.li
      data-id={id}
      data-reorder-item={id}
      data-reorder-card={id}
      data-canvas-ui="true"
      tabIndex={0}
      aria-label={label}
      className={cn(
        "relative cursor-grab rounded-md",
        rx.focusRing(),
        lifted && "z-10 cursor-grabbing",
        className
      )}
      style={{ y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={onClickCapture}
      onKeyDown={onKeyDown}
      onTouchMove={onTouchMove}
    >
      {children}
    </motion.li>
  );
}

export function ReorderableList<Item>({
  items,
  getId,
  getItemLabel,
  getAnnouncement,
  onMove,
  renderItem,
  ariaLabel,
  className,
  itemClassName,
}: ReorderableListProps<Item>) {
  const [dragging, setDragging] = useState<{ id: string; from: number } | null>(
    null
  );
  const [grabbed, setGrabbed] = useState<{ id: string; from: number } | null>(
    null
  );
  const [announce, setAnnounce] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const dragRef = useRef<DragData | null>(null);
  const grabSnapshotRef = useRef<readonly Item[] | null>(null);
  const suppressedClickIdRef = useRef<string | null>(null);
  const suppressedClickTimerRef = useRef<number | null>(null);
  const [yMap] = useState(() => new Map<string, MotionValue<number>>());
  const reducedMotion = useReducedMotion();

  const yFor = useCallback((id: string) => yMap.get(id), [yMap]);
  const registerY = useCallback(
    (id: string, value: MotionValue<number>) => {
      yMap.set(id, value);
      return () => {
        if (yMap.get(id) === value) yMap.delete(id);
      };
    },
    [yMap]
  );

  const rowNodes = useCallback(
    () =>
      Array.from(
        listRef.current?.querySelectorAll<HTMLLIElement>(
          "[data-reorder-item]"
        ) ?? []
      ),
    []
  );

  const stopAutoScroll = useCallback((drag: DragData) => {
    if (drag.autoScrollFrame !== null) {
      cancelAnimationFrame(drag.autoScrollFrame);
      drag.autoScrollFrame = null;
    }
  }, []);

  const clearHoldTimer = useCallback((drag: DragData) => {
    if (drag.holdTimer !== null) {
      window.clearTimeout(drag.holdTimer);
      drag.holdTimer = null;
    }
  }, []);

  const glide = useCallback(
    (value: MotionValue<number> | undefined, target: number) => {
      if (!value) return;
      if (reducedMotion) value.jump(target);
      else animate(value, target, SLOT_SHIFT);
    },
    [reducedMotion]
  );

  const updatePointerPosition = useCallback(
    (drag: DragData) => {
      const scrollDelta = drag.scrollParent
        ? drag.scrollParent.scrollTop - drag.startScrollTop
        : 0;
      const deltaY = drag.lastY - drag.startY + scrollDelta;
      const origin = drag.positions[drag.index];
      if (!origin) return;
      const min = drag.positions[0]!.top - origin.top;
      const max = drag.positions.at(-1)!.bottom - origin.bottom;
      const visualOffset = Math.max(min, Math.min(max, deltaY));
      yFor(drag.row.dataset.id ?? "")?.jump(visualOffset);
      let targetIndex = drag.index;
      if (visualOffset > 0) {
        const leadingEdge = origin.bottom + visualOffset;
        for (let index = drag.index + 1; index < drag.positions.length; index += 1) {
          if (leadingEdge < drag.positions[index]!.center) break;
          targetIndex = index;
        }
      } else if (visualOffset < 0) {
        const leadingEdge = origin.top + visualOffset;
        for (let index = drag.index - 1; index >= 0; index -= 1) {
          if (leadingEdge > drag.positions[index]!.center) break;
          targetIndex = index;
        }
      }
      if (targetIndex === drag.to) return;
      drag.to = targetIndex;
      drag.rows.forEach((row, index) => {
        if (row === drag.row) return;
        let shift = 0;
        if (drag.index < index && index <= targetIndex) shift = -drag.extent;
        if (targetIndex <= index && index < drag.index) shift = drag.extent;
        glide(yFor(row.dataset.id ?? ""), shift);
      });
    },
    [glide, yFor]
  );

  const startAutoScroll = useCallback(
    (drag: DragData) => {
      if (!drag.scrollParent || drag.autoScrollFrame !== null) return;
      const tick = () => {
        const current = dragRef.current;
        if (
          !current ||
          current !== drag ||
          !current.active ||
          !current.scrollParent
        ) {
          stopAutoScroll(drag);
          return;
        }
        const rect = current.scrollParent.getBoundingClientRect();
        const topDistance = current.lastY - rect.top;
        const bottomDistance = rect.bottom - current.lastY;
        let step = 0;
        if (topDistance < AUTO_SCROLL_EDGE) {
          step =
            -AUTO_SCROLL_MAX_STEP *
            (1 - Math.max(0, topDistance) / AUTO_SCROLL_EDGE);
        } else if (bottomDistance < AUTO_SCROLL_EDGE) {
          step =
            AUTO_SCROLL_MAX_STEP *
            (1 - Math.max(0, bottomDistance) / AUTO_SCROLL_EDGE);
        }
        if (step) {
          const before = current.scrollParent.scrollTop;
          current.scrollParent.scrollTop += step;
          if (current.scrollParent.scrollTop !== before) {
            updatePointerPosition(current);
          }
        }
        current.autoScrollFrame = requestAnimationFrame(tick);
      };
      drag.autoScrollFrame = requestAnimationFrame(tick);
    },
    [stopAutoScroll, updatePointerPosition]
  );

  const activateDrag = useCallback(
    (drag: DragData) => {
      if (drag.active || dragRef.current !== drag) return;
      clearHoldTimer(drag);
      const rows = rowNodes();
      drag.rows = rows;
      drag.positions = rows.map((row) => {
        const { top, bottom } = row.getBoundingClientRect();
        return { top, bottom, center: (top + bottom) / 2 };
      });
      const origin = drag.positions[drag.index];
      if (!origin) return;
      const next = drag.positions[drag.index + 1];
      const previous = drag.positions[drag.index - 1];
      const gap = next
        ? next.top - origin.bottom
        : previous ? origin.top - previous.bottom : 0;
      drag.extent = origin.bottom - origin.top + gap;
      drag.active = true;
      drag.row.setPointerCapture(drag.pointerId);
      setDragging({ id: drag.row.dataset.id ?? "", from: drag.index });
      startAutoScroll(drag);
    },
    [clearHoldTimer, rowNodes, startAutoScroll]
  );

  const resetRows = useCallback(
    (drag: DragData, immediate: boolean) => {
      drag.rows.forEach((row) => {
        const value = yFor(row.dataset.id ?? "");
        if (immediate) value?.jump(0);
        else glide(value, 0);
      });
    },
    [glide, yFor]
  );

  const suppressNextClick = useCallback((id: string) => {
    if (suppressedClickTimerRef.current !== null) {
      window.clearTimeout(suppressedClickTimerRef.current);
    }
    suppressedClickIdRef.current = id;
    suppressedClickTimerRef.current = window.setTimeout(() => {
      suppressedClickIdRef.current = null;
      suppressedClickTimerRef.current = null;
    }, 0);
  }, []);

  const cancelPointerDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    clearHoldTimer(drag);
    stopAutoScroll(drag);
    if (!drag.active) return;
    resetRows(drag, false);
    setDragging(null);
  }, [clearHoldTimer, resetRows, stopAutoScroll]);

  useEffect(() => {
    if (!dragging) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelPointerDrag();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [cancelPointerDrag, dragging]);

  useEffect(
    () => () => {
      if (dragRef.current) {
        clearHoldTimer(dragRef.current);
        stopAutoScroll(dragRef.current);
      }
      if (suppressedClickTimerRef.current !== null) {
        window.clearTimeout(suppressedClickTimerRef.current);
      }
    },
    [clearHoldTimer, stopAutoScroll]
  );

  const handlePointerDown = (
    event: React.PointerEvent<HTMLLIElement>,
    index: number
  ) => {
    if (dragRef.current || grabbed || event.button !== 0) return;
    const scrollParent = findScrollParent(event.currentTarget);
    const drag: DragData = {
      row: event.currentTarget,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      index,
      startY: event.clientY,
      lastY: event.clientY,
      active: false,
      positions: [],
      extent: 0,
      to: index,
      rows: [],
      scrollParent,
      startScrollTop: scrollParent?.scrollTop ?? 0,
      autoScrollFrame: null,
      holdTimer: null,
    };
    dragRef.current = drag;
    if (event.pointerType === "touch") {
      drag.holdTimer = window.setTimeout(
        () => activateDrag(drag),
        TOUCH_HOLD_DELAY
      );
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLLIElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.lastY = event.clientY;
    if (!drag.active) {
      const distance = Math.abs(event.clientY - drag.startY);
      if (drag.pointerType === "touch") {
        if (distance <= TOUCH_HOLD_TOLERANCE) return;
        clearHoldTimer(drag);
        dragRef.current = null;
        return;
      }
      if (distance < POINTER_DRAG_THRESHOLD) return;
      activateDrag(drag);
    }
    if (drag.pointerType === "touch") event.preventDefault();
    updatePointerPosition(drag);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLLIElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    clearHoldTimer(drag);
    stopAutoScroll(drag);
    if (!drag.active) return;
    const id = drag.row.dataset.id ?? "";
    suppressNextClick(id);
    setDragging(null);
    if (drag.to === drag.index) {
      resetRows(drag, false);
      return;
    }
    resetRows(drag, true);
    onMove(id, drag.to);
  };

  const handleCardKeyDown = (
    event: React.KeyboardEvent<HTMLLIElement>,
    item: Item,
    index: number
  ) => {
    if (event.target !== event.currentTarget || dragging) return;
    const id = getId(item);
    const isGrabbed = grabbed?.id === id;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (isGrabbed) {
        setGrabbed(null);
        grabSnapshotRef.current = null;
        setAnnounce(
          getAnnouncement({
            type: "drop",
            item,
            from: grabbed.from,
            to: index,
            total: items.length,
          })
        );
      } else {
        setGrabbed({ id, from: index });
        grabSnapshotRef.current = items;
        setAnnounce(
          getAnnouncement({
            type: "grab",
            item,
            from: index,
            to: index,
            total: items.length,
          })
        );
      }
      return;
    }
    if (!isGrabbed) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const targetIndex = event.key === "ArrowUp" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= items.length) return;
      onMove(id, targetIndex);
      setAnnounce(
        getAnnouncement({
          type: "move",
          item,
          from: index,
          to: targetIndex,
          total: items.length,
        })
      );
      requestAnimationFrame(() => rowNodes()[targetIndex]?.focus());
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      const snapshot = grabSnapshotRef.current;
      const originalIndex = snapshot?.findIndex(
        (candidate) => getId(candidate) === id
      );
      grabSnapshotRef.current = null;
      setGrabbed(null);
      if (
        originalIndex !== undefined &&
        originalIndex >= 0 &&
        originalIndex !== index
      ) {
        onMove(id, originalIndex);
      }
      setAnnounce(
        getAnnouncement({
          type: "cancel",
          item,
          from: index,
          to: originalIndex ?? index,
          total: items.length,
        })
      );
    }
  };

  return (
    <>
      <ol ref={listRef} className={cn("relative", className)} aria-label={ariaLabel}>
        {items.map((item, index) => {
          const id = getId(item);
          const isDragging = dragging?.id === id;
          const isGrabbed = grabbed?.id === id;
          const lifted = isDragging || isGrabbed;
          return (
            <ReorderableRow
              key={id}
              id={id}
              label={getItemLabel(item, index, items.length, isGrabbed)}
              className={itemClassName}
              lifted={lifted}
              onRegister={registerY}
              onPointerDown={(event) => handlePointerDown(event, index)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={cancelPointerDrag}
              onClickCapture={(event) => {
                if (suppressedClickIdRef.current !== id) return;
                event.preventDefault();
                event.stopPropagation();
                suppressedClickIdRef.current = null;
              }}
              onKeyDown={(event) => handleCardKeyDown(event, item, index)}
              onTouchMove={(event) => {
                if (
                  dragRef.current?.active &&
                  dragRef.current.pointerType === "touch"
                ) {
                  event.preventDefault();
                }
              }}
            >
              {renderItem(item, index, {
                dragging: isDragging,
                grabbed: isGrabbed,
                lifted,
              })}
            </ReorderableRow>
          );
        })}
      </ol>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </>
  );
}
