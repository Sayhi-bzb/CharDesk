import { CanvasWriteError, isCanvasReadViewport, readCanvasViewport, renderCanvasViewportImage, isCanvasSearchQuery,
  isCanvasSearchPosition, searchCanvasSurface, CanvasSearchError, type CanvasRuntime } from "@/domains/canvas/public";
import type { AgentToolContentBlock, AgentToolDefinition } from "./contracts";
import { isSourceBackedCanvasSession } from "@/domains/sessions/public";
import { describeCanvasWriteRendering, type CanvasToolRendering } from "./canvasRendering";
import { CHARDESK_CONTENT_THEMES } from "@chardesk/rendering/theme";
import { prepareCanvasRowsWrite, prepareCanvasTextWrite } from "@/domains/canvas/writeText";

import { CANVAS_READ_TOOL, CANVAS_WRITE_TOOL, CANVAS_SEARCH_TOOL, CANVAS_MANAGE_TOOL } from "./canvasToolDefinitions";
export { CANVAS_READ_TOOL_NAME, CANVAS_WRITE_TOOL_NAME, CANVAS_SEARCH_TOOL_NAME, CANVAS_MANAGE_TOOL_NAME } from "./canvasToolDefinitions";

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

type ModelImage = Readonly<{ mimeType: "image/png"; data: string; width: number; height: number; scale: number }>;
const MAX_MODEL_IMAGE_BYTES = 700 * 1024;

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
  canvas: Pick<CanvasRuntime, "ready" | "getState"> & {
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
        return { canvasId: session.id, name: session.name, mode: session.mode, active: true, archived: false };
      }
      const target = resolveCanvasTarget(canvas, input);
      if ("error" in target) return { ok: false, code: target.error, message: target.error === "canvas_not_found" ? "Canvas not found." : "canvasId is required." };
      const session = state.canvasSessions.find(({ id }) => id === target.id);
      if (!session) return { ok: false, code: "canvas_not_found", message: "Canvas not found." };
      if (input.action === "rename") {
        if (typeof input.name !== "string" || !input.name.trim()) return { ok: false, code: "invalid_input", message: "name must be non-blank." };
        if (isSourceBackedCanvasSession(session)) return { ok: false, code: "permission_denied", message: "Source-backed Canvas names are managed by their source." };
        canvas.commands.sessions.rename(session.id, input.name);
        return { ...targetOutput(target), name: input.name.trim(), mode: session.mode, archived: session.archived === true };
      }
      if (!canvas.commands.sessions.archive(session.id)) return { ok: false, code: "archive_failed", message: "Canvas cannot be archived." };
      return { ...targetOutput(target), archived: true };
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
  canvas: Pick<CanvasRuntime, "ready" | "getState" | "materializeSession"> & {
    commands: { text: Pick<CanvasRuntime["commands"]["text"], "writeAt" | "writeRowsAt"> & Partial<Pick<CanvasRuntime["commands"]["text"], "writeAtSession" | "writeRowsAtSession">> };
  },
  rendering: CanvasToolRendering,
): AgentToolDefinition => ({
  ...CANVAS_WRITE_TOOL,
  execute: async (input) => {
    const at = input.at;
    const writeMode = input.writeMode === undefined ? "patch" : input.writeMode;
    if (Object.keys(input).some((key) => !["canvasId", "at", "content", "writeMode"].includes(key))
      || !Array.isArray(at) || at.length !== 2 || !at.every(Number.isSafeInteger) || typeof input.content !== "string") {
      return { ok: false, code: "invalid_input", message: "Expected { at: [x,y], content: string } with safe integer coordinates." };
    }
    if (writeMode !== "patch" && writeMode !== "replace") {
      return { ok: false, code: "invalid_input", message: "writeMode must be patch or replace." };
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
      const rendered = await rendering.render(input.content, state.brushColor, rendering.getContext());
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
          ? canvas.commands.text.writeAt(rendered.text, position, writeMode)
          : canvas.commands.text.writeAtSession?.(canvasId, rendered.text, position, state.brushColor, writeMode)
        : canvasId === state.activeCanvasId
          ? canvas.commands.text.writeRowsAt(rendered.rows, position, writeMode)
          : canvas.commands.text.writeRowsAtSession?.(canvasId, rendered.rows, position, writeMode);
      if (canvasId !== state.activeCanvasId && !result) {
        return { ok: false, code: "write_failed", message: "Targeted Canvas writes are unavailable on this host." };
      }
      return { ...targetOutput(target), writeMode, ...(result ?? { bounds: null, writtenCells: 0, skippedWhitespaceCells: 0 }) };
    } catch (error) {
      return { ok: false, code: error instanceof CanvasWriteError ? error.code : "write_failed",
        message: error instanceof CanvasWriteError ? error.message : "Unable to write Canvas content." };
    }
  },
});

