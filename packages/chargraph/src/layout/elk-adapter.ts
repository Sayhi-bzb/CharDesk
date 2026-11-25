import { getTextCellWidth } from "@chardesk/protocol";
import type {
  ELK,
  ElkExtendedEdge,
  ElkGraphElement,
  ElkNode,
  ElkPoint,
  ElkPort,
} from "elkjs/lib/elk-api.js";
import { quantizeCoordinate, quantizeRoute } from "./quantize.js";
import type {
  GridLayout,
  GridPoint,
  GridSide,
  LayoutDirection,
  LayoutGraph,
  LayoutLabel,
  LayoutNode,
  PositionedEdgeEndpoint,
  PositionedLayoutEdge,
  PositionedLayoutNode,
} from "./model.js";

const directionMap: Record<LayoutDirection, string> = {
  TD: "DOWN",
  TB: "DOWN",
  LR: "RIGHT",
  BT: "UP",
  RL: "LEFT",
};

const rootOptions = (
  direction: LayoutDirection,
  spacing: LayoutGraph["spacing"],
  cycleBreaking: LayoutGraph["cycleBreaking"] = "automatic",
  nodeAlignment: LayoutGraph["nodeAlignment"] = "automatic",
) => ({
  "elk.algorithm": "layered",
  "elk.direction": directionMap[direction],
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  ...(nodeAlignment === "balanced"
    ? { "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED" }
    : {}),
  ...(cycleBreaking === "depth-first"
    ? { "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST" }
    : {}),
  "elk.spacing.nodeNode": String(spacing.nodeNode),
  "elk.spacing.edgeNode": "1",
  "elk.spacing.edgeEdge": "1",
  "elk.spacing.componentComponent": "4",
  "elk.layered.spacing.edgeNodeBetweenLayers": "1",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "1",
  "elk.layered.spacing.nodeNodeBetweenLayers": String(spacing.nodeNodeBetweenLayers),
  "elk.padding": "[top=1,left=1,bottom=1,right=1]",
  "elk.separateConnectedComponents": "true",
});

const rankOptions = (node: LayoutNode) => node.rankConstraint
  ? { "elk.layered.layering.layerConstraint": node.rankConstraint.toUpperCase() }
  : undefined;

const label = (id: string, value: LayoutLabel) => ({
  id,
  ...value,
});

const hasDirectedCycle = (graph: LayoutGraph) => {
  const adjacency = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) adjacency.get(edge.source)?.push(edge.target);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    if ((adjacency.get(node) ?? []).some(visit)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return graph.nodes.some((node) => visit(node.id));
};

const topologyAlignment = (graph: LayoutGraph) => {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) {
    adjacency.get(edge.source)?.push(edge.target);
  }

  let nextIndex = 0;
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components = new Map<string, number>();
  let componentCount = 0;
  const visit = (node: string) => {
    indexes.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);
    for (const target of adjacency.get(node) ?? []) {
      if (!indexes.has(target)) {
        visit(target);
        lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(target)!));
      } else if (onStack.has(target)) {
        lowLinks.set(node, Math.min(lowLinks.get(node)!, indexes.get(target)!));
      }
    }
    if (lowLinks.get(node) !== indexes.get(node)) return;
    while (stack.length > 0) {
      const member = stack.pop()!;
      onStack.delete(member);
      components.set(member, componentCount);
      if (member === node) break;
    }
    componentCount += 1;
  };
  for (const node of graph.nodes) {
    if (!indexes.has(node.id)) visit(node.id);
  }

  const componentSizes = new Map<number, number>();
  for (const component of components.values()) {
    componentSizes.set(component, (componentSizes.get(component) ?? 0) + 1);
  }
  if ([...componentSizes.values()].some((size) => size > 1)) return undefined;

  const componentAdjacency = new Map<number, Set<number>>();
  for (let component = 0; component < componentCount; component += 1) {
    componentAdjacency.set(component, new Set());
  }
  for (const edge of graph.edges) {
    const source = components.get(edge.source);
    const target = components.get(edge.target);
    if (source !== undefined && target !== undefined && source !== target) {
      componentAdjacency.get(source)!.add(target);
    }
  }

  const hasIndirectPath = (source: number, target: number) => {
    const queued = [...(componentAdjacency.get(source) ?? [])]
      .filter((candidate) => candidate !== target);
    const visited = new Set([source, target]);
    while (queued.length > 0) {
      const current = queued.shift()!;
      if (current === target) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const candidate of componentAdjacency.get(current) ?? []) {
        if (!visited.has(candidate) || candidate === target) queued.push(candidate);
      }
    }
    return false;
  };

  const shortcuts = new Set(graph.edges.flatMap((edge) => {
    const source = components.get(edge.source);
    const target = components.get(edge.target);
    return source !== undefined && target !== undefined && source !== target &&
      hasIndirectPath(source, target)
      ? [edge.id]
      : [];
  }));
  const shortcutPairs = new Set(graph.edges.flatMap((edge) => {
    if (!shortcuts.has(edge.id)) return [];
    return [`${components.get(edge.source)}:${components.get(edge.target)}`];
  }));
  const backbone = new Map<number, Set<number>>();
  const reverse = new Map<number, Set<number>>();
  for (let component = 0; component < componentCount; component += 1) {
    backbone.set(component, new Set());
    reverse.set(component, new Set());
  }
  for (const [source, targets] of componentAdjacency) {
    for (const target of targets) {
      if (shortcutPairs.has(`${source}:${target}`)) continue;
      backbone.get(source)!.add(target);
      reverse.get(target)!.add(source);
    }
  }
  const longestDepth = (
    component: number,
    edges: ReadonlyMap<number, ReadonlySet<number>>,
    memo: Map<number, number>,
  ): number => {
    const cached = memo.get(component);
    if (cached !== undefined) return cached;
    const depth = Math.max(
      0,
      ...[...(edges.get(component) ?? [])]
        .map((next) => 1 + longestDepth(next, edges, memo)),
    );
    memo.set(component, depth);
    return depth;
  };
  const upstream = new Map<number, number>();
  const downstream = new Map<number, number>();
  const priorities = new Map(graph.edges.map((edge) => {
    if (shortcuts.has(edge.id)) return [edge.id, 0] as const;
    const source = components.get(edge.source)!;
    const target = components.get(edge.target)!;
    return [
      edge.id,
      longestDepth(source, reverse, upstream) + 1 +
      longestDepth(target, backbone, downstream),
    ] as const;
  }));
  const backboneEdges = graph.edges.filter((edge) =>
    edge.source !== edge.target && !shortcuts.has(edge.id)
  );
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of backboneEdges) {
    outgoing.get(edge.source)?.push(edge.target);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }
  const starts = graph.nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0);
  const linearBackbone = backboneEdges.length === graph.nodes.length - 1 &&
      starts.length === 1 &&
      [...outgoing.values()].every((targets) => targets.length <= 1) &&
      [...incoming.values()].every((count) => count <= 1)
    ? (() => {
        const ordered: string[] = [];
        const seen = new Set<string>();
        let current: string | undefined = starts[0]!.id;
        while (current !== undefined && !seen.has(current)) {
          ordered.push(current);
          seen.add(current);
          current = outgoing.get(current)?.[0];
        }
        return ordered.length === graph.nodes.length ? ordered : undefined;
      })()
    : undefined;
  return { shortcuts, priorities, linearBackbone };
};

const alignLinearBackboneNodes = (
  nodes: PositionedLayoutNode[],
  nodeIds: readonly string[] | undefined,
  direction: LayoutDirection,
) => {
  if (!nodeIds || nodes.some((node) => node.parentId !== undefined)) return;
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const members = nodeIds.flatMap((id) => {
    const node = nodesById.get(id);
    return node ? [node] : [];
  });
  if (members.length !== nodes.length) return;
  const horizontal = direction === "LR" || direction === "RL";
  const centers = members.map((node) => horizontal
    ? sideCenter(node.y, node.height)
    : sideCenter(node.x, node.width)
  ).sort((left, right) => left - right);
  const center = centers[Math.floor(centers.length / 2)]!;
  for (const node of members) {
    if (horizontal) node.y = center - Math.floor((node.height - 1) / 2);
    else node.x = center - Math.floor((node.width - 1) / 2);
  }
};

type ElkPortSide = "NORTH" | "EAST" | "SOUTH" | "WEST";

const endpointPortSide = (
  direction: LayoutDirection,
  selfLoop: boolean,
  source: boolean,
): ElkPortSide => {
  if (selfLoop) return direction === "LR" || direction === "RL" ? "NORTH" : "EAST";
  if (direction === "LR") return source ? "EAST" : "WEST";
  if (direction === "RL") return source ? "WEST" : "EAST";
  if (direction === "BT") return source ? "NORTH" : "SOUTH";
  return source ? "SOUTH" : "NORTH";
};

const createIndependentPorts = (graph: LayoutGraph) => {
  const independentNodes = new Set(
    graph.nodes
      .filter((node) => node.portAllocation === "independent")
      .map((node) => node.id),
  );
  const portsByNode = new Map<string, ElkPort[]>();
  const edgePorts = new Map<string, { source?: string; target?: string }>();
  const requests: Array<{
    edgeId: string;
    nodeId: string;
    end: "source" | "target";
    side: ElkPortSide;
  }> = [];
  const sideCounts = new Map<string, number>();

  const requestPort = (
    edgeId: string,
    nodeId: string,
    end: "source" | "target",
    side: ElkPortSide,
  ) => {
    if (!independentNodes.has(nodeId)) return;
    requests.push({ edgeId, nodeId, end, side });
    const sideKey = `${nodeId}:${side}`;
    sideCounts.set(sideKey, (sideCounts.get(sideKey) ?? 0) + 1);
  };

  for (const edge of graph.edges) {
    const selfLoop = edge.source === edge.target;
    requestPort(
      edge.id,
      edge.source,
      "source",
      endpointPortSide(graph.direction, selfLoop, true),
    );
    requestPort(
      edge.id,
      edge.target,
      "target",
      endpointPortSide(graph.direction, selfLoop, false),
    );
  }

  const sideIndexes = new Map<string, number>();
  for (const { edgeId, nodeId, end, side } of requests) {
    const sideKey = `${nodeId}:${side}`;
    const logicalIndex = sideIndexes.get(sideKey) ?? 0;
    sideIndexes.set(sideKey, logicalIndex + 1);
    const index = side === "SOUTH" || side === "WEST"
      ? sideCounts.get(sideKey)! - logicalIndex - 1
      : logicalIndex;
    const id = `${edgeId}:${end}-port`;
    const ports = portsByNode.get(nodeId) ?? [];
    ports.push({
      id,
      width: 1,
      height: 1,
      layoutOptions: {
        "elk.port.side": side,
        "elk.port.index": String(index),
      },
    });
    portsByNode.set(nodeId, ports);
    edgePorts.set(edgeId, { ...edgePorts.get(edgeId), [end]: id });
  }
  return { portsByNode, edgePorts };
};

