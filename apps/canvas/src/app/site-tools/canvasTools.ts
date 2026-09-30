import { CanvasWriteError, isCanvasReadViewport, readCanvasViewport, isCanvasSearchQuery,
  isCanvasSearchPosition, searchCanvasSurface, CanvasSearchError, type CanvasRuntime } from "@/domains/canvas/public";
import type { AgentToolDefinition } from "./contracts";
import { isSourceBackedCanvasSession } from "@/domains/sessions/public";
import { describeCanvasWriteRendering, type CanvasToolRendering } from "./canvasRendering";

import { CANVAS_READ_TOOL, CANVAS_WRITE_TOOL, CANVAS_SEARCH_TOOL, CANVAS_LIST_TOOL } from "./canvasToolDefinitions";
export { CANVAS_READ_TOOL_NAME, CANVAS_WRITE_TOOL_NAME, CANVAS_SEARCH_TOOL_NAME, CANVAS_LIST_TOOL_NAME } from "./canvasToolDefinitions";

const resolveCanvasId = (canvas: Pick<CanvasRuntime, "getState">, value: unknown) => {
  if (value !== undefined && (typeof value !== "string" || value.length === 0)) return { error: "invalid_input" as const };
  const id = value ?? canvas.getState().activeCanvasId;
  if (typeof id !== "string" || id.length === 0) return { error: "canvas_not_active" as const };
  const sessions = canvas.getState().canvasSessions;
  if (Array.isArray(sessions) && !sessions.some(({ id: sessionId }) => sessionId === id)) return { error: "canvas_not_found" as const };
  return { id };
};

export const createCanvasListTool = (
  canvas: Pick<CanvasRuntime, "ready" | "getState">,
): AgentToolDefinition => ({
  ...CANVAS_LIST_TOOL,
  execute: async (input) => {
    if (Object.keys(input).length > 0) return { ok: false, code: "invalid_input", message: "Expected an empty input object." };
    try {
      await canvas.ready;
      const state = canvas.getState();
      return { canvases: state.canvasSessions.map((session) => ({
        canvasId: session.id, name: session.name, mode: session.mode,
        active: session.id === state.activeCanvasId,
        editable: !session.sourceBinding && !session.migrationPending,
      })) };
    } catch { return { ok: false, code: "canvas_not_ready", message: "Unable to list Canvases." }; }
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
    let snapshot: Awaited<ReturnType<CanvasRuntime["materializeSession"]>>;
    try {
      await canvas.ready;
      const target = resolveCanvasId(canvas, input.canvasId);
      if ("error" in target) return { ok: false, code: target.error, message: target.error === "canvas_not_found" ? "Canvas not found." : "Open a Canvas first." };
      canvasId = target.id;
      snapshot = await canvas.materializeSession(canvasId);
      if (!snapshot) return { ok: false, code: "canvas_not_ready", message: "The Canvas content is not ready." };
    } catch {
      return { ok: false, code: "canvas_not_ready", message: "Unable to read the Canvas content." };
    }
    try {
      return { canvasId, ...searchCanvasSurface(snapshot.surface, input.query, { viewport: input.viewport, after: input.after, regex: input.regex, ignoreCase: input.ignoreCase }) };
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
    if (Object.keys(input).some((key) => !["canvasId", "at", "content"].includes(key))
      || !Array.isArray(at) || at.length !== 2 || !at.every(Number.isSafeInteger) || typeof input.content !== "string") {
      return { ok: false, code: "invalid_input", message: "Expected { at: [x,y], content: string } with safe integer coordinates." };
    }
    const target = resolveCanvasId(canvas, input.canvasId);
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
      if (canvasId === state.activeCanvasId && (current.activeCanvasId !== canvasId || current.slideDeck?.activeSlideId !== state.slideDeck?.activeSlideId)) {
        return { ok: false, code: "write_failed", message: "The active Canvas or Slide changed during rendering; nothing was written. Read the current target again." };
      }
      const position = { x: at[0], y: at[1] };
      const bounds = rendered.kind === "plain"
        ? canvasId === state.activeCanvasId
          ? canvas.commands.text.writeAt(rendered.text, position)
          : canvas.commands.text.writeAtSession?.(canvasId, rendered.text, position, state.brushColor)
        : canvasId === state.activeCanvasId
          ? canvas.commands.text.writeRowsAt(rendered.rows, position)
          : canvas.commands.text.writeRowsAtSession?.(canvasId, rendered.rows, position);
      if (canvasId !== state.activeCanvasId && !bounds) {
        return { ok: false, code: "write_failed", message: "Targeted Canvas writes are unavailable on this host." };
      }
      return { canvasId, bounds };
    } catch (error) {
      return { ok: false, code: error instanceof CanvasWriteError ? error.code : "write_failed",
        message: error instanceof CanvasWriteError ? error.message : "Unable to write Canvas content." };
    }
  },
});

export const createCanvasReadTool = (
  canvas: Pick<CanvasRuntime, "ready" | "getState" | "materializeSession">,
  rendering: CanvasToolRendering,
): AgentToolDefinition => ({
  ...CANVAS_READ_TOOL,
  execute: async (input) => {
    if (Object.keys(input).some((key) => !["canvasId", "viewport"].includes(key))
      || (input.canvasId !== undefined && (typeof input.canvasId !== "string" || input.canvasId.length === 0))
      || (input.viewport !== undefined && !isCanvasReadViewport(input.viewport))) {
      return { ok: false, code: "invalid_input", message: "Expected an optional viewport [x,y,width,height] with safe integer coordinates and positive sizes." };
    }
    try {
      await canvas.ready;
      const target = resolveCanvasId(canvas, input.canvasId);
      if ("error" in target) return { ok: false, code: target.error, message: target.error === "canvas_not_found" ? "Canvas not found." : "Open a Canvas first." };
      const canvasId = target.id;
      const snapshot = await canvas.materializeSession(canvasId);
      if (!snapshot) return { ok: false, code: "canvas_not_ready", message: "The Canvas content is not ready." };
      const result = readCanvasViewport(snapshot.surface, input.viewport);
      return { canvasId, ...result, content: `${result.content}\n\n${describeCanvasWriteRendering(rendering)}` };
    } catch {
      return { ok: false, code: "canvas_not_ready", message: "Unable to read the Canvas content." };
    }
  },
});
