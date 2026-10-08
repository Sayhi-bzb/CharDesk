import type { ComponentType, ReactNode } from "react";
import { Box } from "./react.js";
import type { BoxProps } from "./react.js";
export * from "./drag.js";
export * from "./selection.js";
export * from "./interaction-transaction.js";
export * from "./viewport.js";
export { DragSource, DropTarget, Splitter, ResizeHandle } from "./react.js";
export type { DragSourceProps, DropTargetProps, SplitterProps, ResizeHandleProps, CellResizeDirection, CellResizeRange } from "./react.js";

/** A controlled Cell size for one pane in a split layout. */
export type CellPaneSize = Readonly<{
  size: number;
  minSize?: number;
  maxSize?: number;
  collapsed?: boolean;
}>;

export type SplitProps = Omit<BoxProps, "children"> & Readonly<{
  orientation?: "horizontal" | "vertical";
  children?: ReactNode;
}>;

export type PaneProps = BoxProps & Readonly<{
  minSize?: number;
  maxSize?: number;
  collapsible?: boolean;
  collapsed?: boolean;
}>;

/**
 * Split and Pane share Box layout. Pane sizes remain application state;
 * Splitter projects the resize target into the Cell scene.
 */
export const Split = Box as unknown as ComponentType<SplitProps>;
export const Pane = Box as unknown as ComponentType<PaneProps>;

export type MarkerProps = BoxProps;
export type GuideProps = BoxProps;
export type InsertionIndicatorProps = BoxProps;
export type DragPreviewProps = BoxProps;

/** Low-level visual composition atoms for editor hosts. */
export const Marker = Box as unknown as ComponentType<MarkerProps>;
export const Guide = Box as unknown as ComponentType<GuideProps>;
export const InsertionIndicator = Box as unknown as ComponentType<InsertionIndicatorProps>;
export const DragPreview = Box as unknown as ComponentType<DragPreviewProps>;

export type CellSplitModel = Readonly<{
  sizes: readonly number[];
  resize: (index: number, delta: number) => readonly number[];
  collapse: (index: number) => readonly number[];
}>;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.trunc(value)));

/**
 * Pure Cell split sizing model. It does not own React or browser state; hosts
 * can feed the returned sizes back into their controlled view.
 */
export const createCellSplitModel = (
  initial: readonly CellPaneSize[],
): CellSplitModel => {
  if (initial.length < 2) throw new RangeError("A split needs at least two panes.");
  const limits = initial.map(({ minSize = 1, maxSize = Number.MAX_SAFE_INTEGER }) => ({
    min: Math.max(0, Math.trunc(minSize)),
    max: Math.max(Math.max(0, Math.trunc(minSize)), Math.trunc(maxSize)),
  }));
  let sizes = initial.map(({ size }, index) => clamp(size, limits[index]!.min, limits[index]!.max));
  const resize = (index: number, delta: number): readonly number[] => {
    if (!Number.isInteger(index) || index < 0 || index >= sizes.length - 1) return sizes;
    const left = limits[index]!;
    const right = limits[index + 1]!;
    const next = clamp(sizes[index]! + Math.trunc(delta), left.min, left.max);
    const actual = next - sizes[index]!;
    const nextRight = clamp(sizes[index + 1]! - actual, right.min, right.max);
    const applied = sizes[index + 1]! - nextRight;
    sizes = sizes.map((size, item) => item === index ? size + applied : item === index + 1 ? size - applied : size);
    return sizes;
  };
  const collapse = (index: number): readonly number[] => {
    if (!Number.isInteger(index) || index < 0 || index >= sizes.length) return sizes;
    const target = limits[index]!;
    const collapsed = sizes[index]! > target.min ? target.min : Math.max(target.min, Math.min(target.max, 1));
    sizes = sizes.map((size, item) => item === index ? collapsed : size);
    return sizes;
  };
  return { get sizes() { return sizes; }, resize, collapse };
};
