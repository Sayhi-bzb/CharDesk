import { CanvasPersistenceTimeoutError, CanvasWriteError, isCanvasReadViewport, readCanvasViewport, renderCanvasViewportImage, isCanvasSearchQuery,
  isCanvasSearchPosition, searchCanvasSurface, CanvasSearchError, type CanvasRuntime } from "@/domains/canvas/public";
import type { AgentToolContentBlock, AgentToolDefinition } from "./contracts";
import { isSourceBackedCanvasSession } from "@/domains/sessions/public";
import { describeCanvasWriteRendering, type CanvasToolRendering } from "./canvasRendering";
import { CHARDESK_CONTENT_THEMES } from "@chardesk/rendering/theme";
import { prepareCanvasPlainTextWrite, prepareCanvasRowsWrite, prepareCanvasTextWrite, type CanvasStrokeStyle } from "@/domains/canvas/public";
import type { CanvasSurfaceReader } from "@/domains/canvas/public";
import { getTextCellWidth } from "@chardesk/protocol";
import type { RichTextRow } from "@/domains/canvas/state/textCommandTypes";
import type { GridCell } from "@/shared/types";

import { CANVAS_READ_TOOL, CANVAS_WRITE_TOOL, CANVAS_SEARCH_TOOL, CANVAS_MANAGE_TOOL, CANVAS_ERASE_TOOL, CANVAS_FILL_TOOL, CANVAS_RENDER_TOOL } from "./canvasToolDefinitions";
export { CANVAS_READ_TOOL_NAME, CANVAS_WRITE_TOOL_NAME, CANVAS_SEARCH_TOOL_NAME, CANVAS_MANAGE_TOOL_NAME, CANVAS_ERASE_TOOL_NAME, CANVAS_FILL_TOOL_NAME, CANVAS_RENDER_TOOL_NAME } from "./canvasToolDefinitions";

type CanvasTargetHost = Pick<CanvasRuntime, "getState">;

const resolveCanvasTarget = (canvas: CanvasTargetHost, input: { canvasId?: unknown }) => {
  if (input.canvasId !== undefined && (typeof input.canvasId !== "string" || input.canvasId.length === 0)) return { error: "invalid_input" as const };
  const id = input.canvasId ?? canvas.getState().activeCanvasId;
  if (typeof id !== "string" || id.length === 0) return { error: "canvas_not_active" as const };
  const sessions = canvas.getState().canvasSessions;
  if (Array.isArray(sessions) && !sessions.some(({ id: sessionId }) => sessionId === id)) return { error: "canvas_not_found" as const };
  return { id, explicit: input.canvasId !== undefined };
};

const targetOutput = (target: { id: string; explicit: boolean }) => target.explicit ? { canvasId: target.id } : {};
type CanvasPersistenceHost = {
  persistence?: unknown;
  flushPersistence?: (sessionId?: string) => Promise<void>;
};
type CanvasMutationHost = Pick<CanvasRuntime, "ready" | "getState" | "materializeSession"> & CanvasPersistenceHost;
type CanvasPersistenceResult = {
  persisted: boolean;
  persistence: "saved" | "pending" | "failed" | "unavailable";
  persistenceError?: string;
};
const confirmCanvasPersistence = async (canvas: CanvasPersistenceHost, canvasId: string): Promise<CanvasPersistenceResult> => {
  if (!canvas.persistence || !canvas.flushPersistence) return { persisted: false, persistence: "unavailable" };
  try {
    await canvas.flushPersistence(canvasId);
    return { persisted: true, persistence: "saved" };
  } catch (error) {
    // Projection mutations are already applied at this point. Report the
    // durability state separately so Code Mode can return its operationId
    // instead of converting a persistence delay into a misleading execution
    // timeout or rolling back a valid projection edit.
    return {
      persisted: false,
      persistence: error instanceof CanvasPersistenceTimeoutError ? "pending" : "failed",
      ...(error instanceof CanvasPersistenceTimeoutError ? { persistenceError: error.message } : { persistenceError: error instanceof Error ? error.message : "Canvas persistence is pending." }),
    };
  }
};

type CanvasAppearanceRegion = Readonly<{ bounds: [number, number, number, number]; style: Record<string, unknown> }>;

const appearanceStyle = (cell: Pick<GridCell, "color" | "bgColor" | "attrs" | "href">, defaultForeground: string) => {
  const style: Record<string, unknown> = {};
  if (cell.color && cell.color.toLowerCase() !== defaultForeground.toLowerCase()) style.color = cell.color;
  if (cell.bgColor) style.bgColor = cell.bgColor;
  const attrs = cell.attrs && Object.fromEntries(Object.entries(cell.attrs).filter(([, enabled]) => enabled));
  if (attrs && Object.keys(attrs).length > 0) style.attrs = attrs;
  if (cell.href) style.href = cell.href;
  return style;
};