export const toElkGraph = (graph: LayoutGraph): ElkNode => {
  const { portsByNode, edgePorts } = createIndependentPorts(graph);
  const alignment = graph.pathAlignment === "topology"
    ? topologyAlignment(graph)
    : undefined;
  const directNodes = new Map<string | undefined, LayoutNode[]>();
  for (const node of graph.nodes) {
    const siblings = directNodes.get(node.parentId) ?? [];
    siblings.push(node);
    directNodes.set(node.parentId, siblings);
  }

  const directGroups = new Map<string | undefined, typeof graph.groups>();
  for (const group of graph.groups) {
    const siblings = directGroups.get(group.parentId) ?? [];
    siblings.push(group);
    directGroups.set(group.parentId, siblings);
  }

  const groupParents = new Map(graph.groups.map((group) => [group.id, group.parentId]));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const groupPadding = new Map(graph.groups.map((group) => [group.id, {
    top: 2,
    right: 2,
    bottom: 2,
    left: 2,
  }]));
  const reserveEndpointLabel = (
    nodeId: string,
    endpointLabel: LayoutLabel | undefined,
  ) => {
    const parentId = nodesById.get(nodeId)?.parentId;
    const padding = parentId ? groupPadding.get(parentId) : undefined;
    if (!padding || !endpointLabel) return;
    if (graph.direction === "LR" || graph.direction === "RL") {
      padding.top = Math.max(padding.top, endpointLabel.height + 1);
    } else {
      padding.right = Math.max(padding.right, endpointLabel.width + 1);
    }
  };
  for (const edge of graph.edges) {
    reserveEndpointLabel(edge.source, edge.sourceLabel);
    reserveEndpointLabel(edge.target, edge.targetLabel);
  }
  const ancestors = (parentId: string | undefined) => {
    const result: Array<string | undefined> = [];
    let current = parentId;
    while (current !== undefined) {
      result.push(current);
      current = groupParents.get(current);
    }
    result.push(undefined);
    return result;
  };
  const edgeContainer = (source: string, target: string) => {
    const sourceAncestors = ancestors(nodesById.get(source)?.parentId);
    const targetAncestors = new Set(ancestors(nodesById.get(target)?.parentId));
    return sourceAncestors.find((candidate) => targetAncestors.has(candidate));
  };
  const directEdges = new Map<string | undefined, ElkExtendedEdge[]>();
  for (const edge of graph.edges) {
    const ports = edgePorts.get(edge.id);
    const elkEdge: ElkExtendedEdge = {
      id: edge.id,
      sources: [ports?.source ?? edge.source],
      targets: [ports?.target ?? edge.target],
      layoutOptions: alignment
        ? {
            "elk.layered.priority.straightness": String(
              alignment.priorities.get(edge.id) === 0
                ? 0
                : 10 + (alignment.priorities.get(edge.id) ?? 0),
            ),
          }
        : undefined,
      labels: edge.label && edge.labelLayout !== "route"
        ? [label(`${edge.id}:label`, edge.label)]
        : undefined,
    };
    const container = edgeContainer(edge.source, edge.target);
    const siblings = directEdges.get(container) ?? [];
    siblings.push(elkEdge);
    directEdges.set(container, siblings);
  }

  const childrenFor = (parentId?: string): ElkNode[] => [
    ...(directGroups.get(parentId) ?? []).map((group): ElkNode => ({
      id: group.id,
      labels: [label(`${group.id}:label`, {
        text: group.label,
        width: getTextCellWidth(group.label),
        height: 1,
      })],
      children: childrenFor(group.id),
      edges: directEdges.get(group.id),
      layoutOptions: {
        ...rootOptions(
          graph.direction,
          graph.spacing,
          graph.cycleBreaking,
          graph.nodeAlignment,
        ),
        "elk.padding": (() => {
          const padding = groupPadding.get(group.id)!;
          return `[top=${padding.top},left=${padding.left},bottom=${padding.bottom},right=${padding.right}]`;
        })(),
      },
    })),
    ...(directNodes.get(parentId) ?? []).map((node): ElkNode => ({
      id: node.id,
      width: node.width,
      height: node.height,
      ports: portsByNode.get(node.id),
      layoutOptions: {
        ...rankOptions(node),
        ...(portsByNode.has(node.id)
          ? { "elk.portConstraints": "FIXED_ORDER" }
          : {}),
      },
    })),
  ];

  return {
    id: "layout:root",
    children: childrenFor(undefined),
    edges: directEdges.get(undefined),
    layoutOptions: rootOptions(
      graph.direction,
      graph.spacing,
      graph.cycleBreaking,
      graph.nodeAlignment,
    ),
  };
};

const appendPoint = (points: GridPoint[], point: GridPoint) => {
  const previous = points.at(-1);
  if (!previous || previous.x !== point.x || previous.y !== point.y) points.push(point);
};

const simplifyOrthogonal = (
  points: GridPoint[],
  protectedPoints: GridPoint[] = [],
) => points.filter((point, index, values) => {
  if (index === 0 || index === values.length - 1) return true;
  if (protectedPoints.some((protectedPoint) =>
    protectedPoint.x === point.x && protectedPoint.y === point.y)) return true;
  const previous = values[index - 1]!;
  const next = values[index + 1]!;
  return !(
    (previous.x === point.x && point.x === next.x) ||
    (previous.y === point.y && point.y === next.y)
  );
});

const sideOutward: Record<GridSide, GridPoint> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

const sideAxis = (side: GridSide): "horizontal" | "vertical" =>
  side === "left" || side === "right" ? "horizontal" : "vertical";

const fallbackSide = (
  layoutDirection: LayoutDirection,
  source: boolean,
): GridSide => {
  if (layoutDirection === "LR") return source ? "right" : "left";
  if (layoutDirection === "RL") return source ? "left" : "right";
  if (layoutDirection === "BT") return source ? "top" : "bottom";
  return source ? "bottom" : "top";
};

const routeSide = (endpoint: ElkPoint, adjacent: ElkPoint): GridSide | undefined => {
  const dx = adjacent.x - endpoint.x;
  const dy = adjacent.y - endpoint.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  if (Math.abs(dy) > Math.abs(dx)) return dy > 0 ? "bottom" : "top";
  return undefined;
};

const nearestNodeSide = (
  endpoint: ElkPoint,
  adjacent: ElkPoint,
  node: { x: number; y: number; width: number; height: number },
  layoutDirection: LayoutDirection,
  source: boolean,
): GridSide => {
  const distances: Record<GridSide, number> = {
    top: Math.abs(endpoint.y - node.y),
    right: Math.abs(endpoint.x - (node.x + node.width)),
    bottom: Math.abs(endpoint.y - (node.y + node.height)),
    left: Math.abs(endpoint.x - node.x),
  };
  const minimum = Math.min(...Object.values(distances));
  const candidates = (Object.keys(distances) as GridSide[])
    .filter((side) => Math.abs(distances[side] - minimum) < 0.001);
  const routed = routeSide(endpoint, adjacent);
  if (routed && candidates.includes(routed)) return routed;
  const fallback = fallbackSide(layoutDirection, source);
  return candidates.includes(fallback) ? fallback : candidates[0]!;
};

const sideCenter = (start: number, size: number) =>
  start + Math.floor((size - 1) / 2);

const distributedCoordinate = (value: number, start: number, size: number) => {
  const coordinate = quantizeCoordinate(value);
  if (size <= 2) return sideCenter(start, size);
  return Math.max(start + 1, Math.min(start + size - 2, coordinate));
};

const endpointFor = (
  point: ElkPoint,
  node: PositionedLayoutNode,
  side: GridSide,
  attachmentCount: number,
): PositionedEdgeEndpoint => {
  const outward = sideOutward[side];
  const distributed = node.portPlacement === "distributed" ||
    (node.portPlacement === "adaptive" && attachmentCount > 1);
  const anchor = side === "left" || side === "right"
    ? {
        x: side === "left" ? node.x : node.x + node.width - 1,
        y: distributed
          ? distributedCoordinate(point.y, node.y, node.height)
          : sideCenter(node.y, node.height),
      }
    : {
        x: distributed
          ? distributedCoordinate(point.x, node.x, node.width)
          : sideCenter(node.x, node.width),
        y: side === "top" ? node.y : node.y + node.height - 1,
      };
  return {
    side,
    anchor,
    marker: { x: anchor.x + outward.x, y: anchor.y + outward.y },
    outward,
  };
};

type RouteAxis = "horizontal" | "vertical";

const appendConnection = (
  points: GridPoint[],
  to: GridPoint,
  startAxis?: RouteAxis,
  endAxis?: RouteAxis,
) => {
  const from = points.at(-1);
  if (!from || from.x === to.x || from.y === to.y) {
    appendPoint(points, to);
    return;
  }
  if (startAxis && endAxis && startAxis === endAxis) {
    if (startAxis === "horizontal") {
      const middleX = Math.floor((from.x + to.x) / 2);
      appendPoint(points, { x: middleX, y: from.y });
      appendPoint(points, { x: middleX, y: to.y });
    } else {
      const middleY = Math.floor((from.y + to.y) / 2);
      appendPoint(points, { x: from.x, y: middleY });
      appendPoint(points, { x: to.x, y: middleY });
    }
  } else if (startAxis === "vertical" || endAxis === "horizontal") {
    appendPoint(points, { x: from.x, y: to.y });
  } else {
    appendPoint(points, { x: to.x, y: from.y });
  }
  appendPoint(points, to);
};

const pointOutsideEndpoint = (
  endpoint: PositionedEdgeEndpoint,
  clearance = 0,
) => ({
  x: endpoint.anchor.x + endpoint.outward.x * Math.max(1, clearance + 1),
  y: endpoint.anchor.y + endpoint.outward.y * Math.max(1, clearance + 1),
});

