import type { CanvasSurfaceReader, GridCell } from '@chardesk/cell-plane';
import { COLOR_PRIMARY_TEXT } from '@chardesk/cell-plane/constants';
import { isDefaultArtifactForeground } from '@chardesk/cell-plane/artifact-style';
import { getTextCellWidth } from '@chardesk/protocol';
import type { CharDeskCanvasPalette } from '@chardesk/rendering/canvas';
import {
  isCanvasReadViewport,
  readCanvasViewport,
  type CanvasReadViewport,
  type CanvasReadImageDetail,
} from './readViewport';
import {
  CANVAS_READ_IMAGE_LIMITS,
  captureCanvasReadImage,
  type CanvasReadImageRenderer,
} from './readImage';
import type { AgentToolContentBlock } from './types';

export type CanvasReadRequest = Readonly<{
  canvasId?: string;
  pageId?: string;
  viewport?: CanvasReadViewport;
  representation: 'text' | 'cells' | 'image' | 'both';
  style: 'none' | 'appearance';
  detail: CanvasReadImageDetail;
}>;
export const INVALID_CANVAS_READ = Object.freeze({
  ok: false,
  code: 'invalid_input',
  message:
    'Expected an optional viewport [x,y,width,height], representation text|cells|image|both, style none|appearance, and image detail low|high|original|auto.',
});

const isChoice = <T extends string>(value: unknown, choices: readonly T[]): value is T =>
  choices.some((choice) => choice === value);

export function parseCanvasReadRequest(input: Record<string, unknown>): CanvasReadRequest | null {
  const { canvasId, pageId, viewport } = input;
  const representation = input.representation === undefined ? 'text' : input.representation;
  const style = input.style === undefined ? 'none' : input.style;
  const detail = input.detail === undefined ? 'auto' : input.detail;
  if (
    Object.keys(input).some(
      (key) =>
        !['canvasId', 'pageId', 'viewport', 'representation', 'style', 'detail'].includes(key)
    ) ||
    (canvasId !== undefined && (typeof canvasId !== 'string' || !canvasId)) ||
    (pageId !== undefined && (typeof pageId !== 'string' || !pageId)) ||
    (viewport !== undefined && !isCanvasReadViewport(viewport)) ||
    !isChoice(representation, ['text', 'cells', 'image', 'both']) ||
    !isChoice(style, ['none', 'appearance']) ||
    !isChoice(detail, ['low', 'high', 'original', 'auto'])
  )
    return null;
  return { canvasId, pageId, viewport, representation, style, detail };
}

export type CanvasReadAppearance = Readonly<{
  theme: 'light' | 'dark';
  palette: CharDeskCanvasPalette;
  renderingNote?: string;
}>;

const appearanceStyle = (cell: GridCell) => {
  const style: Record<string, unknown> = {};
  if (cell.color && !isDefaultArtifactForeground(cell)) style.color = cell.color;
  if (cell.bgColor) style.bgColor = cell.bgColor;
  const attrs =
    cell.attrs && Object.fromEntries(Object.entries(cell.attrs).filter(([, enabled]) => enabled));
  if (attrs && Object.keys(attrs).length) style.attrs = attrs;
  if (cell.href) style.href = cell.href;
  return style;
};

function collectCanvasAppearance(
  surface: CanvasSurfaceReader,
  viewport: CanvasReadViewport | null,
  theme: 'light' | 'dark'
) {
  if (!viewport) return { theme, regions: [] };
  const [x, y, width, height] = viewport;
  const runs: Array<{
    x: number;
    y: number;
    width: number;
    endY: number;
    key: string;
    style: Record<string, unknown>;
  }> = [];
  surface.visit({ x, y, width, height }, (cellX, cellY, cell) => {
    const style = appearanceStyle(cell);
    if (!Object.keys(style).length) return;
    const cellWidth = Math.max(1, getTextCellWidth(cell.char));
    const key = JSON.stringify(style),
      previous = runs.at(-1);
    if (
      previous &&
      previous.y === cellY &&
      previous.x + previous.width === cellX &&
      previous.key === key
    )
      previous.width += cellWidth;
    else runs.push({ x: cellX, y: cellY, width: cellWidth, endY: cellY, key, style });
  });
  const grouped = new Map<string, typeof runs>();
  for (const run of runs) {
    const key = `${run.key}\u0001${run.x}\u0001${run.width}`;
    const group = grouped.get(key) ?? [],
      previous = group.at(-1);
    if (previous && previous.endY + 1 === run.y) previous.endY = run.y;
    else group.push({ ...run });
    grouped.set(key, group);
  }
  return {
    theme,
    regions: [...grouped.values()]
      .flat()
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map(({ x, y, width, endY, style }) => ({ bounds: [x, y, width, endY - y + 1], style })),
  };
}