const collectCanvasAppearance = (
  surface: CanvasSurfaceReader,
  viewport: readonly [number, number, number, number] | null,
  defaultForeground: string,
): Readonly<{ theme: "light" | "dark"; regions: readonly CanvasAppearanceRegion[] }> => {
  if (!viewport) return { theme: "light", regions: [] };
  const [x, y, width, height] = viewport;
  const runs: Array<{ x: number; y: number; width: number; endY: number; key: string; style: Record<string, unknown> }> = [];
  surface.visit({ x, y, width, height }, (cellX, cellY, cell) => {
    const style = appearanceStyle(cell, defaultForeground);
    if (Object.keys(style).length === 0) return;
    const cellWidth = Math.max(1, getTextCellWidth(cell.char));
    const key = JSON.stringify(style);
    const previous = runs[runs.length - 1];
    if (previous && previous.y === cellY && previous.x + previous.width === cellX && previous.key === key) previous.width += cellWidth;
    else runs.push({ x: cellX, y: cellY, width: cellWidth, endY: cellY, key, style });
  });
  const grouped = new Map<string, typeof runs>();
  for (const run of runs) {
    const groupKey = `${run.key}\u0001${run.x}\u0001${run.width}`;
    const group = grouped.get(groupKey) ?? [];
    const previous = group[group.length - 1];
    if (previous && previous.endY + 1 === run.y) previous.endY = run.y;
    else group.push({ ...run });
    grouped.set(groupKey, group);
  }
  return {
    theme: defaultForeground.toLowerCase() === CHARDESK_CONTENT_THEMES.dark.foreground.toLowerCase() ? "dark" : "light",
    regions: [...grouped.values()].flat().sort((a, b) => a.y - b.y || a.x - b.x).map(({ x: regionX, y: regionY, width: regionWidth, endY, style }) => ({
      bounds: [regionX, regionY, regionWidth, endY - regionY + 1], style,
    })),
  };
};

type ModelImage = Readonly<{ mimeType: "image/png"; data: string; width: number; height: number; scale: number }>;
const MAX_MODEL_IMAGE_BYTES = 700 * 1024;

const isCanvasStrokeStyle = (value: unknown): value is CanvasStrokeStyle => {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.color !== undefined && typeof candidate.color !== "string") return false;
  if (candidate.bgColor !== undefined && typeof candidate.bgColor !== "string") return false;
  if (candidate.href !== undefined && typeof candidate.href !== "string") return false;
  if (candidate.attrs !== undefined && (!candidate.attrs || typeof candidate.attrs !== "object" || Array.isArray(candidate.attrs))) return false;
  return true;
};

const literalRows = (content: string, style: CanvasStrokeStyle, fallbackColor: string): readonly RichTextRow[] => {
  const normalized = content.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (lines.some((line) => /\p{Cc}/u.test(line))) throw new CanvasWriteError("invalid_input", "Content must be plain Unicode text; tabs and control characters are unsupported.");
  return lines.flatMap((text, y) => text ? [{
    y,
    spans: [{ x: 0, text, width: getTextCellWidth(text), color: style.color ?? fallbackColor,
      ...(style.bgColor ? { bgColor: style.bgColor } : {}), ...(style.attrs ? { attrs: style.attrs } : {}), ...(style.href ? { href: style.href } : {}) }],
  }] : []);
};

const blobAsBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === "string" ? reader.result : "";
    const comma = result.indexOf(",");
    if (comma < 0) reject(new Error("Invalid image data."));
    else resolve(result.slice(comma + 1));
  };
  reader.onerror = () => reject(reader.error ?? new Error("Unable to read image data."));
  reader.readAsDataURL(blob);
});

const svgToPng = async (image: { mimeType: string; data: string; width: number; height: number; scale: number }): Promise<ModelImage | null> => {
  if (image.mimeType !== "image/svg+xml" || typeof document === "undefined" || typeof Image === "undefined") return null;
  try {
    const element = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error("Unable to decode Canvas image."));
      next.src = `data:image/svg+xml;base64,${image.data}`;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.clearRect(0, 0, image.width, image.height);
    context.drawImage(element, 0, 0, image.width, image.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob || blob.size > MAX_MODEL_IMAGE_BYTES) return null;
    return { mimeType: "image/png", data: await blobAsBase64(blob), width: image.width, height: image.height, scale: image.scale };
  } catch { return null; }
};