const routeWithEndpoints = (
  points: GridPoint[],
  source: PositionedEdgeEndpoint,
  target: PositionedEdgeEndpoint,
  sourceClearance = 0,
  targetClearance = 0,
): GridPoint[] => {
  const waypoints = [
    source.anchor,
    pointOutsideEndpoint(source, sourceClearance),
    ...points.slice(1, -1),
    pointOutsideEndpoint(target, targetClearance),
    target.anchor,
  ];
  const result: GridPoint[] = [waypoints[0]!];
  for (let index = 1; index < waypoints.length; index += 1) {
    appendConnection(
      result,
      waypoints[index]!,
      index === 2 ? sideAxis(source.side) : undefined,
      index === waypoints.length - 2 ? sideAxis(target.side) : undefined,
    );
  }
  return simplifyOrthogonal(result, [waypoints[1]!, waypoints.at(-2)!]);
};

const compactSelfLoop = (
  points: GridPoint[],
  source: PositionedEdgeEndpoint,
  target: PositionedEdgeEndpoint,
  sourceClearance = 0,
  targetClearance = 0,
) => {
  if (source.side !== target.side) return points;
  const clearance = Math.max(sourceClearance, targetClearance);
  const sourceExit = pointOutsideEndpoint(source, clearance);
  const targetExit = pointOutsideEndpoint(target, clearance);
  if (sourceExit.x === targetExit.x && sourceExit.y === targetExit.y) return points;
  return simplifyOrthogonal([
    source.anchor,
    sourceExit,
    targetExit,
    target.anchor,
  ], [sourceExit, targetExit]);
};

const canonicalCompactSelfEndpoints = (
  node: PositionedLayoutNode,
  direction: LayoutDirection,
  lane = 0,
): [PositionedEdgeEndpoint, PositionedEdgeEndpoint] => {
  const horizontal = direction === "LR" || direction === "RL";
  const sides: GridSide[] = horizontal
    ? ["top", "bottom", "right", "left"]
    : ["right", "left", "bottom", "top"];
  const side = sides[lane % sides.length]!;
  if (side === "top" || side === "bottom") {
    const first = Math.min(node.x + node.width - 1, node.x + 1);
    const second = Math.max(first + 1, node.x + node.width - 2);
    return [
      endpointOnSideAt(node, side, first),
      endpointOnSideAt(node, side, Math.min(second, node.x + node.width - 1)),
    ];
  }
  return [
    endpointOnSideAt(node, side, node.y),
    endpointOnSideAt(node, side, node.y + node.height - 1),
  ];
};

const edgePoints = (edge: ElkExtendedEdge, offset: ElkPoint): ElkPoint[] => {
  const section = edge.sections?.[0];
  if (!section) return [];
  return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
    .map((point) => ({ x: point.x + offset.x, y: point.y + offset.y }));
};

const labelPosition = (
  edge: ElkGraphElement,
  offset: ElkPoint,
): GridPoint | undefined => {
  const first = edge.labels?.[0];
  if (first?.x === undefined || first.y === undefined) return undefined;
  return {
    x: quantizeCoordinate(offset.x + first.x),
    y: quantizeCoordinate(offset.y + first.y),
  };
};

interface RoutedEdge extends PositionedLayoutEdge {
  elkLabelPosition?: GridPoint;
}

type StructuredBundleKind = "fan-in" | "fan-out";

const samePoint = (left: GridPoint, right: GridPoint) =>
  left.x === right.x && left.y === right.y;

const compactOrthogonalPoints = (points: GridPoint[]) => {
  const unique = points.filter((point, index) =>
    index === 0 || !samePoint(point, points[index - 1]!)
  );
  return unique.filter((point, index) => {
    const previous = unique[index - 1];
    const next = unique[index + 1];
    if (!previous || !next) return true;
    return !(
      (previous.x === point.x && point.x === next.x) ||
      (previous.y === point.y && point.y === next.y)
    );
  });
};

const cellsOnRoute = (points: GridPoint[]) => {
  const cells: GridPoint[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    if (from.x !== to.x && from.y !== to.y) return [];
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    let current = { ...from };
    cells.push(current);
    while (!samePoint(current, to)) {
      current = { x: current.x + dx, y: current.y + dy };
      cells.push(current);
    }
  }
  return cells;
};

const routeAxisCells = (points: GridPoint[]) => {
  const result = new Map<string, Set<RouteAxis>>();
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    if (from.x !== to.x && from.y !== to.y) continue;
    const axis: RouteAxis = from.y === to.y ? "horizontal" : "vertical";
    for (const point of cellsOnRoute([from, to])) {
      const key = pointKey(point);
      const axes = result.get(key) ?? new Set<RouteAxis>();
      axes.add(axis);
      result.set(key, axes);
    }
  }
  return result;
};

const routeEntersForeignNode = (
  edge: RoutedEdge,
  points: GridPoint[],
  nodes: PositionedLayoutNode[],
) => cellsOnRoute(points).some((point) => nodes.some((node) => {
  const inside = point.x >= node.x && point.x < node.x + node.width &&
    point.y >= node.y && point.y < node.y + node.height;
  if (!inside) return false;
  if (node.id === edge.source && samePoint(point, edge.sourceEndpoint.anchor)) {
    return false;
  }
  if (node.id === edge.target && samePoint(point, edge.targetEndpoint.anchor)) {
    return false;
  }
  return true;
}));

const structuredBusRoute = (
  edge: RoutedEdge,
  kind: StructuredBundleKind,
  busCoordinate: number,
  vertical: boolean,
) => {
  const common = kind === "fan-out" ? edge.sourceEndpoint : edge.targetEndpoint;
  const branch = kind === "fan-out" ? edge.targetEndpoint : edge.sourceEndpoint;
  const commonJunction = vertical
    ? { x: common.marker.x, y: busCoordinate }
    : { x: busCoordinate, y: common.marker.y };
  const branchJunction = vertical
    ? { x: branch.marker.x, y: busCoordinate }
    : { x: busCoordinate, y: branch.marker.y };
  return compactOrthogonalPoints(kind === "fan-out"
    ? [
        edge.sourceEndpoint.anchor,
        edge.sourceEndpoint.marker,
        commonJunction,
        branchJunction,
        edge.targetEndpoint.marker,
        edge.targetEndpoint.anchor,
      ]
    : [
        edge.sourceEndpoint.anchor,
        edge.sourceEndpoint.marker,
        branchJunction,
        commonJunction,
        edge.targetEndpoint.marker,
        edge.targetEndpoint.anchor,
      ]);
};

const normalizeStructuredBundles = (
  edges: RoutedEdge[],
  nodes: PositionedLayoutNode[],
  direction: LayoutDirection,
) => {
  const vertical = direction === "TD" || direction === "TB" || direction === "BT";
  const sourceSide: GridSide = direction === "LR"
    ? "right"
    : direction === "RL"
      ? "left"
      : direction === "BT"
        ? "top"
        : "bottom";
  const targetSide: GridSide = sourceSide === "right"
    ? "left"
    : sourceSide === "left"
      ? "right"
      : sourceSide === "top"
        ? "bottom"
        : "top";
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const sourceCounts = new Map<string, number>();
  const targetCounts = new Map<string, number>();
  for (const edge of edges) {
    sourceCounts.set(edge.source, (sourceCounts.get(edge.source) ?? 0) + 1);
    targetCounts.set(edge.target, (targetCounts.get(edge.target) ?? 0) + 1);
  }
  const used = new Set<string>();
  let result = [...edges];

  const group = (kind: StructuredBundleKind) => {
    const candidates = new Map<string, RoutedEdge[]>();
    for (const edge of result) {
      if (
        used.has(edge.id) ||
        edge.source === edge.target ||
        edge.sourceLabel ||
        edge.targetLabel ||
        edge.routing?.bundle !== "structured" ||
        edge.routing?.topology === "independent"
      ) continue;
      const sharedNodeId = kind === "fan-out" ? edge.source : edge.target;
      const branchNodeId = kind === "fan-out" ? edge.target : edge.source;
      const branchNode = nodesById.get(branchNodeId);
      if (!branchNode) continue;
      const branchRank = vertical ? branchNode.y : branchNode.x;
      const key = [
        sharedNodeId,
        edge.routing.bundleKey ?? "default",
        branchRank,
      ].join("\0");
      const members = candidates.get(key) ?? [];
      members.push(edge);
      candidates.set(key, members);
    }

    for (const members of candidates.values()) {
      if (members.length < 2) continue;
      if (members.some((edge) => kind === "fan-out"
        ? (targetCounts.get(edge.target) ?? 0) > 1
        : (sourceCounts.get(edge.source) ?? 0) > 1
      )) continue;
      const sharedNodeId = kind === "fan-out"
        ? members[0]!.source
        : members[0]!.target;
      const sharedNode = nodesById.get(sharedNodeId);
      if (!sharedNode) continue;
      const otherNodes = members.map((edge) => nodesById.get(
        kind === "fan-out" ? edge.target : edge.source,
      ));
      if (otherNodes.some((node) => !node)) continue;
      const parentIds = new Set([sharedNode, ...otherNodes]
        .map((node) => node?.parentId));
      if (parentIds.size !== 1) continue;

      const canonicalMembers = members.map((edge) => ({
        ...edge,
        sourceEndpoint: endpointOnSide(nodesById.get(edge.source)!, sourceSide),
        targetEndpoint: endpointOnSide(nodesById.get(edge.target)!, targetSide),
      }));
      const commonEndpoints = canonicalMembers.map((edge) =>
        kind === "fan-out" ? edge.sourceEndpoint : edge.targetEndpoint
      );
      const branchEndpoints = canonicalMembers.map((edge) =>
        kind === "fan-out" ? edge.targetEndpoint : edge.sourceEndpoint
      );
      const commonSide = commonEndpoints[0]?.side;
      const branchSide = branchEndpoints[0]?.side;
      if (
        !commonSide ||
        !branchSide ||
        commonEndpoints.some((endpoint) => endpoint.side !== commonSide) ||
        branchEndpoints.some((endpoint) => endpoint.side !== branchSide)
      ) continue;

      const branchRanks = branchEndpoints.map((endpoint) =>
        vertical ? endpoint.marker.y : endpoint.marker.x
      );
      const commonRank = vertical
        ? commonEndpoints[0]!.marker.y
        : commonEndpoints[0]!.marker.x;
      const branchDirections = new Set(branchRanks.map((rank) =>
        Math.sign(rank - commonRank)
      ));
      if (branchDirections.size !== 1 || branchDirections.has(0)) continue;
      const branchDirection = [...branchDirections][0]!;
      const nearestDistance = Math.min(...branchRanks.map((rank) =>
        Math.abs(rank - commonRank)
      ));
      if (nearestDistance < 2) continue;
      const busCoordinate = commonRank + branchDirection *
        Math.max(1, Math.floor(nearestDistance / 2));
      const sharedEndpoint = commonEndpoints[0]!;
      const normalizedMembers = canonicalMembers.map((edge) => kind === "fan-out"
        ? { ...edge, sourceEndpoint: sharedEndpoint }
        : { ...edge, targetEndpoint: sharedEndpoint });
      const routes = normalizedMembers.map((edge) => structuredBusRoute(
        edge,
        kind,
        busCoordinate,
        vertical,
      ));
      if (routes.some((route, index) =>
        routeEntersForeignNode(normalizedMembers[index]!, route, nodes)
      )) continue;

      const bundleId = [
        "bundle",
        kind,
        sharedNodeId,
        members[0]!.routing?.bundleKey ?? "default",
      ].join(":");
      const normalizedById = new Map(normalizedMembers.map((edge, index) => [
        edge.id,
        { edge, points: routes[index]! },
      ]));
      result = result.map((edge) => normalizedById.has(edge.id)
        ? {
            ...normalizedById.get(edge.id)!.edge,
            points: normalizedById.get(edge.id)!.points,
            routing: { ...edge.routing, topology: "shared", bundleId },
          }
        : edge);
      members.forEach((edge) => used.add(edge.id));
    }
  };

  group("fan-out");
  group("fan-in");
  return result;
};

