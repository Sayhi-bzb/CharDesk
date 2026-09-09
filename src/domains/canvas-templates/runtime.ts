import { getCellOccupancy, splitGraphemes } from "@/shared/metrics";
import type { GridCell, GridCellSource } from "@/shared/types";
import { createGridMapSource } from "@/shared/utils/grid-source";
import {
  CANVAS_TEMPLATES,
  type CanvasTemplateDefinition,
  type CanvasTemplateGroup,
  type CanvasTemplateId,
} from "./catalog";

export const CANVAS_TEMPLATE_MIME = "application/x-chardesk-cell-template";

export const CANVAS_PAGE_TEMPLATES = CANVAS_TEMPLATES.filter(
  ({ group }) => group === "template"
);
export const CANVAS_COMPONENT_TEMPLATES = CANVAS_TEMPLATES.filter(
  ({ group }) => group === "component"
);

const templateById = new Map(
  CANVAS_TEMPLATES.map((template) => [template.id, template])
);

export const isCanvasTemplateId = (
  value: string | null
): value is CanvasTemplateId => !!value && templateById.has(value as CanvasTemplateId);

export const getCanvasTemplate = (
  id: CanvasTemplateId
): CanvasTemplateDefinition => templateById.get(id)!;

let activeCanvasTemplateDragId: CanvasTemplateId | null = null;

export const setActiveCanvasTemplateDragId = (id: CanvasTemplateId | null) => {
  activeCanvasTemplateDragId = id;
};

export const getActiveCanvasTemplateDragId = () => activeCanvasTemplateDragId;

export type CanvasTemplateProjection = Readonly<{
  source: GridCellSource;
  viewport: Readonly<{ x: number; y: number; width: number; height: number }>;
}>;

const projectionCache = new Map<CanvasTemplateId, CanvasTemplateProjection>();

export const getCanvasTemplateProjection = (
  id: CanvasTemplateId
): CanvasTemplateProjection => {
  const cached = projectionCache.get(id);
  if (cached) return cached;
  const template = getCanvasTemplate(id);
  const cells = new Map<string, GridCell>();
  template.rows.forEach((row) => {
    row.spans.forEach((span) => {
      let x = span.x;
      splitGraphemes(span.text).forEach((char) => {
        if (row.y >= 0 && row.y < template.height && x >= 0 && x < template.width) {
          cells.set(`${x},${row.y}`, {
            char,
            color: span.color,
            ...(span.bgColor ? { bgColor: span.bgColor } : {}),
            ...(span.attrs ? { attrs: { ...span.attrs } } : {}),
            ...(span.href ? { href: span.href } : {}),
          });
        }
        x += getCellOccupancy(char);
      });
    });
  });
  const projection = Object.freeze({
    source: createGridMapSource(cells),
    viewport: Object.freeze({
      x: 0,
      y: 0,
      width: template.width,
      height: template.height,
    }),
  });
  projectionCache.set(id, projection);
  return projection;
};

export const getCanvasTemplatesByGroup = (group: CanvasTemplateGroup) =>
  group === "template" ? CANVAS_PAGE_TEMPLATES : CANVAS_COMPONENT_TEMPLATES;