export const createCanvasManageTool = (
  canvas: Pick<CanvasRuntime, "ready" | "getState"> & CanvasPersistenceHost & {
    commands: { sessions: Pick<CanvasRuntime["commands"]["sessions"], "create" | "rename" | "archive"> };
  },
  readOnly = false,
): AgentToolDefinition => ({
  ...CANVAS_MANAGE_TOOL,
  readOnly,
  execute: async (input) => {
    if (!Object.keys(input).every((key) => ["action", "canvasId", "name", "mode", "includeArchived"].includes(key))
      || !["list", "create", "rename", "archive"].includes(String(input.action))) {
      return { ok: false, code: "invalid_input", message: "Expected action: list, create, rename, or archive." };
    }
    if (readOnly && input.action !== "list") return { ok: false, code: "permission_denied", message: "Canvas lifecycle changes are unavailable on this surface." };
    try {
      await canvas.ready;
      const state = canvas.getState();
      if (input.action === "list") {
        let sessions = state.canvasSessions;
        if (input.includeArchived !== undefined && typeof input.includeArchived !== "boolean") {
          return { ok: false, code: "invalid_input", message: "includeArchived must be a boolean." };
        }
        if (input.canvasId !== undefined) {
          const target = resolveCanvasTarget(canvas, input);
          if ("error" in target) return { ok: false, code: target.error, message: target.error === "canvas_not_found" ? "Canvas not found." : "canvasId is required." };
          sessions = state.canvasSessions.filter((session) => session.id === target.id);
        }
        if (input.includeArchived !== true) sessions = sessions.filter((session) => session.archived !== true);
        const canvases = sessions.map((session) => ({
          canvasId: session.id, name: session.name, mode: session.mode,
        active: session.id === state.activeCanvasId,
        archived: session.archived === true,
        editable: !session.sourceBinding && !session.migrationPending && !session.archived,
        }));
        const currentCanvas = canvases.find(({ canvasId, archived }) => canvasId === state.activeCanvasId && !archived) ?? null;
        return { currentCanvasId: currentCanvas?.canvasId ?? null, currentCanvas, canvases };
      }
      if (input.action === "create") {
        if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim())) return { ok: false, code: "invalid_input", message: "name must be non-blank." };
        if (input.mode !== undefined && input.mode !== "freeform" && input.mode !== "slide") return { ok: false, code: "invalid_input", message: "mode must be freeform or slide." };
        const session = canvas.commands.sessions.create(input.mode === "slide" ? "slide" : "freeform", { name: input.name as string | undefined });
        const persisted = await confirmCanvasPersistence(canvas, session.id);
        return { canvasId: session.id, name: session.name, mode: session.mode, active: true, archived: false, ...persisted };
      }
      const target = resolveCanvasTarget(canvas, input);
      if ("error" in target) return { ok: false, code: target.error, message: target.error === "canvas_not_found" ? "Canvas not found." : "canvasId is required." };
      const session = state.canvasSessions.find(({ id }) => id === target.id);
      if (!session) return { ok: false, code: "canvas_not_found", message: "Canvas not found." };
      if (input.action === "rename") {
        if (typeof input.name !== "string" || !input.name.trim()) return { ok: false, code: "invalid_input", message: "name must be non-blank." };
        if (isSourceBackedCanvasSession(session)) return { ok: false, code: "permission_denied", message: "Source-backed Canvas names are managed by their source." };
        canvas.commands.sessions.rename(session.id, input.name);
        const persisted = await confirmCanvasPersistence(canvas, session.id);
        return { ...targetOutput(target), name: input.name.trim(), mode: session.mode, archived: session.archived === true, ...persisted };
      }
      if (!canvas.commands.sessions.archive(session.id)) return { ok: false, code: "archive_failed", message: "Canvas cannot be archived." };
      const persisted = await confirmCanvasPersistence(canvas, session.id);
      return { ...targetOutput(target), archived: true, ...persisted };
    } catch { return { ok: false, code: "canvas_not_ready", message: "Unable to manage Canvases." }; }
  },
});