const endpointOnSide = (
  node: PositionedLayoutNode,
  side: GridSide,
): PositionedEdgeEndpoint => {
  const outward = sideOutward[side];
  const anchor = side === "left" || side === "right"
    ? {
        x: side === "left" ? node.x : node.x + node.width - 1,
        y: sideCenter(node.y, node.height),
      }
    : {
        x: sideCenter(node.x, node.width),
        y: side === "top" ? node.y : node.y + node.height - 1,
      };
  return {
    side,
    anchor,
    marker: { x: anchor.x + outward.x, y: anchor.y + outward.y },
    outward,
  };
};

const endpointOnSideAt = (
  node: PositionedLayoutNode,
  side: GridSide,
  coordinate: number,
): PositionedEdgeEndpoint => {
  const endpoint = endpointOnSide(node, side);
  const anchor = side === "left" || side === "right"
    ? { x: endpoint.anchor.x, y: coordinate }
    : { x: coordinate, y: endpoint.anchor.y };
  return {
    ...endpoint,
    anchor,
    marker: {
      x: anchor.x + endpoint.outward.x,
      y: anchor.y + endpoint.outward.y,
    },
  };
};

const attachmentCoordinateRange = (
  node: PositionedLayoutNode,
  vertical: boolean,
) => {
  const start = vertical ? node.x : node.y;
  const size = vertical ? node.width : node.height;
  const center = sideCenter(start, size);
  return size <= 2
    ? { minimum: center, maximum: center }
    : { minimum: start + 1, maximum: start + size - 2 };
};

const alignReadableEndpoints = (
  edges: RoutedEdge[],
  nodes: PositionedLayoutNode[],
) => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return edges.map((edge) => {
    if (
      edge.routing?.quality !== "readable" ||
      edge.routing.bundleId ||
      edge.source === edge.target ||
      edge.sourceEndpoint.outward.x !== -edge.targetEndpoint.outward.x ||
      edge.sourceEndpoint.outward.y !== -edge.targetEndpoint.outward.y
    ) return edge;
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) return edge;
    const vertical = edge.sourceEndpoint.side === "top" ||
      edge.sourceEndpoint.side === "bottom";
    const sourceRange = attachmentCoordinateRange(source, vertical);
    const targetRange = attachmentCoordinateRange(target, vertical);
    const minimum = Math.max(sourceRange.minimum, targetRange.minimum);
    const maximum = Math.min(sourceRange.maximum, targetRange.maximum);
    if (minimum > maximum) return edge;
    const preferred = vertical
      ? Math.round((edge.sourceEndpoint.anchor.x + edge.targetEndpoint.anchor.x) / 2)
      : Math.round((edge.sourceEndpoint.anchor.y + edge.targetEndpoint.anchor.y) / 2);
    const coordinate = Math.max(minimum, Math.min(maximum, preferred));
    const sourceEndpoint = endpointOnSideAt(
      source,
      edge.sourceEndpoint.side,
      coordinate,
    );
    const targetEndpoint = endpointOnSideAt(
      target,
      edge.targetEndpoint.side,
      coordinate,
    );
    return {
      ...edge,
      sourceEndpoint,
      targetEndpoint,
      points: routeWithEndpoints(
        edge.points,
        sourceEndpoint,
        targetEndpoint,
        edge.routing.sourceClearance,
        edge.routing.targetClearance,
      ),
    };
  });
};

const shortDoglegCount = (points: GridPoint[]) => {
  const compact = compactOrthogonalPoints(points);
  let count = 0;
  for (let index = 1; index < compact.length - 2; index += 1) {
    const from = compact[index]!;
    const to = compact[index + 1]!;
    if (Math.abs(to.x - from.x) + Math.abs(to.y - from.y) < 2) count += 1;
  }
  return count;
};

const terminalDoglegCount = (
  points: GridPoint[],
  sourceMinimum = 0,
  targetMinimum = 0,
) => {
  const compact = compactOrthogonalPoints(points);
  if (compact.length <= 2) return 0;
  const first = compact[0]!;
  const second = compact[1]!;
  const penultimate = compact.at(-2)!;
  const last = compact.at(-1)!;
  const sourceLength = Math.abs(second.x - first.x) +
    Math.abs(second.y - first.y);
  const targetLength = Math.abs(last.x - penultimate.x) +
    Math.abs(last.y - penultimate.y);
  return Number(sourceLength < sourceMinimum) +
    Number(targetLength < targetMinimum);
};

const terminalMinimums = (edge: RoutedEdge) => ({
  source: (edge.routing?.sourceClearance ?? 0) + 2,
  target: (edge.routing?.targetClearance ?? 0) + 2,
});

const routeQuality = (
  points: GridPoint[],
  order = 0,
  terminalMinimum = { source: 0, target: 0 },
) => {
  const compact = compactOrthogonalPoints(points);
  const length = compact.slice(1).reduce((total, point, index) => {
    const previous = compact[index]!;
    return total + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
  }, 0);
  const xs = compact.map((point) => point.x);
  const ys = compact.map((point) => point.y);
  const area = (Math.max(...xs) - Math.min(...xs) + 1) *
    (Math.max(...ys) - Math.min(...ys) + 1);
  return [
    terminalDoglegCount(
      compact,
      terminalMinimum.source,
      terminalMinimum.target,
    ),
    shortDoglegCount(compact),
    Math.max(0, compact.length - 2),
    length,
    area,
    order,
  ] as const;
};

