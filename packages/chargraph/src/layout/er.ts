import { parseErDiagram } from "../vendor/er/parser.js";
import type {
  Cardinality,
  ErAttribute,
  ErRelationship,
} from "../vendor/er/types.js";
import { splitLines } from "../vendor/ascii/multiline-utils.js";
import { prepareMermaidLines } from "../vendor/parse-utils.js";
import type { AsciiConfig, Canvas } from "../vendor/ascii/types.js";
import type { MermaidStyleRole } from "../mermaid-style.js";
import type { GridSide, LayoutGraph } from "./model.js";
import {
  createLayoutLabel,
  createMultiBoxCanvas,
  drawMultiBoxFragment,
} from "./presentation.js";
import {
  endpointCell,
  renderLayeredDiagramSurface,
  type LayeredDiagramPresentation,
  type LayeredEndpointPresentation,
} from "./render.js";

interface ErEdgeVisual {
  relationship: ErRelationship;
  borderStyleRole: MermaidStyleRole;
}

const entityId = (id: string) => `entity:${id}`;

const attributeLines = (attribute: ErAttribute) => {
  const keys = attribute.keys.length > 0
    ? `${attribute.keys.join(",")} `
    : "   ";
  const base = `${keys}${attribute.type} ${attribute.name}`;
  if (attribute.comment === undefined) return [base];
  const comments = splitLines(attribute.comment);
  const indent = " ".repeat(base.length + 1);
  return comments.map((comment, index) =>
    `${index === 0 ? `${base} ` : indent}"${comment}"`
  );
};

const entitySections = (
  entity: ReturnType<typeof parseErDiagram>["entities"][number],
) => {
  const attributes = entity.attributes.flatMap(attributeLines);
  const header = splitLines(entity.label);
  return attributes.length === 0 ? [header] : [header, attributes];
};

interface EntityPortDemand {
  top: number;
  right: number;
  left: number;
}

const emptyPortDemand = (): EntityPortDemand => ({
  top: 0,
  right: 0,
  left: 0,
});

const getEntityPortDemand = (
  relationships: readonly ErRelationship[],
) => {
  const demands = new Map<string, EntityPortDemand>();
  const demandFor = (id: string) => {
    const demand = demands.get(id) ?? emptyPortDemand();
    demands.set(id, demand);
    return demand;
  };
  for (const relationship of relationships) {
    if (relationship.entity1 === relationship.entity2) {
      demandFor(relationship.entity1).top += 2;
      continue;
    }
    demandFor(relationship.entity1).right += 1;
    demandFor(relationship.entity2).left += 1;
  }
  return demands;
};

const createEntityCanvas = (
  sections: string[][],
  demand: EntityPortDemand,
  useAscii: boolean,
) => {
  const fitted = sections.map((section) => [...section]);
  const last = fitted.at(-1)!;
  let canvas = createMultiBoxCanvas(fitted, useAscii);
  const minimumWidth = demand.top + 2;
  if (canvas.length < minimumWidth) {
    last.push(" ".repeat(minimumWidth - 2));
    canvas = createMultiBoxCanvas(fitted, useAscii);
  }
  const minimumHeight = Math.max(demand.left, demand.right) + 2;
  const missingRows = minimumHeight - (canvas[0]?.length ?? 1);
  if (missingRows > 0) {
    last.push(...Array.from({ length: missingRows }, () => ""));
    canvas = createMultiBoxCanvas(fitted, useAscii);
  }
  return canvas;
};

const exactlyOneGlyph = (side: GridSide, useAscii: boolean) => {
  const verticalSide = side === "left" || side === "right";
  if (useAscii) return verticalSide ? "|" : "-";
  return verticalSide ? "│" : "─";
};

const manyGlyph = (side: GridSide, useAscii: boolean) => {
  if (useAscii) {
    if (side === "right") return ">";
    if (side === "left") return "<";
    return side === "bottom" ? "v" : "^";
  }
  if (side === "right") return "╢";
  if (side === "left") return "╟";
  return side === "bottom" ? "╨" : "╥";
};

export const getErEndpointGlyphs = (
  cardinality: Cardinality,
  side: GridSide,
  useAscii: boolean,
) => {
  const one = exactlyOneGlyph(side, useAscii);
  const many = manyGlyph(side, useAscii);
  const zero = useAscii ? "o" : "○";
  if (cardinality === "one") return [one];
  if (cardinality === "zero-one") return [one, zero];
  if (cardinality === "many") return [many];
  return [many, zero];
};