export const createCanvasSearchTool = (
  canvas: Pick<CanvasRuntime, "ready" | "getState" | "materializeSession">,
): AgentToolDefinition => ({
  ...CANVAS_SEARCH_TOOL,
  execute: async (input) => {
    if (Object.keys(input).some((key) => !["canvasId", "query", "viewport", "after", "regex", "ignoreCase"].includes(key))
      || !isCanvasSearchQuery(input.query)
      || (input.viewport !== undefined && !isCanvasReadViewport(input.viewport))
      || (input.after !== undefined && !isCanvasSearchPosition(input.after))
      || (input.regex !== undefined && typeof input.regex !== "boolean")
      || (input.ignoreCase !== undefined && typeof input.ignoreCase !== "boolean")
      || (input.canvasId !== undefined && (typeof input.canvasId !== "string" || input.canvasId.length === 0))) {
      return { ok: false, code: "invalid_input", message: "Expected non-blank template rows, optional boolean regex/ignoreCase, viewport [x,y,width,height], and after [x,y]." };
    }
    let canvasId: string;
    let target: ReturnType<typeof resolveCanvasTarget>;
    let snapshot: Awaited<ReturnType<CanvasRuntime["materializeSession"]>>;
    try {
      await canvas.ready;
      target = resolveCanvasTarget(canvas, input);
      if ("error" in target) return { ok: false, code: target.error, message: target.error === "canvas_not_found" ? "Canvas not found." : "Open a Canvas first." };
      canvasId = target.id;
      snapshot = await canvas.materializeSession(canvasId);
      if (!snapshot) return { ok: false, code: "canvas_not_ready", message: "The Canvas content is not ready." };
    } catch {
      return { ok: false, code: "canvas_not_ready", message: "Unable to read the Canvas content." };
    }
    try {
      return { ...targetOutput(target), ...searchCanvasSurface(snapshot.surface, input.query, { viewport: input.viewport, after: input.after, regex: input.regex, ignoreCase: input.ignoreCase }) };
    } catch (error) {
      if (error instanceof CanvasSearchError) return { ok: false, code: error.code, message: error.message };
      return { ok: false, code: "search_failed", message: "Unable to search Canvas content." };
    }
  },
});

export const createCanvasWriteTool = (
  canvas: CanvasMutationHost & {
    commands: { text: Pick<CanvasRuntime["commands"]["text"], "writeRowsAt"> & Partial<Pick<CanvasRuntime["commands"]["text"], "writeRowsAtSession">> };
  },
  legacyRendering?: CanvasToolRendering,
): AgentToolDefinition => ({
  ...CANVAS_WRITE_TOOL,
  execute: async (input) => {
    if (input.writeMode !== undefined && legacyRendering) {
      const { writeMode: _writeMode, content, ...rest } = input;
      return createCanvasRenderTool(canvas as Parameters<typeof createCanvasRenderTool>[0], legacyRendering).execute({ ...rest, source: content, format: "auto", writeMode: _writeMode });
    }
    const at = input.at;
    if (Object.keys(input).some((key) => !["canvasId", "at", "content", "style"].includes(key))
      || !Array.isArray(at) || at.length !== 2 || !at.every(Number.isSafeInteger)
      || typeof input.content !== "string" || !isCanvasStrokeStyle(input.style)) {
      return { ok: false, code: "invalid_input", message: "Expected { at: [x,y], content: literal Unicode, style?: object }." };
    }
    const target = resolveCanvasTarget(canvas, input);
    if ("error" in target) return { ok: false, code: target.error, message: target.error === "canvas_not_found" ? "Canvas not found." : "Open a Canvas first." };
    try {
      await canvas.ready;
      if (!await canvas.materializeSession(target.id)) return { ok: false, code: "canvas_not_ready", message: "The target Canvas content is not ready." };
      const state = canvas.getState();
      const session = state.canvasSessions.find(({ id }) => id === target.id);
      if (session?.migrationPending) return { ok: false, code: "canvas_not_ready", message: "Wait for this Canvas migration to finish before writing." };
      if (session && isSourceBackedCanvasSession(session)) return { ok: false, code: "source_backed_canvas", message: "Edit the source file of this Canvas instead of its projection." };
      const rows = literalRows(input.content, input.style as CanvasStrokeStyle | undefined ?? {}, state.brushColor);
      const atPoint = { x: at[0]!, y: at[1]! };
      const result = target.id === state.activeCanvasId
        ? canvas.commands.text.writeRowsAt(rows, atPoint, "patch")
        : canvas.commands.text.writeRowsAtSession?.(target.id, rows, atPoint, "patch");
      if (target.id !== state.activeCanvasId && !result) return { ok: false, code: "write_failed", message: "Targeted Canvas writes are unavailable on this host." };
      const persisted = await confirmCanvasPersistence(canvas, target.id);
      return { ...targetOutput(target), ...persisted, ...(input.writeMode ? { writeMode: input.writeMode } : {}), ...(result ?? { bounds: null, writtenCells: 0, skippedWhitespaceCells: 0 }) };
    } catch (error) {
      return { ok: false, code: error instanceof CanvasWriteError ? error.code : "write_failed", message: error instanceof Error ? error.message : "Unable to write Canvas content." };
    }
  },
});