const compareQuality = (
  left: readonly number[],
  right: readonly number[],
) => {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

const endpointSlotsOnSide = (
  node: PositionedLayoutNode,
  side: GridSide,
) => {
  const vertical = side === "left" || side === "right";
  const start = vertical ? node.y : node.x;
  const size = vertical ? node.height : node.width;
  const center = sideCenter(start, size);
  const coordinates = size <= 2
    ? [center]
    : Array.from({ length: size - 2 }, (_, index) => start + index + 1)
      .sort((left, right) =>
        Math.abs(left - center) - Math.abs(right - center) || left - right
      );
  return coordinates.map((coordinate) => endpointOnSideAt(node, side, coordinate));
};

const rerouteEndpoint = (
  edge: RoutedEdge,
  end: "source" | "target",
  endpoint: PositionedEdgeEndpoint,
): RoutedEdge => {
  const sourceEndpoint = end === "source" ? endpoint : edge.sourceEndpoint;
  const targetEndpoint = end === "target" ? endpoint : edge.targetEndpoint;
  return {
    ...edge,
    sourceEndpoint,
    targetEndpoint,
    points: routeWithEndpoints(
      edge.points,
      sourceEndpoint,
      targetEndpoint,
      edge.routing?.sourceClearance,
      edge.routing?.targetClearance,
    ),
  };
};

const preferredOverflowSide = (
  edge: RoutedEdge,
  endpoint: PositionedEdgeEndpoint,
  node: PositionedLayoutNode,
): GridSide | undefined => {
  const horizontal = endpoint.side === "left" || endpoint.side === "right";
  const center = horizontal
    ? sideCenter(node.y, node.height)
    : sideCenter(node.x, node.width);
  const coordinates = edge.points.map((point) => horizontal ? point.y : point.x);
  const before = center - Math.min(...coordinates);
  const after = Math.max(...coordinates) - center;
  if (before === after) return undefined;
  if (horizontal) return before > after ? "top" : "bottom";
  return before > after ? "left" : "right";
};

const endpointTerminalKeys = (
  edge: RoutedEdge,
  end: "source" | "target",
  endpoint: PositionedEdgeEndpoint,
) => {
  const clearance = end === "source"
    ? edge.routing?.sourceClearance
    : edge.routing?.targetClearance;
  return Array.from(
    { length: Math.max(2, (clearance ?? 0) + 2) },
    (_, index) => pointKey({
      x: endpoint.anchor.x + endpoint.outward.x * (index + 1),
      y: endpoint.anchor.y + endpoint.outward.y * (index + 1),
    }),
  );
};

const terminalKeyHitsForeignNode = (
  key: string,
  edge: RoutedEdge,
  end: "source" | "target",
  nodes: PositionedLayoutNode[],
) => {
  const comma = key.indexOf(",");
  const point = {
    x: Number(key.slice(0, comma)),
    y: Number(key.slice(comma + 1)),
  };
  const owner = end === "source" ? edge.source : edge.target;
  return nodes.some((node) =>
    node.id !== owner &&
    point.x >= node.x && point.x < node.x + node.width &&
    point.y >= node.y && point.y < node.y + node.height
  );
};

const separateConflictingEndpointMarkers = (
  edges: RoutedEdge[],
  nodes: PositionedLayoutNode[],
  edgePriorities: ReadonlyMap<string, number>,
) => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const result = [...edges];
  for (let pass = 0; pass < edges.length * 2; pass += 1) {
    const endpoints = new Map<string, Array<{
      index: number;
      end: "source" | "target";
    }>>();
    result.forEach((edge, index) => {
      for (const [end, endpoint] of [
        ["source", edge.sourceEndpoint],
        ["target", edge.targetEndpoint],
      ] as const) {
        for (const key of endpointTerminalKeys(edge, end, endpoint)) {
          const records = endpoints.get(key) ?? [];
          records.push({ index, end });
          endpoints.set(key, records);
        }
      }
    });
    const conflict = [...endpoints].find(([key, records]) => {
      const owners = new Set(records.map((record) => {
        const edge = result[record.index]!;
        return edge.routing?.bundleId ?? edge.id;
      }));
      return owners.size > 1 || records.some((record) =>
        terminalKeyHitsForeignNode(
          key,
          result[record.index]!,
          record.end,
          nodes,
        )
      );
    })?.[1];
    if (!conflict) break;
    const recordsByOwner = new Map<string, typeof conflict>();
    for (const record of conflict) {
      const edge = result[record.index]!;
      const owner = edge.routing?.bundleId ?? edge.id;
      const records = recordsByOwner.get(owner) ?? [];
      records.push(record);
      recordsByOwner.set(owner, records);
    }
    const owners = [...recordsByOwner].map(([owner, records], order) => {
      const ownerEdges = records.map((record) => result[record.index]!);
      const alignment = records.reduce((total, record) => {
        const ownerEdge = result[record.index]!;
        const endpoint = record.end === "source"
          ? ownerEdge.sourceEndpoint
          : ownerEdge.targetEndpoint;
        const node = nodesById.get(
          record.end === "source" ? ownerEdge.source : ownerEdge.target,
        );
        const neighbor = nodesById.get(
          record.end === "source" ? ownerEdge.target : ownerEdge.source,
        );
        if (!node || !neighbor) return total;
        const horizontal = endpoint.side === "left" || endpoint.side === "right";
        const nodeCenter = horizontal
          ? sideCenter(node.y, node.height)
          : sideCenter(node.x, node.width);
        const neighborCenter = horizontal
          ? sideCenter(neighbor.y, neighbor.height)
          : sideCenter(neighbor.x, neighbor.width);
        return total + Math.abs(nodeCenter - neighborCenter);
      }, 0);
      const quality = ownerEdges.reduce<number[]>((total, ownerEdge) => {
        const current = routeQuality(
          ownerEdge.points,
          0,
          terminalMinimums(ownerEdge),
        );
        return current.map((value, index) => value + (total[index] ?? 0));
      }, []);
      return {
        owner,
        records,
        priority: Math.max(...ownerEdges.map((ownerEdge) =>
          edgePriorities.get(ownerEdge.id) ?? 1
        )),
        quality: [alignment, ...quality, order],
      };
    }).sort((left, right) =>
      right.priority - left.priority ||
      compareQuality(left.quality, right.quality)
    );
    const movable = owners.slice(1).sort((left, right) =>
      right.priority - left.priority ||
      compareQuality(left.quality, right.quality)
    )[0];
    if (!movable) break;
    const representative = movable.records[0]!;
    const edge = result[representative.index]!;
    const nodeId = representative.end === "source" ? edge.source : edge.target;
    const node = nodesById.get(nodeId);
    if (!node) break;
    const originalEndpoint = representative.end === "source"
      ? edge.sourceEndpoint
      : edge.targetEndpoint;
    const preferredSide = preferredOverflowSide(edge, originalEndpoint, node);
    const perpendicularSides: GridSide[] = originalEndpoint.side === "left" ||
      originalEndpoint.side === "right"
      ? ["top", "bottom"]
      : ["left", "right"];
    const candidates = [originalEndpoint.side, ...perpendicularSides]
      .flatMap((side) => endpointSlotsOnSide(node, side))
      .filter((candidate) => {
        return movable.records.every((record) =>
          endpointTerminalKeys(
            result[record.index]!,
            record.end,
            candidate,
          ).every((key) =>
            !terminalKeyHitsForeignNode(
              key,
              result[record.index]!,
              record.end,
              nodes,
            ) && (endpoints.get(key) ?? []).every((occupied) => {
              const occupiedEdge = result[occupied.index]!;
              return (occupiedEdge.routing?.bundleId ?? occupiedEdge.id) === movable.owner;
            })
          )
        );
      })
      .map((candidate, order) => {
        const quality = movable.records.reduce<number[]>((total, record) => {
          const rerouted = rerouteEndpoint(result[record.index]!, record.end, candidate);
          const current = routeQuality(
            rerouted.points,
            0,
            terminalMinimums(rerouted),
          );
          return current.map((value, index) => value + (total[index] ?? 0));
        }, []);
        const sideMismatch = candidate.side === originalEndpoint.side ||
          candidate.side === preferredSide
          ? 0
          : 1;
        return { candidate, quality: [sideMismatch, ...quality, order] };
      })
      .sort((left, right) => compareQuality(left.quality, right.quality));
    const replacement = candidates[0]?.candidate;
    if (!replacement) break;
    for (const record of movable.records) {
      result[record.index] = rerouteEndpoint(
        result[record.index]!,
        record.end,
        replacement,
      );
    }
  }
  return result;
};

type RouteDirection = 0 | 1 | 2 | 3;

const routeSteps: ReadonlyArray<GridPoint & { direction: RouteDirection }> = [
  { x: 1, y: 0, direction: 0 },
  { x: 0, y: 1, direction: 1 },
  { x: -1, y: 0, direction: 2 },
  { x: 0, y: -1, direction: 3 },
];

const routeDirectionFor = (vector: GridPoint): RouteDirection => {
  const direction = routeSteps.find((step) =>
    step.x === vector.x && step.y === vector.y
  )?.direction;
  if (direction === undefined) throw new Error("Invalid route direction vector");
  return direction;
};

interface OrthogonalRouteOptions {
  initialDirection?: RouteDirection;
  initialRunLength?: number;
  minimumRunBeforeBend?: number;
  occupiedCellCost?: number;
  requiredGoalDirection?: RouteDirection;
  minimumGoalRunLength?: number;
}

const findOrthogonalRoute = (
  start: GridPoint,
  goal: GridPoint,
  blocked: ReadonlySet<string>,
  occupied: ReadonlySet<string>,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  options: OrthogonalRouteOptions = {},
) => {
  interface SearchState extends GridPoint {
    direction: RouteDirection | -1;
    runLength: number;
    cost: number;
    score: number;
    key: string;
  }
  const minimumRun = Math.max(0, options.minimumRunBeforeBend ?? 0);
  const initialDirection = options.initialDirection ?? -1;
  const stateKey = (point: GridPoint, direction: number, runLength: number) =>
    `${point.x},${point.y},${direction},${runLength}`;
  const initialRunLength = initialDirection === -1
    ? 0
    : Math.min(minimumRun, Math.max(0, options.initialRunLength ?? minimumRun));
  const startKey = stateKey(start, initialDirection, initialRunLength);
  const open: SearchState[] = [{
    ...start,
    direction: initialDirection,
    runLength: initialRunLength,
    cost: 0,
    score: Math.abs(goal.x - start.x) + Math.abs(goal.y - start.y),
    key: startKey,
  }];
  const best = new Map([[startKey, 0]]);
  const previous = new Map<string, string>();
  const states = new Map<string, SearchState>([[startKey, open[0]!]]);
  let goalKey: string | undefined;

  while (open.length > 0) {
    open.sort((left, right) => left.score - right.score || left.cost - right.cost);
    const current = open.shift()!;
    if (
      current.x === goal.x &&
      current.y === goal.y &&
      (options.requiredGoalDirection === undefined ||
        current.direction === options.requiredGoalDirection) &&
      current.runLength >= (options.minimumGoalRunLength ?? 0)
    ) {
      goalKey = current.key;
      break;
    }
    for (const step of routeSteps) {
      const next = { x: current.x + step.x, y: current.y + step.y };
      if (
        next.x < bounds.minX || next.x > bounds.maxX ||
        next.y < bounds.minY || next.y > bounds.maxY
      ) continue;
      const cellKey = pointKey(next);
      if (blocked.has(cellKey) && !samePoint(next, goal)) continue;
      const bends = current.direction !== -1 && current.direction !== step.direction;
      if (bends && current.runLength < minimumRun) continue;
      const bendCost = bends ? 4 : 0;
      const runLength = bends
        ? 1
        : Math.min(minimumRun, current.runLength + 1);
      const nextCost = current.cost + 1 + bendCost +
        (occupied.has(cellKey) ? options.occupiedCellCost ?? 8 : 0);
      const key = stateKey(next, step.direction, runLength);
      if (nextCost >= (best.get(key) ?? Number.POSITIVE_INFINITY)) continue;
      const state: SearchState = {
        ...next,
        direction: step.direction,
        runLength,
        cost: nextCost,
        score: nextCost + Math.abs(goal.x - next.x) + Math.abs(goal.y - next.y),
        key,
      };
      best.set(key, nextCost);
      previous.set(key, current.key);
      states.set(key, state);
      open.push(state);
    }
  }
  if (!goalKey) return null;
  const path: GridPoint[] = [];
  let currentKey: string | undefined = goalKey;
  while (currentKey) {
    const state = states.get(currentKey);
    if (!state) break;
    path.push({ x: state.x, y: state.y });
    currentKey = previous.get(currentKey);
  }
  return compactOrthogonalPoints(path.reverse());
};