const cardinalityPresentation = (
  cardinality: Cardinality,
  borderStyleRole: MermaidStyleRole,
): LayeredEndpointPresentation => ({
  trimAnchor: true,
  paint(scene, context) {
    const glyphs = getErEndpointGlyphs(
      cardinality,
      context.endpoint.side,
      context.useAscii,
    );
    for (const [index, char] of glyphs.entries()) {
      scene.add({
        kind: "marker",
        owner: `${context.edge.id}:${context.end}-cardinality:${index}`,
        at: endpointCell(context.endpoint, index + 1),
        char,
        styleRole: borderStyleRole,
      });
    }
  },
});

export const createLayeredErDiagram = (
  text: string,
  config: AsciiConfig,
): { graph: LayoutGraph; presentation: LayeredDiagramPresentation } | undefined => {
  const lines = prepareMermaidLines(text);
  const diagram = parseErDiagram(lines);
  if (diagram.entities.length === 0) return undefined;

  const portDemands = getEntityPortDemand(diagram.relationships);
  const nodeVisuals = new Map<string, Canvas>();
  const nodes = diagram.entities.map((entity) => {
    const id = entityId(entity.id);
    const canvas = createEntityCanvas(
      entitySections(entity),
      portDemands.get(entity.id) ?? emptyPortDemand(),
      config.useAscii,
    );
    nodeVisuals.set(id, canvas);
    return {
      id,
      label: entity.label,
      width: canvas.length,
      height: canvas[0]?.length ?? 1,
      portPlacement: "distributed" as const,
      portAllocation: "independent" as const,
    };
  });

  const edgeVisuals = new Map<string, ErEdgeVisual>();
  const edges = diagram.relationships.map((relationship, index) => {
    const id = `er-edge:${index}`;
    edgeVisuals.set(id, {
      relationship,
      borderStyleRole: "node.border",
    });
    return {
      id,
      source: entityId(relationship.entity1),
      target: entityId(relationship.entity2),
      label: createLayoutLabel(relationship.label),
      labelLayout: "route" as const,
      routing: {
        topology: "independent" as const,
        selfLoop: "compact" as const,
        sourceClearance: getErEndpointGlyphs(
          relationship.cardinality1,
          "right",
          config.useAscii,
        ).length,
        targetClearance: getErEndpointGlyphs(
          relationship.cardinality2,
          "left",
          config.useAscii,
        ).length,
      },
    };
  });

  const graph: LayoutGraph = {
    direction: diagram.direction,
    spacing: {
      nodeNode: Math.max(2, config.paddingY),
      nodeNodeBetweenLayers: Math.max(
        6,
        config.paddingX,
        ...edges.map((edge) => (edge.label?.width ?? 0) + 3),
      ),
    },
    nodes,
    edges,
    groups: [],
  };
  const presentation: LayeredDiagramPresentation = {
    drawGroup() {},
    drawNode(scene, node) {
      const canvas = nodeVisuals.get(node.id);
      if (!canvas) throw new Error(`Missing presentation for ER entity ${node.id}`);
      drawMultiBoxFragment(scene, canvas, node, node.id, config.useAscii);
    },
    edge(edge) {
      const visual = edgeVisuals.get(edge.id);
      if (!visual) throw new Error(`Missing presentation for ER edge ${edge.id}`);
      return {
        stroke: {
          style: visual.relationship.identifying ? "solid" : "dotted",
          role: "line",
          rounded: true,
          styleRole: visual.borderStyleRole,
        },
        sourceEndpoint: cardinalityPresentation(
          visual.relationship.cardinality1,
          visual.borderStyleRole,
        ),
        targetEndpoint: cardinalityPresentation(
          visual.relationship.cardinality2,
          visual.borderStyleRole,
        ),
      };
    },
  };
  return { graph, presentation };
};

export const renderLayeredErSurface = async (text: string, config: AsciiConfig) => {
  const diagram = createLayeredErDiagram(text, config);
  if (!diagram) return { canvas: [], styleRoleCanvas: [] };
  return renderLayeredDiagramSurface(diagram.graph, diagram.presentation, config);
};