export const createCanvasEraseTool = (
  canvas: CanvasMutationHost & {
    commands: { text: Partial<Pick<CanvasRuntime["commands"]["text"], "eraseAt" | "eraseAtSession">> };
  },
): AgentToolDefinition => ({
  ...CANVAS_ERASE_TOOL,
  execute: async (input) => {
    const at = input.at;
    const size = input.size;
    if (Object.keys(input).some((key) => !["canvasId", "at", "size"].includes(key))
      || !Array.isArray(at) || at.length !== 2 || !at.every(Number.isSafeInteger)
      || !Array.isArray(size) || size.length !== 2 || !size.every((value) => Number.isSafeInteger(value) && value > 0)) {
      return { ok: false, code: "invalid_input", message: "Expected { at: [x,y], size: [width,height] } with positive safe integers." };
    }
    const target = resolveCanvasTarget(canvas, input);
    if ("error" in target) return { ok: false, code: target.error, message: target.error === "canvas_not_found" ? "Canvas not found." : "Open a Canvas first." };
    try {
      await canvas.ready;
      if (!await canvas.materializeSession(target.id)) return { ok: false, code: "canvas_not_ready", message: "The target Canvas content is not ready." };
      const state = canvas.getState();
      const session = state.canvasSessions.find(({ id }) => id === target.id);
      if (session?.migrationPending) return { ok: false, code: "canvas_not_ready", message: "Wait for this Canvas migration to finish before erasing." };
      if (session && isSourceBackedCanvasSession(session)) return { ok: false, code: "source_backed_canvas", message: "Edit the source file of this Canvas instead of its projection." };
      const point = { x: at[0]!, y: at[1]! };
      const result = target.id === state.activeCanvasId
        ? canvas.commands.text.eraseAt?.(point, [size[0]!, size[1]!])
        : canvas.commands.text.eraseAtSession?.(target.id, point, [size[0]!, size[1]!]);
      if (target.id !== state.activeCanvasId && !result) return { ok: false, code: "erase_failed", message: "Targeted Canvas erases are unavailable on this host." };
      const persisted = await confirmCanvasPersistence(canvas, target.id);
      return { ...targetOutput(target), ...persisted, bounds: result?.bounds ?? [point.x, point.y, size[0]!, size[1]!], erasedCells: size[0]! * size[1]! };
    } catch (error) {
      return { ok: false, code: error instanceof CanvasWriteError ? error.code : "erase_failed", message: error instanceof Error ? error.message : "Unable to erase Canvas content." };
    }
  },
});

export const createCanvasFillTool = (
  canvas: CanvasMutationHost & {
    commands: { text: Pick<CanvasRuntime["commands"]["text"], "writeRowsAt"> & Partial<Pick<CanvasRuntime["commands"]["text"], "writeRowsAtSession">> };
  },
): AgentToolDefinition => ({
  ...CANVAS_FILL_TOOL,
  execute: async (input) => {
    const at = input.at;
    const size = input.size;
    if (Object.keys(input).some((key) => !["canvasId", "at", "size", "style"].includes(key))
      || !Array.isArray(at) || at.length !== 2 || !at.every(Number.isSafeInteger)
      || !Array.isArray(size) || size.length !== 2 || !size.every((value) => Number.isSafeInteger(value) && value > 0)
      || !isCanvasStrokeStyle(input.style)) {
      return { ok: false, code: "invalid_input", message: "Expected { at: [x,y], size: [width,height], style: object }." };
    }
    const target = resolveCanvasTarget(canvas, input);
    if ("error" in target) return { ok: false, code: target.error, message: target.error === "canvas_not_found" ? "Canvas not found." : "Open a Canvas first." };
    try {
      await canvas.ready;
      const snapshot = await canvas.materializeSession(target.id);
      if (!snapshot) return { ok: false, code: "canvas_not_ready", message: "The target Canvas content is not ready." };
      const state = canvas.getState();
      const session = state.canvasSessions.find(({ id }) => id === target.id);
      if (session?.migrationPending) return { ok: false, code: "canvas_not_ready", message: "Wait for this Canvas migration to finish before styling." };
      if (session && isSourceBackedCanvasSession(session)) return { ok: false, code: "source_backed_canvas", message: "Edit the source file of this Canvas instead of its projection." };
      const origin = { x: at[0]!, y: at[1]! };
      const style = input.style as CanvasStrokeStyle;
      const rows: RichTextRow[] = [];
      for (const row of snapshot.surface.rows({ x: origin.x, y: origin.y, width: size[0]!, height: size[1]! })) {
        const spans = row.spans.flatMap((span) => {
          let x = span.x;
          return span.cells.flatMap((cell) => {
            const cellX = x;
            x += getTextCellWidth(cell.char);
            if (/^\s+$/u.test(cell.char)) return [];
            return [{ x: cellX - origin.x, text: cell.char, width: getTextCellWidth(cell.char), color: style.color ?? cell.color,
              bgColor: style.bgColor ?? cell.bgColor, attrs: style.attrs ?? cell.attrs, href: style.href ?? cell.href }];
          });
        });
        if (spans.length > 0) rows.push({ y: row.y - origin.y, spans });
      }
      const result = target.id === state.activeCanvasId
        ? canvas.commands.text.writeRowsAt(rows, origin, "patch")
        : canvas.commands.text.writeRowsAtSession?.(target.id, rows, origin, "patch");
      if (target.id !== state.activeCanvasId && !result) return { ok: false, code: "fill_failed", message: "Targeted Canvas fills are unavailable on this host." };
      const persisted = await confirmCanvasPersistence(canvas, target.id);
      return { ...targetOutput(target), ...persisted, bounds: [origin.x, origin.y, size[0]!, size[1]!], styledCells: result?.writtenCells ?? 0 };
    } catch (error) {
      return { ok: false, code: error instanceof CanvasWriteError ? error.code : "fill_failed", message: error instanceof Error ? error.message : "Unable to style Canvas content." };
    }
  },
});

