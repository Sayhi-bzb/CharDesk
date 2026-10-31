import {
  getGraphemeCellWidth as getCellOccupancy,
  getTextCellWidth,
  splitGraphemes,
} from '@chardesk/protocol';
import type { GridCell, GridCellSource } from '@chardesk/cell-plane/types';
import { createGridMapSource } from '@chardesk/cell-plane/grid-source';
import type { CharDeskContentTheme } from '@chardesk/rendering/theme';
import {
  CANVAS_TEMPLATES,
  type CanvasTemplateColor,
  type CanvasTemplateDefinition,
  type CanvasTemplateGroup,
  type CanvasTemplateId,
} from './catalog.js';

export const CANVAS_TEMPLATE_MIME = 'application/x-chardesk-cell-template';

export const CANVAS_PAGE_TEMPLATES = CANVAS_TEMPLATES.filter(({ group }) => group === 'template');
export const CANVAS_COMPONENT_TEMPLATES = CANVAS_TEMPLATES.filter(
  ({ group }) => group === 'component'
);

const templateById = new Map(CANVAS_TEMPLATES.map((template) => [template.id, template]));

export const isCanvasTemplateId = (value: string | null): value is CanvasTemplateId =>
  !!value && templateById.has(value as CanvasTemplateId);

export const getCanvasTemplate = (id: CanvasTemplateId): CanvasTemplateDefinition =>
  templateById.get(id)!;

export type MaterializedCanvasTemplateSpan = {
  x: number;
  text: string;
  width: number;
  color: string;
  bgColor?: string;
  attrs?: CanvasTemplateDefinition['rows'][number]['spans'][number]['attrs'];
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

/** Host resolves semantic colors; undefined background keeps the Host default. */
export type CanvasTemplateColorResolver = (color: CanvasTemplateColor) => string | undefined;
export const materializeCanvasTemplate = (
  id: CanvasTemplateId,
  resolveColor: CanvasTemplateColorResolver
): CanvasTemplateMaterialization => {
  const template = getCanvasTemplate(id);
  const rows = template.rows.map((row) => ({
    y: row.y,
    spans: row.spans.map(({ color, bgColor, ...span }) => {
      const background = bgColor ? resolveColor(bgColor) : undefined;
      return {
        ...span,
        width: getTextCellWidth(span.text),
        color: resolveColor(color) ?? '#000000',
        ...(background ? { bgColor: background } : {}),
      };
    }),
  }));
  const cells = new Map<string, GridCell>();
  rows.forEach((row) =>
    row.spans.forEach((span) => {
      let x = span.x;
      splitGraphemes(span.text).forEach((char) => {
        if (row.y >= 0 && row.y < template.height && x >= 0 && x < template.width)
          cells.set(`${x},${row.y}`, {
            char,
            color: span.color,
            ...(span.bgColor ? { bgColor: span.bgColor } : {}),
            ...(span.attrs ? { attrs: { ...span.attrs } } : {}),
            ...(span.href ? { href: span.href } : {}),
          });
        x += getCellOccupancy(char);
      });
    })
  );
  return Object.freeze({
    rows,
    source: createGridMapSource(cells),
    viewport: Object.freeze({ x: 0, y: 0, width: template.width, height: template.height }),
  });
};
export const getCanvasTemplateMaterialization = (
  id: CanvasTemplateId,
  theme: CharDeskContentTheme
): CanvasTemplateMaterialization => {
  const cache =
    materializationCache.get(theme) ?? new Map<CanvasTemplateId, CanvasTemplateMaterialization>();
  let result = cache.get(id);
  if (!result) {
    result = materializeCanvasTemplate(id, (color) =>
      typeof color === 'string' ? color : theme[color.token]
    );
    cache.set(id, result);
    materializationCache.set(theme, cache);
  }
  return result;
};

export const getCanvasTemplatesByGroup = (group: CanvasTemplateGroup) =>
  group === 'template' ? CANVAS_PAGE_TEMPLATES : CANVAS_COMPONENT_TEMPLATES;