const repairInvalidRoutes = (
  edges: RoutedEdge[],
  nodes: PositionedLayoutNode[],
  edgePriorities: ReadonlyMap<string, number> = new Map(),
  allowOccupiedFallback = false,
) => {
  const preserveTerminalLeads = edgePriorities.size > 0;
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const markerHasForeignAxis = (
    points: GridPoint[],
    endpoint: PositionedEdgeEndpoint,
  ) => points.slice(1).some((to, index) => {
    const from = points[index]!;
    const marker = endpoint.marker;
    const contains = from.x === to.x
      ? marker.x === from.x && marker.y >= Math.min(from.y, to.y) &&
        marker.y <= Math.max(from.y, to.y)
      : from.y === to.y && marker.y === from.y &&
        marker.x >= Math.min(from.x, to.x) && marker.x <= Math.max(from.x, to.x);
    if (!contains) return false;
    const axis: RouteAxis = from.x === to.x ? "vertical" : "horizontal";
    return axis !== sideAxis(endpoint.side);
  });
  const allPoints = [
    ...nodes.flatMap((node) => [
      { x: node.x, y: node.y },
      { x: node.x + node.width - 1, y: node.y + node.height - 1 },
    ]),
    ...edges.flatMap((edge) => edge.points),
  ];
  const margin = Math.max(8, edges.length * 2);
  const bounds = {
    minX: Math.min(...allPoints.map((point) => point.x)) - margin,
    minY: Math.min(...allPoints.map((point) => point.y)) - margin,
    maxX: Math.max(...allPoints.map((point) => point.x)) + margin,
    maxY: Math.max(...allPoints.map((point) => point.y)) + margin,
  };
  const nodeCells = new Set<string>();
  for (const node of nodes) {
    for (let x = node.x; x < node.x + node.width; x += 1) {
      for (let y = node.y; y < node.y + node.height; y += 1) {
        nodeCells.add(`${x},${y}`);
      }
    }
  }
  const markerOwners = new Map<string, Set<string>>();
  for (const edge of edges) {
    for (const marker of [edge.sourceEndpoint.marker, edge.targetEndpoint.marker]) {
      const key = pointKey(marker);
      const owners = markerOwners.get(key) ?? new Set<string>();
      owners.add(edge.id);
      markerOwners.set(key, owners);
    }
  }

  const result = [...edges];
  const lockedIndexes: number[] = [];
  const routeOrder = result.map((edge, index) => ({
    edge,
    index,
    priority: edgePriorities.get(edge.id) ?? 1,
    quality: routeQuality(
      edge.points,
      0,
      preserveTerminalLeads
        ? terminalMinimums(edge)
        : { source: 0, target: 0 },
    ),
    stableKey: [
      edge.source,
      edge.target,
      edge.label?.text ?? "",
      edge.id,
    ].join("\0"),
  }));
  if (preserveTerminalLeads) {
    routeOrder.sort((left, right) =>
      right.priority - left.priority ||
      compareQuality(left.quality, right.quality) ||
      left.stableKey.localeCompare(right.stableKey)
    );
  }
  for (const { index } of routeOrder) {
    let edge = result[index]!;
    if (edge.routing?.bundleId) {
      lockedIndexes.push(index);
      continue;
    }
    const occupied = new Set(lockedIndexes.flatMap((candidateIndex) =>
      cellsOnRoute(result[candidateIndex]!.points).map(pointKey)
    ));
    const routeCrossesAttachedNode = (
      candidate: RoutedEdge,
      end: "source" | "target",
    ) => {
      const endpoint = end === "source"
        ? candidate.sourceEndpoint
        : candidate.targetEndpoint;
      const nodeId = end === "source" ? candidate.source : candidate.target;
      const node = nodesById.get(nodeId);
      if (!node) return false;
      return cellsOnRoute(candidate.points).some((point) => {
        const inside = point.x >= node.x && point.x < node.x + node.width &&
          point.y >= node.y && point.y < node.y + node.height;
        if (!inside) return false;
        return !samePoint(point, endpoint.anchor) && !(
          candidate.source === candidate.target &&
          samePoint(point, end === "source"
            ? candidate.targetEndpoint.anchor
            : candidate.sourceEndpoint.anchor)
        );
      });
    };
    const relocateBlockedEndpoint = (end: "source" | "target") => {
      const endpoint = end === "source"
        ? edge.sourceEndpoint
        : edge.targetEndpoint;
      const nodeId = end === "source" ? edge.source : edge.target;
      const node = nodesById.get(nodeId);
      if (!node) return;
      const crossesAttachedNode = routeCrossesAttachedNode(edge, end);
      if (
        !crossesAttachedNode &&
        !endpointTerminalKeys(edge, end, endpoint).some((key) => occupied.has(key))
      ) {
        return;
      }
      const preferred = preferredOverflowSide(edge, endpoint, node);
      const perpendicular: GridSide[] = endpoint.side === "left" || endpoint.side === "right"
        ? ["top", "bottom"]
        : ["left", "right"];
      const opposite: GridSide = endpoint.side === "left"
        ? "right"
        : endpoint.side === "right"
          ? "left"
          : endpoint.side === "top"
            ? "bottom"
            : "top";
      const sides = [endpoint.side, preferred, ...perpendicular, opposite]
        .filter((side): side is GridSide => side !== undefined)
        .filter((side, candidateIndex, values) => values.indexOf(side) === candidateIndex);
      const replacement = sides
        .flatMap((side) => endpointSlotsOnSide(node, side))
        .filter((candidate) =>
          endpointTerminalKeys(edge, end, candidate).every((key) =>
            !occupied.has(key) &&
            !terminalKeyHitsForeignNode(key, edge, end, nodes) &&
            [...(markerOwners.get(key) ?? [])].every((owner) => owner === edge.id)
          )
        )
        .flatMap((candidate, order) => {
          const candidateEdge = rerouteEndpoint(edge, end, candidate);
          if (
            !allowOccupiedFallback &&
            (
              routeCrossesAttachedNode(candidateEdge, end) ||
              routeEntersForeignNode(candidateEdge, candidateEdge.points, nodes)
            )
          ) return [];
          return [{
            candidate,
            quality: [...routeQuality(
              candidateEdge.points,
              0,
              terminalMinimums(candidateEdge),
            ), order],
          }];
        })
        .sort((left, right) => compareQuality(left.quality, right.quality))[0]?.candidate;
      if (!replacement) return;
      markerOwners.get(pointKey(endpoint.marker))?.delete(edge.id);
      edge = rerouteEndpoint(edge, end, replacement);
      const replacementKey = pointKey(replacement.marker);
      const owners = markerOwners.get(replacementKey) ?? new Set<string>();
      owners.add(edge.id);
      markerOwners.set(replacementKey, owners);
      result[index] = edge;
    };
    relocateBlockedEndpoint("source");
    relocateBlockedEndpoint("target");
    const ownMarkers = new Set([
      pointKey(edge.sourceEndpoint.marker),
      pointKey(edge.targetEndpoint.marker),
    ]);
    const crossesMarker = cellsOnRoute(edge.points).some((point) => {
      const key = pointKey(point);
      return !ownMarkers.has(key) && (markerOwners.get(key)?.size ?? 0) > 0;
    });
    const bendsThroughMarker = markerHasForeignAxis(edge.points, edge.sourceEndpoint) ||
      markerHasForeignAxis(edge.points, edge.targetEndpoint);
    const needsReadableRepair = edge.routing?.quality === "readable" &&
      edge.source !== edge.target &&
      (
        shortDoglegCount(edge.points) > 0 ||
        preserveTerminalLeads && terminalDoglegCount(
          edge.points,
          terminalMinimums(edge).source,
          terminalMinimums(edge).target,
        ) > 0
      );
    const axes = routeAxisCells(edge.points);
    const comparisonIndexes = lockedIndexes;
    const sharesCollinearCell = comparisonIndexes.some((candidateIndex) => {
      const candidate = result[candidateIndex]!;
      const sharesBundle = edge.routing?.bundleId !== undefined &&
        candidate.routing?.bundleId === edge.routing.bundleId;
      if (sharesBundle) return false;
      const candidateAxes = routeAxisCells(candidate.points);
      return [...axes].some(([key, values]) => {
        const other = candidateAxes.get(key);
        return other && [...values].some((axis) => other.has(axis));
      });
    });
    if (
      !crossesMarker &&
      !bendsThroughMarker &&
      !needsReadableRepair &&
      !sharesCollinearCell &&
      !routeEntersForeignNode(edge, edge.points, nodes)
    ) {
      lockedIndexes.push(index);
      continue;
    }

    const blocked = new Set(nodeCells);
    for (const [key, owners] of markerOwners) {
      if (!owners.has(edge.id)) blocked.add(key);
    }
    blocked.add(pointKey(edge.sourceEndpoint.marker));
    blocked.add(pointKey(edge.targetEndpoint.marker));
    const sourceExit = pointOutsideEndpoint(
      edge.sourceEndpoint,
      edge.routing?.sourceClearance,
    );
    const targetExit = pointOutsideEndpoint(
      edge.targetEndpoint,
      edge.routing?.targetClearance,
    );
    blocked.delete(pointKey(sourceExit));
    blocked.delete(pointKey(targetExit));
    const readableOptions: OrthogonalRouteOptions | undefined =
      edge.routing?.quality === "readable"
        ? {
            initialDirection: routeDirectionFor(edge.sourceEndpoint.outward),
            initialRunLength: 1,
            minimumRunBeforeBend: 2,
            occupiedCellCost: 64,
            requiredGoalDirection: routeDirectionFor({
              x: -edge.targetEndpoint.outward.x,
              y: -edge.targetEndpoint.outward.y,
            }),
            minimumGoalRunLength: preserveTerminalLeads ? 2 : undefined,
          }
        : undefined;
    const readableBlocked = readableOptions
      ? new Set([...blocked, ...occupied])
      : blocked;
    readableBlocked.delete(pointKey(sourceExit));
    readableBlocked.delete(pointKey(targetExit));
    const searchPlans: Array<{
      blocked: ReadonlySet<string>;
      options: OrthogonalRouteOptions | undefined;
    }> = readableOptions
      ? [
          { blocked: readableBlocked, options: readableOptions },
          {
            blocked: allowOccupiedFallback ? blocked : readableBlocked,
            options: {
              initialDirection: routeDirectionFor(edge.sourceEndpoint.outward),
              initialRunLength: 1,
              minimumRunBeforeBend: 2,
              occupiedCellCost: 64,
              requiredGoalDirection: routeDirectionFor({
                x: -edge.targetEndpoint.outward.x,
                y: -edge.targetEndpoint.outward.y,
              }),
              minimumGoalRunLength: preserveTerminalLeads ? 2 : undefined,
            },
          },
          {
            blocked: allowOccupiedFallback ? blocked : readableBlocked,
            options: {
              initialDirection: routeDirectionFor(edge.sourceEndpoint.outward),
              initialRunLength: 0,
              minimumRunBeforeBend: 1,
              occupiedCellCost: 64,
              requiredGoalDirection: routeDirectionFor({
                x: -edge.targetEndpoint.outward.x,
                y: -edge.targetEndpoint.outward.y,
              }),
            },
          },
        ]
      : [{ blocked, options: undefined }];
    const candidates = searchPlans.flatMap((plan, order) => {
      const repaired = findOrthogonalRoute(
        sourceExit,
        targetExit,
        plan.blocked,
        occupied,
        bounds,
        plan.options,
      );
      if (!repaired) return [];
      const points = compactOrthogonalPoints([
        edge.sourceEndpoint.anchor,
        edge.sourceEndpoint.marker,
        ...repaired,
        edge.targetEndpoint.marker,
        edge.targetEndpoint.anchor,
      ]);
      return [{
        points,
        quality: routeQuality(
          points,
          order,
          preserveTerminalLeads
            ? terminalMinimums(edge)
            : { source: 0, target: 0 },
        ),
      }];
    }).sort((left, right) => compareQuality(left.quality, right.quality));
    const repaired = candidates[0];
    if (repaired) {
      result[index] = {
        ...edge,
        points: repaired.points,
        routing: { ...edge.routing, topology: "independent" },
      };
    }
    lockedIndexes.push(index);
  }
  return result;
};

interface RouteSegment {
  index: number;
  from: GridPoint;
  to: GridPoint;
  length: number;
  horizontal: boolean;
}