export const createCanvasRenderTool = (
  canvas: CanvasMutationHost & {
    commands: { text: Pick<CanvasRuntime["commands"]["text"], "writeAt" | "writeRowsAt"> & Partial<Pick<CanvasRuntime["commands"]["text"], "writeAtSession" | "writeRowsAtSession">> };
  },
  rendering: CanvasToolRendering,
): AgentToolDefinition => ({
  ...CANVAS_RENDER_TOOL,
  execute: async (input) => {
    const at = input.at;
    const renderWriteMode = input.writeMode === undefined ? "replace" : input.writeMode;
    if (Object.keys(input).some((key) => !["canvasId", "at", "source", "format", "writeMode"].includes(key))
      || !Array.isArray(at) || at.length !== 2 || !at.every(Number.isSafeInteger) || typeof input.source !== "string"
      || (input.format !== undefined && !["auto", "raw", "ansi", "markdown"].includes(String(input.format)))
      || (renderWriteMode !== "patch" && renderWriteMode !== "replace")) {
      return { ok: false, code: "invalid_input", message: "Expected { at: [x,y], source: string, format?: auto|raw|ansi|markdown } with safe integer coordinates." };
    }
    const target = resolveCanvasTarget(canvas, input);
    if ("error" in target) return { ok: false, code: target.error, message: target.error === "canvas_not_found" ? "Canvas not found." : "Open a Canvas first." };
    const canvasId = target.id;
    try {
      await canvas.ready;
      if (!await canvas.materializeSession(canvasId)) return { ok: false, code: "canvas_not_ready", message: "The target Canvas content is not ready." };
    } catch {
      return { ok: false, code: "canvas_not_ready", message: "The Canvas content is not ready." };
    }
    const state = canvas.getState();
    try {
      const session = state.canvasSessions.find(({ id }) => id === canvasId);
      if (session?.migrationPending) {
        return { ok: false, code: "canvas_not_ready", message: "Wait for this Canvas migration to finish before writing." };
      }
      if (session && isSourceBackedCanvasSession(session)) {
        throw new CanvasWriteError("source_backed_canvas", "Edit the source files of this Canvas instead of its projection.");
      }
      const rendererMode = input.format === "auto" || input.format === undefined ? undefined : input.format as "raw" | "ansi" | "markdown";
      const rendered = await rendering.render(input.source, state.brushColor, { ...rendering.getContext(), ...(rendererMode ? { rendererMode } : {}) });
      const current = canvas.getState();
      const currentSession = current.canvasSessions.find(({ id }) => id === canvasId);
      if (!currentSession || currentSession.migrationPending || isSourceBackedCanvasSession(currentSession)) {
        return { ok: false, code: currentSession?.migrationPending ? "canvas_not_ready" : "write_failed",
          message: currentSession?.migrationPending ? "The target Canvas migration changed during rendering; nothing was written." : "The target Canvas changed during rendering; nothing was written." };
      }
      if (canvasId === state.activeCanvasId && (current.activeCanvasId !== canvasId || current.slideDeck?.activeSlideId !== state.slideDeck?.activeSlideId)) {
        return { ok: false, code: "write_failed", message: "The active Canvas or Slide changed during rendering; nothing was written. Read the current target again." };
      }
      const position = { x: at[0], y: at[1] };
      const result = rendered.kind === "plain"
        ? canvasId === state.activeCanvasId
          ? canvas.commands.text.writeAt(rendered.text, position, renderWriteMode as "patch" | "replace")
          : canvas.commands.text.writeAtSession?.(canvasId, rendered.text, position, state.brushColor, renderWriteMode as "patch" | "replace")
        : canvasId === state.activeCanvasId
          ? canvas.commands.text.writeRowsAt(rendered.rows, position, renderWriteMode as "patch" | "replace")
          : canvas.commands.text.writeRowsAtSession?.(canvasId, rendered.rows, position, renderWriteMode as "patch" | "replace");
      if (canvasId !== state.activeCanvasId && !result) {
        return { ok: false, code: "write_failed", message: "Targeted Canvas writes are unavailable on this host." };
      }
      const persisted = await confirmCanvasPersistence(canvas, canvasId);
      return { ...targetOutput(target), ...persisted, ...(result ?? { bounds: null, writtenCells: 0, skippedWhitespaceCells: 0 }) };
    } catch (error) {
      return { ok: false, code: error instanceof CanvasWriteError ? error.code : "write_failed",
        message: error instanceof CanvasWriteError ? error.message : "Unable to write Canvas content." };
    }
  },
});

