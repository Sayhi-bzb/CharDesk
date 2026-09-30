import { CanvasWriteError, isCanvasReadViewport, readCanvasViewport, type CanvasRuntime } from "@/domains/canvas/public";
import type { AgentToolDefinition } from "./contracts";
import { isSourceBackedCanvasSession } from "@/domains/sessions/public";
import { describeCanvasWriteRendering, type CanvasToolRendering } from "./canvasRendering";

import { CANVAS_READ_TOOL, CANVAS_WRITE_TOOL } from "./canvasToolDefinitions";
export { CANVAS_READ_TOOL_NAME, CANVAS_WRITE_TOOL_NAME } from "./canvasToolDefinitions";

export const createCanvasWriteTool = (
  canvas: Pick<CanvasRuntime, "ready" | "getState"> & {
    commands: { text: Pick<CanvasRuntime["commands"]["text"], "writeAt" | "writeRowsAt"> };
  },
  rendering: CanvasToolRendering,
): AgentToolDefinition => ({
  ...CANVAS_WRITE_TOOL,
  execute: async (input) => {
    const at = input.at;
    if (Object.keys(input).some((key) => key !== "at" && key !== "content")
      || !Array.isArray(at) || at.length !== 2 || !at.every(Number.isSafeInteger) || typeof input.content !== "string") {
      return { ok: false, code: "invalid_input", message: "Expected { at: [x,y], content: string } with safe integer coordinates." };
    }
    try {
      await canvas.ready;
    } catch {
      return { ok: false, code: "canvas_not_ready", message: "The Canvas content is not ready." };
    }
    const state = canvas.getState();
    const canvasId = state.activeCanvasId;
    if (!canvasId) return { ok: false, code: "canvas_not_active", message: "Open a Canvas first." };
    try {
      const session = state.canvasSessions.find(({ id }) => id === canvasId);
      if (session && isSourceBackedCanvasSession(session)) {
        throw new CanvasWriteError("source_backed_canvas", "Edit the source files of this Canvas instead of its projection.");
      }
      const rendered = await rendering.render(input.content, state.brushColor, rendering.getContext());
      const current = canvas.getState();
      if (current.activeCanvasId !== canvasId || current.slideDeck?.activeSlideId !== state.slideDeck?.activeSlideId) {
        return { ok: false, code: "write_failed", message: "The active Canvas or Slide changed during rendering; nothing was written. Read the current target again." };
      }
      const position = { x: at[0], y: at[1] };
      const bounds = rendered.kind === "plain"
        ? canvas.commands.text.writeAt(rendered.text, position)
        : canvas.commands.text.writeRowsAt(rendered.rows, position);
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
    if (Object.keys(input).some((key) => key !== "viewport") || (input.viewport !== undefined && !isCanvasReadViewport(input.viewport))) {
      return { ok: false, code: "invalid_input", message: "Expected an optional viewport [x,y,width,height] with safe integer coordinates and positive sizes." };
    }
    try {
      await canvas.ready;
      const canvasId = canvas.getState().activeCanvasId;
      if (!canvasId) return { ok: false, code: "canvas_not_active", message: "Open a Canvas first." };
      const snapshot = await canvas.materializeSession(canvasId);
      if (!snapshot) return { ok: false, code: "canvas_not_ready", message: "The Canvas content is not ready." };
      const result = readCanvasViewport(snapshot.surface, input.viewport);
      return { canvasId, ...result, content: `${result.content}\n\n${describeCanvasWriteRendering(rendering)}` };
    } catch {
      return { ok: false, code: "canvas_not_ready", message: "Unable to read the Canvas content." };
    }
  },
});