interface LabelCandidate {
  at: GridPoint;
  allowedEdgeCells?: Set<string>;
}

type EndpointEnd = "source" | "target";

const pointKey = (point: GridPoint) => `${point.x},${point.y}`;

const routeSegments = (points: GridPoint[]): RouteSegment[] => points
  .slice(1)
  .map((to, index) => {
    const from = points[index]!;
    return {
      index,
      from,
      to,
      length: Math.abs(to.x - from.x) + Math.abs(to.y - from.y),
      horizontal: from.y === to.y,
    };
  })
  .filter((segment) => segment.length > 0)
  .sort((left, right) => right.length - left.length || left.index - right.index);

const segmentCellKeys = (segment: RouteSegment) => {
  const dx = Math.sign(segment.to.x - segment.from.x);
  const dy = Math.sign(segment.to.y - segment.from.y);
  const result = new Set<string>();
  let current = { ...segment.from };
  result.add(pointKey(current));
  while (current.x !== segment.to.x || current.y !== segment.to.y) {
    current = { x: current.x + dx, y: current.y + dy };
    result.add(pointKey(current));
  }
  return result;
};

const rectCellKeys = (at: GridPoint, width: number, height: number) => {
  const result: string[] = [];
  for (let x = at.x; x < at.x + width; x += 1) {
    for (let y = at.y; y < at.y + height; y += 1) {
      result.push(`${x},${y}`);
    }
  }
  return result;
};

const inlineLabelCandidates = (
  edge: RoutedEdge,
  label: LayoutLabel,
): LabelCandidate[] => {
  if (label.height !== 1) return [];
  return routeSegments(edge.points).flatMap((segment) => {
    if (!segment.horizontal || segment.length < label.width + 1) return [];
    const left = Math.min(segment.from.x, segment.to.x);
    const right = Math.max(segment.from.x, segment.to.x);
    const centered = Math.floor((left + right - label.width) / 2);
    const x = Math.max(left + 1, Math.min(centered, right - label.width));
    const allowedEdgeCells = new Set(
      [...segmentCellKeys(segment)].filter((key) => {
        const cellX = Number(key.slice(0, key.indexOf(",")));
        return cellX > left && cellX < right;
      }),
    );
    return [{ at: { x, y: segment.from.y }, allowedEdgeCells }];
  });
};

function* adjacentLabelCandidates(
  edge: RoutedEdge,
  label: LayoutLabel,
  searchLimit: number,
): Generator<LabelCandidate> {
  const segments = routeSegments(edge.points);
  for (let distance = 1; distance <= searchLimit; distance += 1) {
    for (const segment of segments) {
      if (segment.horizontal) {
        const left = Math.min(segment.from.x, segment.to.x);
        const right = Math.max(segment.from.x, segment.to.x);
        const x = Math.floor((left + right - label.width) / 2);
        const above = { x, y: segment.from.y - label.height - distance + 1 };
        yield { at: above };
        yield { at: { x, y: segment.from.y + distance } };
      } else {
        const top = Math.min(segment.from.y, segment.to.y);
        const bottom = Math.max(segment.from.y, segment.to.y);
        const y = Math.floor((top + bottom - label.height) / 2);
        const left = { x: segment.from.x - label.width - distance + 1, y };
        yield { at: left };
        yield { at: { x: segment.from.x + distance, y } };
      }
    }
  }
}

const addRectCells = (
  target: Set<string>,
  rect: { x: number; y: number; width: number; height: number },
) => {
  for (const key of rectCellKeys(rect, rect.width, rect.height)) target.add(key);
};

const addGroupBorderCells = (
  target: Set<string>,
  group: { x: number; y: number; width: number; height: number },
) => {
  const right = group.x + group.width - 1;
  const bottom = group.y + group.height - 1;
  for (let x = group.x; x <= right; x += 1) {
    target.add(`${x},${group.y}`);
    target.add(`${x},${bottom}`);
  }
  for (let y = group.y; y <= bottom; y += 1) {
    target.add(`${group.x},${y}`);
    target.add(`${right},${y}`);
  }
};

const endpointLabelCandidates = (
  endpoint: PositionedEdgeEndpoint,
  label: LayoutLabel,
): LabelCandidate[] => {
  if (endpoint.side === "top" || endpoint.side === "bottom") {
    const y = endpoint.side === "top"
      ? endpoint.marker.y - label.height + 1
      : endpoint.marker.y;
    return [
      { at: { x: endpoint.marker.x + 2, y } },
      { at: { x: endpoint.marker.x - label.width - 1, y } },
    ];
  }
  const x = endpoint.side === "right"
    ? endpoint.marker.x
    : endpoint.marker.x - label.width + 1;
  return [
    { at: { x, y: endpoint.marker.y - label.height } },
    { at: { x, y: endpoint.marker.y + 1 } },
  ];
};

const containedByGroupInterior = (
  candidate: LabelCandidate,
  label: LayoutLabel,
  group: GridLayout["groups"][number] | undefined,
) => !group || (
  candidate.at.x >= group.x + 1 &&
  candidate.at.y >= group.y + 1 &&
  candidate.at.x + label.width <= group.x + group.width - 1 &&
  candidate.at.y + label.height <= group.y + group.height - 1
);

const placeEdgeLabels = (
  edges: RoutedEdge[],
  nodes: PositionedLayoutNode[],
  groups: GridLayout["groups"],
  width: number,
  height: number,
): PositionedLayoutEdge[] => {
  const blocked = new Set<string>();
  for (const node of nodes) addRectCells(blocked, node);
  for (const group of groups) addGroupBorderCells(blocked, group);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const groupsById = new Map(groups.map((group) => [group.id, group]));

  const edgeOwners = new Map<string, Set<string>>();
  const edgeCells = new Map<string, Set<string>>();
  const protectedCells = new Map<string, Set<string>>();
  for (const edge of edges) {
    const owned = new Set<string>();
    for (const segment of routeSegments(edge.points)) {
      for (const key of segmentCellKeys(segment)) {
        owned.add(key);
        const owners = edgeOwners.get(key) ?? new Set<string>();
        owners.add(edge.id);
        edgeOwners.set(key, owners);
      }
    }
    edgeCells.set(edge.id, owned);
    protectedCells.set(edge.id, new Set(edge.points.map(pointKey)));
  }

  const reservedLabels = new Set<string>();
  const isAvailable = (
    edge: RoutedEdge,
    label: LayoutLabel,
    candidate: LabelCandidate,
    ownerGroup?: GridLayout["groups"][number],
  ) => {
    if (!containedByGroupInterior(candidate, label, ownerGroup)) return false;
    const candidateCells = rectCellKeys(candidate.at, label.width, label.height);
    if (edge.labelLayout === "reserve" && edge.routing?.topology === "independent") {
      const ownCells = edgeCells.get(edge.id) ?? new Set<string>();
      const touchesRoute = candidateCells.some((key) => {
        const comma = key.indexOf(",");
        const x = Number(key.slice(0, comma));
        const y = Number(key.slice(comma + 1));
        return [
          key,
          `${x - 1},${y}`,
          `${x + 1},${y}`,
          `${x},${y - 1}`,
          `${x},${y + 1}`,
        ].some((neighbor) => ownCells.has(neighbor));
      });
      if (!touchesRoute) return false;
    }
    const ownProtected = protectedCells.get(edge.id) ?? new Set<string>();
    for (const key of candidateCells) {
      if (blocked.has(key) || reservedLabels.has(key) || ownProtected.has(key)) return false;
      const owners = edgeOwners.get(key);
      if (!owners || owners.size === 0) continue;
      const allowed = candidate.allowedEdgeCells?.has(key) &&
        owners.size === 1 && owners.has(edge.id);
      if (!allowed) return false;
    }
    return true;
  };

  const endpointPositions = new Map<string, GridPoint>();
  const placeEndpointLabel = (
    edge: RoutedEdge,
    end: EndpointEnd,
    endpointLabel: LayoutLabel | undefined,
  ) => {
    if (!endpointLabel) return;
    const endpoint = end === "source" ? edge.sourceEndpoint : edge.targetEndpoint;
    const nodeId = end === "source" ? edge.source : edge.target;
    const parentId = nodesById.get(nodeId)?.parentId;
    const ownerGroup = parentId ? groupsById.get(parentId) : undefined;
    const selected = endpointLabelCandidates(endpoint, endpointLabel).find((candidate) =>
      isAvailable(edge, endpointLabel, candidate, ownerGroup)
    );
    if (!selected) {
      throw new Error(`Could not place ${end} label for edge ${edge.id}`);
    }
    endpointPositions.set(`${edge.id}:${end}`, selected.at);
    for (const key of rectCellKeys(selected.at, endpointLabel.width, endpointLabel.height)) {
      reservedLabels.add(key);
    }
  };

  for (const edge of edges) {
    placeEndpointLabel(edge, "source", edge.sourceLabel);
    placeEndpointLabel(edge, "target", edge.targetLabel);
  }

  return edges.map((edge) => {
    const { elkLabelPosition, ...positioned } = edge;
    const endpointPositioned = {
      ...positioned,
      sourceLabelPosition: endpointPositions.get(`${edge.id}:source`),
      targetLabelPosition: endpointPositions.get(`${edge.id}:target`),
    };
    if (!edge.label) return endpointPositioned;
    const ownOrdinaryCells = new Set(
      [...(edgeCells.get(edge.id) ?? [])].filter((key) =>
        !(protectedCells.get(edge.id)?.has(key) ?? false)
      ),
    );
    const elkCandidate = elkLabelPosition
      ? [{ at: elkLabelPosition, allowedEdgeCells: ownOrdinaryCells }]
      : [];
    const inlineCandidates = inlineLabelCandidates(edge, edge.label);
    const candidates = edge.source === edge.target
      ? [...elkCandidate, ...inlineCandidates]
      : [...inlineCandidates, ...elkCandidate];
    const searchLimit = width + height + edge.label.width + edge.label.height;
    let selected = candidates.find((candidate) =>
      isAvailable(edge, edge.label!, candidate)
    );
    if (!selected) {
      for (const candidate of adjacentLabelCandidates(edge, edge.label, searchLimit)) {
        if (!isAvailable(edge, edge.label, candidate)) continue;
        selected = candidate;
        break;
      }
    }
    if (!selected) throw new Error(`Could not place label for edge ${edge.id}`);
    for (const key of rectCellKeys(selected.at, edge.label.width, edge.label.height)) {
      reservedLabels.add(key);
    }
    return { ...endpointPositioned, labelPosition: selected.at };
  });
};