const base64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
};

/** One transport-neutral read result. Hosts resolve targets and encode the captured image plan. */
export async function readCanvasSurface(
  surface: CanvasSurfaceReader,
  request: CanvasReadRequest,
  host: CanvasReadAppearance & {
    target?: { canvasId?: string; pageId?: string };
    renderImage: CanvasReadImageRenderer;
  }
) {
  const { representation, style, detail } = request;
  const target = { ...host.target };
  const result = readCanvasViewport(surface, request.viewport, {
    defaultForeground: COLOR_PRIMARY_TEXT,
    includeStyles: style === 'appearance',
  });
  const appearance =
    style === 'appearance' && representation !== 'cells' && !result.overviewOnly
      ? collectCanvasAppearance(surface, result.viewport, host.theme)
      : null;
  const cells: Array<Record<string, unknown>> = [];
  if (representation === 'cells' && result.viewport && !result.overviewOnly) {
    const [x, y, width, height] = result.viewport;
    surface.visit({ x, y, width, height }, (x, y, cell) =>
      cells.push({ x, y, ...cell, ...(cell.attrs ? { attrs: { ...cell.attrs } } : {}) })
    );
  }
  const text = appearance ? result.content.replace('\nstyles:', '\nappearance:') : result.content;
  const content =
    representation === 'cells' || representation === 'image'
      ? ''
      : [text, style === 'appearance' && !result.overviewOnly ? host.renderingNote : '']
          .filter(Boolean)
          .join('\n\n');
  const contentBlocks: AgentToolContentBlock[] = [];
  if (representation === 'text' || representation === 'both')
    contentBlocks.push({ type: 'text', text: content });
  if (representation === 'cells')
    contentBlocks.push({ type: 'note', text: `Projection cells: ${cells.length}` });
  let image: { mimeType: 'image/png'; width: number; height: number; scale: number } | null = null;
  if (representation === 'image' || representation === 'both') {
    if (result.viewport) {
      const plan = captureCanvasReadImage(surface, result.viewport, detail, host.palette);
      try {
        const bytes = await host.renderImage(plan);
        if (bytes && bytes.length > 0 && bytes.length <= CANVAS_READ_IMAGE_LIMITS.bytes) {
          image = {
            mimeType: 'image/png',
            width: plan.width,
            height: plan.height,
            scale: plan.scale,
          };
          contentBlocks.push({ type: 'image', ...image, data: base64(bytes) });
        }
      } catch {
        /* A raster Host failure must not discard a successful text read. */
      }
    }
    if (!image)
      contentBlocks.push({
        type: 'note',
        text: result.viewport
          ? 'Image unavailable; use representation: text.'
          : 'No Canvas content is available for this image viewport.',
      });
  }
  const structuredContent = {
    ...target,
    viewport: result.viewport,
    sampleSize: result.sampleSize,
    mode: result.mode,
    overviewOnly: result.overviewOnly,
    representation,
    style,
    appearance,
    detail,
    cells,
    image,
  };
  const response = { ...structuredContent, content, contentBlocks, structuredContent };
  // Leave room for transport envelopes within the MCP/CLI 1 MiB message limit.
  if (
    image &&
    new TextEncoder().encode(JSON.stringify(response)).length >
      CANVAS_READ_IMAGE_LIMITS.responseBytes
  ) {
    return {
      ...response,
      image: null,
      structuredContent: { ...structuredContent, image: null },
      contentBlocks: [
        ...contentBlocks.filter((block) => block.type !== 'image'),
        {
          type: 'note' as const,
          text: 'Image exceeds response budget; use a smaller viewport or lower detail.',
        },
      ],
    };
  }
  return response;
}