/** Render and prepare a write without mutating the Canvas document. Used by
 * Canvas Code preview so it shares the exact renderer and Cell placement rules
 * with the real write path. */
export const createCanvasPreviewRenderTool = (
  canvas: Pick<CanvasRuntime, "ready" | "getState">,
  rendering: CanvasToolRendering,
): AgentToolDefinition => ({
  name: "chardesk_canvas_preview_write",
  title: "Preview Canvas text",
  description: "Render Canvas text and calculate its Cell footprint without mutating the document.",
  readOnly: true,
  inputSchema: { type: "object", properties: {
    canvasId: { type: "string", minLength: 1 },
    at: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
    source: { type: "string" },
    format: { enum: ["auto", "raw", "ansi", "markdown"] },
  }, required: ["at", "source"], additionalProperties: false },
  execute: async (input) => {
    const at = input.at;
    if (Object.keys(input).some((key) => !["canvasId", "at", "source", "format"].includes(key))
      || !Array.isArray(at) || at.length !== 2 || !at.every(Number.isSafeInteger)
      || typeof input.source !== "string" || (input.format !== undefined && !["auto", "raw", "ansi", "markdown"].includes(String(input.format)))) {
      return { ok: false, code: "invalid_input", message: "Expected { at: [x,y], source: string, format?: auto|raw|ansi|markdown }." };
    }
    try {
      await canvas.ready;
      const target = resolveCanvasTarget(canvas, input);
      if ("error" in target) return { ok: false, code: target.error, message: target.error === "canvas_not_found" ? "Canvas not found." : "Open a Canvas first." };
      const state = canvas.getState();
      const rendererMode = input.format === "auto" || input.format === undefined ? undefined : input.format as "raw" | "ansi" | "markdown";
      const rendered = await rendering.render(input.source, state.brushColor, { ...rendering.getContext(), ...(rendererMode ? { rendererMode } : {}) });
      const prepared = rendered.kind === "plain"
        ? prepareCanvasTextWrite({ x: at[0]!, y: at[1]! }, rendered.text, state.brushColor, "replace")
        : prepareCanvasRowsWrite({ x: at[0]!, y: at[1]! }, rendered.rows, "replace");
      return {
        ...targetOutput(target),
        preview: true,
        bounds: prepared.bounds,
        writtenCells: prepared.writtenCells,
        skippedWhitespaceCells: prepared.skippedWhitespaceCells,
        rendered: rendered.kind === "plain"
          ? { kind: "plain", text: rendered.text }
          : { kind: "spans", rows: rendered.rows },
      };
    } catch {
      return { ok: false, code: "preview_failed", message: "Unable to render the Canvas write preview." };
    }
  },
});

export const createCanvasPreviewWriteTool = (
  canvas: Pick<CanvasRuntime, "ready" | "getState">,
): AgentToolDefinition => ({
  ...CANVAS_WRITE_TOOL,
  readOnly: true,
  execute: async (input) => {
    const at = input.at;
    if (Object.keys(input).some((key) => !["canvasId", "at", "content", "style"].includes(key))
      || !Array.isArray(at) || at.length !== 2 || !at.every(Number.isSafeInteger)
      || typeof input.content !== "string" || !isCanvasStrokeStyle(input.style)) {
      return { ok: false, code: "invalid_input", message: "Expected { at: [x,y], content: literal Unicode, style?: object }." };
    }
    try {
      await canvas.ready;
      const target = resolveCanvasTarget(canvas, input);
      if ("error" in target) return { ok: false, code: target.error, message: target.error === "canvas_not_found" ? "Canvas not found." : "Open a Canvas first." };
      const style = input.style as CanvasStrokeStyle | undefined;
      const prepared = prepareCanvasPlainTextWrite({ x: at[0]!, y: at[1]! }, input.content, { color: style?.color ?? canvas.getState().brushColor, ...style });
      return { ...targetOutput(target), preview: true, bounds: prepared.bounds, writtenCells: prepared.writtenCells, skippedWhitespaceCells: prepared.skippedWhitespaceCells, content: input.content };
    } catch (error) {
      return { ok: false, code: error instanceof CanvasWriteError ? error.code : "preview_failed", message: error instanceof Error ? error.message : "Unable to preview the Canvas stroke." };
    }
  },
});