const translatePoint = (point: GridPoint, x: number, y: number): GridPoint => ({
  x: point.x + x,
  y: point.y + y,
});

const normalizeGridLayoutOrigin = (layout: GridLayout): GridLayout => {
  const points = [
    ...layout.nodes.map(({ x, y }) => ({ x, y })),
    ...layout.groups.map(({ x, y }) => ({ x, y })),
    ...layout.edges.flatMap((edge) => [
      ...edge.points,
      edge.sourceEndpoint.anchor,
      edge.sourceEndpoint.marker,
      edge.targetEndpoint.anchor,
      edge.targetEndpoint.marker,
      ...(edge.labelPosition ? [edge.labelPosition] : []),
      ...(edge.sourceLabelPosition ? [edge.sourceLabelPosition] : []),
      ...(edge.targetLabelPosition ? [edge.targetLabelPosition] : []),
    ]),
  ];
  const offsetX = -Math.min(0, ...points.map((point) => point.x));
  const offsetY = -Math.min(0, ...points.map((point) => point.y));
  if (offsetX === 0 && offsetY === 0) return layout;
  const translateEndpoint = (endpoint: PositionedEdgeEndpoint) => ({
    ...endpoint,
    anchor: translatePoint(endpoint.anchor, offsetX, offsetY),
    marker: translatePoint(endpoint.marker, offsetX, offsetY),
  });

  return {
    width: layout.width + offsetX,
    height: layout.height + offsetY,
    nodes: layout.nodes.map((node) => ({
      ...node,
      ...translatePoint(node, offsetX, offsetY),
    })),
    groups: layout.groups.map((group) => ({
      ...group,
      ...translatePoint(group, offsetX, offsetY),
    })),
    edges: layout.edges.map((edge) => ({
      ...edge,
      points: edge.points.map((point) => translatePoint(point, offsetX, offsetY)),
      sourceEndpoint: translateEndpoint(edge.sourceEndpoint),
      targetEndpoint: translateEndpoint(edge.targetEndpoint),
      labelPosition: edge.labelPosition
        ? translatePoint(edge.labelPosition, offsetX, offsetY)
        : undefined,
      sourceLabelPosition: edge.sourceLabelPosition
        ? translatePoint(edge.sourceLabelPosition, offsetX, offsetY)
        : undefined,
      targetLabelPosition: edge.targetLabelPosition
        ? translatePoint(edge.targetLabelPosition, offsetX, offsetY)
        : undefined,
    })),
  };
};

export const fromElkGraph = (
  graph: LayoutGraph,
  laidOut: ElkNode,
): GridLayout => {
  const alignment = graph.pathAlignment === "topology"
    ? topologyAlignment(graph)
    : undefined;
  const modelNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const modelGroups = new Map(graph.groups.map((group) => [group.id, group]));
  const nodes: PositionedLayoutNode[] = [];
  const elkNodes = new Map<string, { x: number; y: number; width: number; height: number }>();
  const groups: GridLayout["groups"] = [];
  const positionedEdges: Array<{ edge: ElkExtendedEdge; offset: ElkPoint }> =
    (laidOut.edges ?? []).map((edge) => ({ edge, offset: { x: 0, y: 0 } }));

  const visit = (children: ElkNode[] | undefined, offset: ElkPoint) => {
    for (const child of children ?? []) {
      const rawX = offset.x + (child.x ?? 0);
      const rawY = offset.y + (child.y ?? 0);
      const x = quantizeCoordinate(rawX);
      const y = quantizeCoordinate(rawY);
      const modelNode = modelNodes.get(child.id);
      const modelGroup = modelGroups.get(child.id);
      if (modelNode) {
        nodes.push({ ...modelNode, x, y });
        elkNodes.set(child.id, {
          x: rawX,
          y: rawY,
          width: child.width ?? modelNode.width,
          height: child.height ?? modelNode.height,
        });
      } else if (modelGroup) {
        groups.push({
          ...modelGroup,
          x,
          y,
          width: Math.max(1, quantizeCoordinate(child.width)),
          height: Math.max(1, quantizeCoordinate(child.height)),
        });
      }
      for (const edge of child.edges ?? []) {
        positionedEdges.push({ edge, offset: { x: rawX, y: rawY } });
      }
      visit(child.children, { x: rawX, y: rawY });
    }
  };
  visit(laidOut.children, { x: 0, y: 0 });
  alignLinearBackboneNodes(nodes, alignment?.linearBackbone, graph.direction);

  const positionedById = new Map(nodes.map((node) => [node.id, node]));
  const modelEdges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const preparedEdges = positionedEdges.flatMap(({ edge, offset }) => {
    const modelEdge = modelEdges.get(edge.id);
    const source = modelEdge && positionedById.get(modelEdge.source);
    const target = modelEdge && positionedById.get(modelEdge.target);
    const elkSource = modelEdge && elkNodes.get(modelEdge.source);
    const elkTarget = modelEdge && elkNodes.get(modelEdge.target);
    if (!modelEdge || !source || !target || !elkSource || !elkTarget) return [];
    const rawPoints = edgePoints(edge, offset);
    if (rawPoints.length < 2) return [];
    return [{
      edge,
      offset,
      modelEdge,
      source,
      target,
      rawPoints,
      sourceSide: nearestNodeSide(
        rawPoints[0]!, rawPoints[1]!, elkSource, graph.direction, true,
      ),
      targetSide: nearestNodeSide(
        rawPoints.at(-1)!, rawPoints.at(-2)!, elkTarget, graph.direction, false,
      ),
    }];
  });
  const attachmentCounts = new Map<string, number>();
  const attachmentKey = (nodeId: string, side: GridSide) => `${nodeId}:${side}`;
  for (const { modelEdge, sourceSide, targetSide } of preparedEdges) {
    const sourceKey = attachmentKey(modelEdge.source, sourceSide);
    const targetKey = attachmentKey(modelEdge.target, targetSide);
    attachmentCounts.set(sourceKey, (attachmentCounts.get(sourceKey) ?? 0) + 1);
    attachmentCounts.set(targetKey, (attachmentCounts.get(targetKey) ?? 0) + 1);
  }
  const compactSelfLoopCounts = new Map<string, number>();

  const rawRoutedEdges: RoutedEdge[] = preparedEdges.map(({
    edge,
    offset,
    modelEdge,
    source,
    target,
    rawPoints,
    sourceSide,
    targetSide,
  }) => {
    let sourceEndpoint = endpointFor(
      rawPoints[0]!,
      source,
      sourceSide,
      attachmentCounts.get(attachmentKey(modelEdge.source, sourceSide)) ?? 1,
    );
    let targetEndpoint = endpointFor(
      rawPoints.at(-1)!,
      target,
      targetSide,
      attachmentCounts.get(attachmentKey(modelEdge.target, targetSide)) ?? 1,
    );
    if (modelEdge.source === modelEdge.target && modelEdge.routing?.selfLoop === "compact") {
      const lane = compactSelfLoopCounts.get(modelEdge.source) ?? 0;
      compactSelfLoopCounts.set(modelEdge.source, lane + 1);
      [sourceEndpoint, targetEndpoint] = canonicalCompactSelfEndpoints(
        source,
        graph.direction,
        lane,
      );
    }
    const routed = routeWithEndpoints(
      quantizeRoute(rawPoints),
      sourceEndpoint,
      targetEndpoint,
      modelEdge.routing?.sourceClearance,
      modelEdge.routing?.targetClearance,
    );
    const points = modelEdge.source === modelEdge.target &&
      modelEdge.routing?.selfLoop === "compact"
      ? compactSelfLoop(
          routed,
          sourceEndpoint,
          targetEndpoint,
          modelEdge.routing.sourceClearance,
          modelEdge.routing.targetClearance,
        )
      : routed;
    const elkLabelPosition = modelEdge.label
      ? labelPosition(edge, offset)
      : undefined;
    return {
      ...modelEdge,
      points,
      sourceEndpoint,
      targetEndpoint,
      elkLabelPosition,
    };
  });

  const alignedEdges = alignReadableEndpoints(
    normalizeStructuredBundles(rawRoutedEdges, nodes, graph.direction),
    nodes,
  );
  const separatedEdges = separateConflictingEndpointMarkers(
    alignedEdges,
    nodes,
    alignment?.priorities ?? new Map(),
  );
  const routedEdges = repairInvalidRoutes(
    separatedEdges,
    nodes,
    alignment?.priorities,
    hasDirectedCycle(graph) || graph.edges.length > graph.nodes.length,
  );
  const routeMaxX = Math.max(
    quantizeCoordinate(laidOut.width),
    ...nodes.map((node) => node.x + node.width),
    ...groups.map((group) => group.x + group.width),
    ...routedEdges.flatMap((edge) => edge.points.map((point) => point.x + 1)),
  );
  const routeMaxY = Math.max(
    quantizeCoordinate(laidOut.height),
    ...nodes.map((node) => node.y + node.height),
    ...groups.map((group) => group.y + group.height),
    ...routedEdges.flatMap((edge) => edge.points.map((point) => point.y + 1)),
  );
  const edges = placeEdgeLabels(routedEdges, nodes, groups, routeMaxX, routeMaxY);
  const maxX = Math.max(
    routeMaxX,
    ...edges.flatMap((edge) => edge.label && edge.labelPosition
      ? [edge.labelPosition.x + edge.label.width]
      : []),
    ...edges.flatMap((edge) => [
      ...(edge.sourceLabel && edge.sourceLabelPosition
        ? [edge.sourceLabelPosition.x + edge.sourceLabel.width]
        : []),
      ...(edge.targetLabel && edge.targetLabelPosition
        ? [edge.targetLabelPosition.x + edge.targetLabel.width]
        : []),
    ]),
  );
  const maxY = Math.max(
    routeMaxY,
    ...edges.flatMap((edge) => edge.label && edge.labelPosition
      ? [edge.labelPosition.y + edge.label.height]
      : []),
    ...edges.flatMap((edge) => [
      ...(edge.sourceLabel && edge.sourceLabelPosition
        ? [edge.sourceLabelPosition.y + edge.sourceLabel.height]
        : []),
      ...(edge.targetLabel && edge.targetLabelPosition
        ? [edge.targetLabelPosition.y + edge.targetLabel.height]
        : []),
    ]),
  );

  return normalizeGridLayoutOrigin({ width: maxX, height: maxY, nodes, edges, groups });
};

export const layoutWithElk = async (
  graph: LayoutGraph,
  elk: ELK,
): Promise<GridLayout> => fromElkGraph(graph, await elk.layout(toElkGraph(graph)));