/** Render and prepare a write without mutating the Canvas document. Used by
 * Canvas Code preview so it shares the exact renderer and Cell placement rules
 * with the real write path. */
export const createCanvasPreviewWriteTool = (
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
    content: { type: "string" },
    writeMode: { enum: ["patch", "replace"], default: "patch" },
  }, required: ["at", "content"], additionalProperties: false },
  execute: async (input) => {
    const at = input.at;
    const writeMode = input.writeMode === undefined ? "patch" : input.writeMode;
    if (Object.keys(input).some((key) => !["canvasId", "at", "content", "writeMode"].includes(key))
      || !Array.isArray(at) || at.length !== 2 || !at.every(Number.isSafeInteger)
      || typeof input.content !== "string" || (writeMode !== "patch" && writeMode !== "replace")) {
      return { ok: false, code: "invalid_input", message: "Expected { at: [x,y], content: string, writeMode?: patch|replace }." };
    }
    try {
      await canvas.ready;
      const target = resolveCanvasTarget(canvas, input);
      if ("error" in target) return { ok: false, code: target.error, message: target.error === "canvas_not_found" ? "Canvas not found." : "Open a Canvas first." };
      const state = canvas.getState();
      const rendered = await rendering.render(input.content, state.brushColor, rendering.getContext());
      const prepared = rendered.kind === "plain"
        ? prepareCanvasTextWrite({ x: at[0]!, y: at[1]! }, rendered.text, state.brushColor, writeMode)
        : prepareCanvasRowsWrite({ x: at[0]!, y: at[1]! }, rendered.rows, writeMode);
      return {
        ...targetOutput(target),
        preview: true,
        writeMode,
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

export const createCanvasReadTool = (
  canvas: Pick<CanvasRuntime, "ready" | "getState" | "materializeSession">,
  rendering: CanvasToolRendering,
): AgentToolDefinition => ({
  ...CANVAS_READ_TOOL,
  execute: async (input) => {
    const representation = input.representation === undefined ? "text" : input.representation;
    const detail = input.detail === undefined ? "auto" : input.detail;
    if (Object.keys(input).some((key) => !["canvasId", "viewport", "representation", "detail"].includes(key))
      || (input.canvasId !== undefined && (typeof input.canvasId !== "string" || input.canvasId.length === 0))
      || (input.viewport !== undefined && !isCanvasReadViewport(input.viewport))
      || !["text", "image", "both"].includes(String(representation))
      || !["low", "high", "original", "auto"].includes(String(detail))) {
      return { ok: false, code: "invalid_input", message: "Expected an optional viewport [x,y,width,height], representation text|image|both, and image detail low|high|original|auto." };
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
      });
      const renderingNote = describeCanvasWriteRendering(rendering);
      const textContent = `${result.content}\n\n${renderingNote}`;
      const contentBlocks: AgentToolContentBlock[] = [];
      if (representation === "text" || representation === "both") contentBlocks.push({ type: "text", text: textContent });
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
        detail,
        image: image ? { mimeType: image.mimeType, width: image.width, height: image.height, scale: image.scale } : null,
      };
      return {
        ...structuredContent,
        content: representation === "image" ? "" : textContent,
        contentBlocks,
        structuredContent,
      };
    } catch {
      return { ok: false, code: "canvas_not_ready", message: "Unable to read the Canvas content." };
    }
  },
});