export const createCanvasReadTool = (
  canvas: Pick<CanvasRuntime, "ready" | "getState" | "materializeSession">,
  rendering: CanvasToolRendering,
): AgentToolDefinition => ({
  ...CANVAS_READ_TOOL,
  execute: async (input) => {
    const representation = input.representation === undefined ? "text" : input.representation;
    const style = input.style === undefined ? "none" : input.style;
    const detail = input.detail === undefined ? "auto" : input.detail;
    if (Object.keys(input).some((key) => !["canvasId", "viewport", "representation", "style", "detail"].includes(key))
      || (input.canvasId !== undefined && (typeof input.canvasId !== "string" || input.canvasId.length === 0))
      || (input.viewport !== undefined && !isCanvasReadViewport(input.viewport))
      || !["text", "cells", "image", "both"].includes(String(representation))
      || !["none", "appearance"].includes(String(style))
      || !["low", "high", "original", "auto"].includes(String(detail))) {
      return { ok: false, code: "invalid_input", message: "Expected an optional viewport [x,y,width,height], representation text|cells|image|both, style none|appearance, and image detail low|high|original|auto." };
    }
    try {
      await canvas.ready;
      const target = resolveCanvasTarget(canvas, input);
      if ("error" in target) return { ok: false, code: target.error, message: target.error === "canvas_not_found" ? "Canvas not found." : "Open a Canvas first." };
      const canvasId = target.id;
      const snapshot = await canvas.materializeSession(canvasId);
      if (!snapshot) return { ok: false, code: "canvas_not_ready", message: "The Canvas content is not ready." };
      const result = readCanvasViewport(snapshot.surface, input.viewport, {
        defaultForeground: CHARDESK_CONTENT_THEMES[rendering.getContext().themeMode].foreground,
        includeStyles: style === "appearance",
      });
      const defaultForeground = CHARDESK_CONTENT_THEMES[rendering.getContext().themeMode].foreground;
      const appearance = style === "appearance" && representation !== "cells" && !result.overviewOnly
        ? { ...collectCanvasAppearance(snapshot.surface, result.viewport, defaultForeground), theme: rendering.getContext().themeMode }
        : null;
      const renderingNote = style === "appearance" && !result.overviewOnly ? describeCanvasWriteRendering(rendering) : "";
      const cells = representation === "cells" && result.viewport && !result.overviewOnly
        ? (() => { const collected: Array<Record<string, unknown>> = []; snapshot.surface.visit({ x: result.viewport![0], y: result.viewport![1], width: result.viewport![2], height: result.viewport![3] }, (x, y, cell) => collected.push({ x, y, ...cell })); return collected; })()
        : [];
      const appearanceText = appearance ? result.content.replace("\nstyles:", "\nappearance:") : result.content;
      const textContent = representation === "cells" ? "" : [appearanceText, renderingNote].filter(Boolean).join("\n\n");
      const contentBlocks: AgentToolContentBlock[] = [];
      if (representation === "text" || representation === "both") contentBlocks.push({ type: "text", text: textContent });
      if (representation === "cells") contentBlocks.push({ type: "note", text: `Projection cells: ${cells.length}` });
      const renderedImage = (representation === "image" || representation === "both") && result.viewport
        ? renderCanvasViewportImage(snapshot.surface, result.viewport, detail as "low" | "high" | "original" | "auto")
        : null;
      const image = renderedImage ? await svgToPng(renderedImage) : null;
      if (image) contentBlocks.push({ type: "image", ...image });
      if (representation === "image" && !image) {
        contentBlocks.push({ type: "note", text: result.viewport ? "Image unavailable; use representation: text." : "No Canvas content is available for this image viewport." });
      }
      const structuredContent = {
        ...targetOutput(target),
        viewport: result.viewport,
        sampleSize: result.sampleSize,
        mode: result.mode,
        overviewOnly: result.overviewOnly,
        representation,
        style,
        appearance,
        detail,
        cells,
        image: image ? { mimeType: image.mimeType, width: image.width, height: image.height, scale: image.scale } : null,
      };
      return {
        ...structuredContent,
        content: representation === "image" || representation === "cells" ? "" : textContent,
        contentBlocks,
        structuredContent,
      };
    } catch {
      return { ok: false, code: "canvas_not_ready", message: "Unable to read the Canvas content." };
    }
  },
});
