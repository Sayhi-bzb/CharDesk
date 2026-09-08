import type { GridCell } from "@/shared/types";
import { GridManager } from "@/shared/utils/grid";
import { createGridMapSource } from "@/shared/utils/grid-source";
import type {
  StructuredComponentInstance,
  StructuredNode,
} from "../model/types";
import { renderStructuredScene } from "../model/scene";
import {
  createStructuredComponentFactory,
  STRUCTURED_COMPONENTS,
  STRUCTURED_TEMPLATE_FALLBACK_COLORS,
  STRUCTURED_TEMPLATE_TEXT_COLOR,
  type StructuredTemplateBuildOptions,
  type StructuredTemplateId,
} from "./components";
import { STRUCTURED_PAGE_TEMPLATE_COMPONENTS } from "./pages";
import { normalizeStructuredComponents } from "../model/components";

export const STRUCTURED_TEMPLATE_MIME =
  "application/x-chardesk-structured-template";

export type StructuredTemplateListItem = {
  id: StructuredTemplateId;
  label: string;
};

export const STRUCTURED_COMPONENT_TEMPLATES: StructuredTemplateListItem[] =
  STRUCTURED_COMPONENTS.map(({ id, label }) => ({ id, label }));

export const STRUCTURED_PAGE_TEMPLATES: StructuredTemplateListItem[] =
  STRUCTURED_PAGE_TEMPLATE_COMPONENTS.map(({ id, label }) => ({ id, label }));

export const STRUCTURED_TEMPLATES: StructuredTemplateListItem[] = [
  ...STRUCTURED_COMPONENT_TEMPLATES,
  ...STRUCTURED_PAGE_TEMPLATES,
];

const STRUCTURED_COMPONENT_BY_ID = new Map(
  [...STRUCTURED_COMPONENTS, ...STRUCTURED_PAGE_TEMPLATE_COMPONENTS].map(
    (component) => [component.id, component]
  )
);

let activeStructuredTemplateDragId: StructuredTemplateId | null = null;

export const setActiveStructuredTemplateDragId = (
  templateId: StructuredTemplateId | null
) => {
  activeStructuredTemplateDragId = templateId;
};

export const getActiveStructuredTemplateDragId = () =>
  activeStructuredTemplateDragId;

export type StructuredTemplatePreview = {
  rows: GridCell[][];
  width: number;
  height: number;
};

type StructuredTemplateBuildResult = {
  nodes: StructuredNode[];
  components: StructuredComponentInstance[];
};

export const isStructuredTemplateId = (
  value: string | null
): value is StructuredTemplateId =>
  STRUCTURED_TEMPLATES.some((template) => template.id === value);

export const buildStructuredTemplate = (
  templateId: StructuredTemplateId,
  position: { x: number; y: number },
  options: StructuredTemplateBuildOptions
): StructuredTemplateBuildResult => {
  const component = STRUCTURED_COMPONENT_BY_ID.get(templateId);
  if (!component) return { nodes: [], components: [] };
  const nodes = component.build(
    createStructuredComponentFactory(position, { ...options, templateId })
  );
  return {
    nodes,
    components: normalizeStructuredComponents(undefined, nodes).map(
      (instance) => ({
        ...instance,
        label: component.label,
      })
    ),
  };
};

export const buildStructuredTemplateNodes = (
  templateId: StructuredTemplateId,
  position: { x: number; y: number },
  options: StructuredTemplateBuildOptions
): StructuredNode[] => {
  return buildStructuredTemplate(templateId, position, options).nodes;
};

export const buildStructuredTemplatePreview = (
  templateId: StructuredTemplateId
): StructuredTemplatePreview => {
  const nodes = buildStructuredTemplateNodes(templateId, { x: 0, y: 0 }, {
    brushColor: STRUCTURED_TEMPLATE_FALLBACK_COLORS[0],
    startOrder: 1,
  });

  if (nodes.length === 0) return { rows: [], width: 0, height: 0 };

  const grid = renderStructuredScene(nodes);
  if (grid.size === 0) return { rows: [], width: 0, height: 0 };
  const source = createGridMapSource(grid);

  const { minX, maxX, minY, maxY } = GridManager.getGridBounds(source);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const rows: GridCell[][] = Array.from(
    { length: height },
    () =>
      Array.from({ length: width }, () => ({
        char: " ",
        color: STRUCTURED_TEMPLATE_TEXT_COLOR,
      }))
  );

  GridManager.iterate(source, (cell, x, y) => {
    rows[y - minY][x - minX] = cell;
  });

  return { rows, width, height };
};

const structuredTemplatePreviewCache = new Map<
  StructuredTemplateId,
  StructuredTemplatePreview
>();

export const getStructuredTemplatePreview = (
  templateId: StructuredTemplateId
): StructuredTemplatePreview => {
  const cached = structuredTemplatePreviewCache.get(templateId);
  if (cached) return cached;

  const preview = buildStructuredTemplatePreview(templateId);
  structuredTemplatePreviewCache.set(templateId, preview);
  return preview;
};
