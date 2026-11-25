import type { Direction } from "../vendor/types.js";

export type LayoutDirection = Direction;

type LayoutRankConstraint = "first" | "last";
type LayoutCycleBreaking = "automatic" | "depth-first";
type LayoutPortPlacement = "center" | "distributed" | "adaptive";
type LayoutPortAllocation = "shared" | "independent";
type LayoutTopology = "shared" | "independent";

export interface LayoutLabel {
  text: string;
  width: number;
  height: number;
}

export interface LayoutNode {
  id: string;
  label: string;
  width: number;
  height: number;
  parentId?: string;
  rankConstraint?: LayoutRankConstraint;
  portPlacement?: LayoutPortPlacement;
  portAllocation?: LayoutPortAllocation;
}

interface LayoutEdgeRouting {
  topology?: LayoutTopology;
  bundleId?: string;
  bundle?: "structured";
  bundleKey?: string;
  quality?: "readable";
  selfLoop?: "engine" | "compact";
  sourceClearance?: number;
  targetClearance?: number;
}

interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  label?: LayoutLabel;
  sourceLabel?: LayoutLabel;
  targetLabel?: LayoutLabel;
  labelLayout?: "reserve" | "route";
  routing?: LayoutEdgeRouting;
}

export interface LayoutGroup {
  id: string;
  label: string;
  parentId?: string;
}

export interface LayoutGraph {
  direction: LayoutDirection;
  cycleBreaking?: LayoutCycleBreaking;
  nodeAlignment?: "automatic" | "balanced";
  pathAlignment?: "automatic" | "topology";
  spacing: {
    nodeNode: number;
    nodeNodeBetweenLayers: number;
  };
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  groups: LayoutGroup[];
}

export interface GridPoint {
  x: number;
  y: number;
}

export type GridSide = "top" | "right" | "bottom" | "left";

export interface PositionedEdgeEndpoint {
  side: GridSide;
  anchor: GridPoint;
  marker: GridPoint;
  outward: GridPoint;
}

export interface GridRect extends GridPoint {
  width: number;
  height: number;
}

export interface PositionedLayoutNode extends LayoutNode, GridRect {}

export interface PositionedLayoutGroup extends LayoutGroup, GridRect {}

export interface PositionedLayoutEdge extends LayoutEdge {
  points: GridPoint[];
  sourceEndpoint: PositionedEdgeEndpoint;
  targetEndpoint: PositionedEdgeEndpoint;
  labelPosition?: GridPoint;
  sourceLabelPosition?: GridPoint;
  targetLabelPosition?: GridPoint;
}

export interface GridLayout {
  width: number;
  height: number;
  nodes: PositionedLayoutNode[];
  edges: PositionedLayoutEdge[];
  groups: PositionedLayoutGroup[];
}

export interface GraphLayoutEngine {
  layout(graph: LayoutGraph): Promise<GridLayout>;
}
