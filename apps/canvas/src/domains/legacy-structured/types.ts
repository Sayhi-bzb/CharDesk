import type { Point, TextAttributes } from "@/shared/types";

// Read-only schema retained for flattening retired Structured Canvas content.

export interface StructuredNodeStyle {
  color: string;
  bgColor?: string;
  attrs?: TextAttributes;
}

interface StructuredTextRangeStyle {
  color?: string;
  bgColor?: string;
  attrs?: TextAttributes;
}

export interface StructuredTextStyleRange {
  start: number;
  end: number;
  style: StructuredTextRangeStyle;
}

interface StructuredNodeComponentMetadata {
  instanceId: string;
  templateId: string;
  role: string;
}

export interface StructuredComponentInstance {
  id: string;
  templateId: string;
  label: string;
  atomIds: string[];
  roles: Record<string, string[]>;
}

interface StructuredNodeBase {
  id: string;
  order: number;
  style: StructuredNodeStyle;
  component?: StructuredNodeComponentMetadata;
}

interface StructuredBoxNode extends StructuredNodeBase {
  type: "box";
  start: Point;
  end: Point;
  name?: string;
}

export type StructuredSplitBoxTreeNode =
  | { type: "leaf"; id: string }
  | {
      type: "split";
      id: string;
      axis: "horizontal" | "vertical";
      ratio: number;
      first: StructuredSplitBoxTreeNode;
      second: StructuredSplitBoxTreeNode;
    };

interface StructuredSplitBoxNode extends StructuredNodeBase {
  type: "splitBox";
  start: Point;
  end: Point;
  verticalSplitRatio: number;
  topSplitRatio: number;
  bottomSplitRatio: number;
  root?: StructuredSplitBoxTreeNode;
}

interface StructuredLineNode extends StructuredNodeBase {
  type: "line";
  start: Point;
  end: Point;
  axis: "vertical" | "horizontal";
  endMarker?: "arrow";
}

interface StructuredBgNode extends StructuredNodeBase {
  type: "bg";
  start: Point;
  end: Point;
}

interface StructuredTextNode extends StructuredNodeBase {
  type: "text";
  position: Point;
  text: string;
  styleRanges?: StructuredTextStyleRange[];
}

export type StructuredNode =
  | StructuredBoxNode
  | StructuredSplitBoxNode
  | StructuredLineNode
  | StructuredBgNode
  | StructuredTextNode;
