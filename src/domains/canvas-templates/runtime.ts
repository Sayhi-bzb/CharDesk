import {
  getCellOccupancy,
  getTextCellWidth,
  splitGraphemes,
} from "@/shared/metrics";
import type { GridCell, GridCellSource } from "@/shared/types";
import { createGridMapSource } from "@/shared/utils/grid-source";
import type { CharDeskContentTheme } from "@chardesk/rendering/theme";
import {
  CANVAS_TEMPLATES,
  type CanvasTemplateColor,
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

export type MaterializedCanvasTemplateSpan = {
  x: number;
  text: string;
  width: number;
  color: string;
  bgColor?: string;
  attrs?: CanvasTemplateDefinition["rows"][number]["spans"][number]["attrs"];
  href?: string;
};

export type MaterializedCanvasTemplateRow = {
  y: number;
  spans: MaterializedCanvasTemplateSpan[];
};

export type CanvasTemplateMaterialization = Readonly<{
  rows: MaterializedCanvasTemplateRow[];
  source: GridCellSource;
  viewport: Readonly<{ x: number; y: number; width: number; height: number }>;
}>;

const materializationCache = new WeakMap<
  CharDeskContentTheme,
  Map<CanvasTemplateId, CanvasTemplateMaterialization>
>();

const resolveTemplateColor = (
  color: CanvasTemplateColor,
  theme: CharDeskContentTheme
) => typeof color === "string" ? color : theme[color.token];

export const getCanvasTemplateMaterialization = (
  id: CanvasTemplateId,
  theme: CharDeskContentTheme
): CanvasTemplateMaterialization => {
  const themeCache = materializationCache.get(theme);
  const cached = themeCache?.get(id);
  if (cached) return cached;
  const template = getCanvasTemplate(id);
  const rows = template.rows.map((row) => ({
    y: row.y,
    spans: row.spans.map(({ color, bgColor, ...span }) => ({
      ...span,
      width: getTextCellWidth(span.text),
      color: resolveTemplateColor(color, theme),
      ...(bgColor
        ? { bgColor: resolveTemplateColor(bgColor, theme) }
        : {}),
    })),
  }));
  const cells = new Map<string, GridCell>();
  rows.forEach((row) => {
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
  const materialization = Object.freeze({
    rows,
    source: createGridMapSource(cells),
    viewport: Object.freeze({
      x: 0,
      y: 0,
      width: template.width,
      height: template.height,
    }),
  });
  const cache = themeCache ?? new Map();
  cache.set(id, materialization);
  if (!themeCache) materializationCache.set(theme, cache);
  return materialization;
};

export const getCanvasTemplatesByGroup = (group: CanvasTemplateGroup) =>
  group === "template" ? CANVAS_PAGE_TEMPLATES : CANVAS_COMPONENT_TEMPLATES;
