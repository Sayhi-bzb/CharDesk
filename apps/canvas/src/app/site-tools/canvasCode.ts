import type { AgentToolDefinition } from "./contracts";
import { newAsyncContext } from "quickjs-emscripten";
import {
  CANVAS_CODE_TOOL,
  CANVAS_CODE_TOOL_NAME,
} from "./canvasToolDefinitions";

type Capability = (input: Record<string, unknown>) => Promise<unknown>;
type CanvasCodeDependencies = Readonly<{
  read: AgentToolDefinition;
  search: AgentToolDefinition;
  write: AgentToolDefinition;
  manage: AgentToolDefinition;
  previewWrite?: AgentToolDefinition;
  history?: { beginCheckpoint: () => { commit: () => void; cancel: () => void } };
}>;

const MAX_OPERATIONS = 128;
const MAX_RESULT_BYTES = 128 * 1024;
const DEFAULT_TIMEOUT = 2_000;
let runtimeWarmup: Promise<void> | undefined;

class CanvasCodeRuntimeError extends Error {
  readonly code = "runtime_unavailable";
  readonly cause: unknown;
  constructor(cause: unknown) {
    super("Canvas Code runtime is unavailable. Retry Code Mode or use canvas_read, canvas_search, or canvas_write.");
    this.name = "CanvasCodeRuntimeError";
    this.cause = cause;
  }
}

/** Warm the WASM module without blocking Canvas startup. A failed warmup is
 * observable and never prevents the primitive Canvas tools from loading. */
export const warmCanvasCodeRuntime = () => {
  if (runtimeWarmup) return runtimeWarmup;
  runtimeWarmup = newAsyncContext()
    .then((context) => { context.dispose(); })
    .catch((error) => {
      runtimeWarmup = undefined;
      throw error;
    });
  return runtimeWarmup;
};

const createCanvasCodeContext = async () => {
  try {
    const context = await newAsyncContext();
    return context;
  } catch (error) {
    throw new CanvasCodeRuntimeError(error);
  }
};

// This is intentionally a capability runtime, not a general-purpose shell.
// Rejecting ambient APIs keeps accidental use clear while the actual Canvas
// state remains reachable only through the four injected capabilities.
const errorResult = (code: string, message: string) => ({ ok: false, code, message });

const invoke = (tool: AgentToolDefinition, input: Record<string, unknown>) => tool.execute(input);

const serializable = (value: unknown) => {
  try {
    const encoded = JSON.stringify(value === undefined ? null : value);
    if (!encoded || new TextEncoder().encode(encoded).byteLength > MAX_RESULT_BYTES) return { value: null, truncated: true };
    return { value: JSON.parse(encoded) as unknown, truncated: false };
  } catch {
    return { value: null, truncated: true };
  }
};

type QuickJSContext = Awaited<ReturnType<typeof newAsyncContext>>;
const MAX_BRIDGE_DEPTH = 32;
const MAX_BRIDGE_KEYS = 4096;

const nativeToQuickJS = (context: QuickJSContext, value: unknown, depth = 0): ReturnType<QuickJSContext["newObject"]> => {
  if (depth > MAX_BRIDGE_DEPTH) return context.null as ReturnType<QuickJSContext["newObject"]>;
  if (value === null) return context.null as ReturnType<QuickJSContext["newObject"]>;
  if (value === undefined) return context.undefined as ReturnType<QuickJSContext["newObject"]>;
  if (typeof value === "string") return context.newString(value) as ReturnType<QuickJSContext["newObject"]>;
  if (typeof value === "number" && Number.isFinite(value)) return context.newNumber(value) as ReturnType<QuickJSContext["newObject"]>;
  if (typeof value === "boolean") return (value ? context.true : context.false) as ReturnType<QuickJSContext["newObject"]>;
  if (Array.isArray(value)) {
    const array = context.newArray();
    value.slice(0, MAX_BRIDGE_KEYS).forEach((item, index) => {
      const child = nativeToQuickJS(context, item, depth + 1);
      context.setProp(array, index, child);
      if (child.alive) child.dispose();
    });
    return array as ReturnType<QuickJSContext["newObject"]>;
  }
  if (typeof value === "object") {
    const object = context.newObject();
    Object.entries(value as Record<string, unknown>).slice(0, MAX_BRIDGE_KEYS).forEach(([key, item]) => {
      if (!/^[A-Za-z_$][\w$]*$/u.test(key)) return;
      const child = nativeToQuickJS(context, item, depth + 1);
      context.setProp(object, key, child);
      if (child.alive) child.dispose();
    });
    return object as ReturnType<QuickJSContext["newObject"]>;
  }
  return context.undefined as ReturnType<QuickJSContext["newObject"]>;
};

export const createCanvasCodeTool = (dependencies: CanvasCodeDependencies): AgentToolDefinition => ({
  ...CANVAS_CODE_TOOL,
  execute: async (input) => {
    const started = performance.now();
    const script = input.script;
    const mode = input.mode === undefined ? "preview" : input.mode;
    const timeoutMs = input.timeoutMs === undefined ? DEFAULT_TIMEOUT : input.timeoutMs;
    const canvasId = input.canvasId;
    if (Object.keys(input).some((key) => !["script", "canvasId", "mode", "timeoutMs"].includes(key))
      || typeof script !== "string" || !script.trim() || script.length > 32_768
      || (canvasId !== undefined && (typeof canvasId !== "string" || !canvasId))
      || (mode !== "preview" && mode !== "apply")
      || typeof timeoutMs !== "number" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 10_000) {
      return errorResult("invalid_input", "Expected a bounded script, mode preview|apply, and timeoutMs between 50 and 10000.");
    }

    let operations = 0;
    let writes = 0;
    let truncated = false;
    const checkBudget = () => {
      operations += 1;
      if (operations > MAX_OPERATIONS) throw new Error("Canvas code operation limit exceeded.");
      if (performance.now() - started > timeoutMs) throw new Error("Canvas code timed out.");
    };
    const scoped = (tool: AgentToolDefinition, allowInPreview = true): Capability => async (raw) => {
      checkBudget();
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Capability input must be an object.");
      if (!allowInPreview && mode === "preview") throw new Error("This capability requires mode=apply.");
      const next = canvasId && (raw as { canvasId?: unknown }).canvasId === undefined
        ? { ...raw, canvasId }
        : raw;
      const result = await invoke(tool, next);
      checkBudget();
      return result;
    };
    const write: Capability = async (raw) => {
      checkBudget();
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Capability input must be an object.");
      writes += 1;
      if (mode === "preview") {
        if (!dependencies.previewWrite) throw new Error("Canvas preview renderer is unavailable.");
        const next = canvasId && (raw as { canvasId?: unknown }).canvasId === undefined
          ? { ...raw, canvasId }
          : raw;
        return dependencies.previewWrite.execute(next);
      }
      return scoped(dependencies.write)(raw);
    };
    const manage: Capability = async (raw) => {
      if (mode === "preview" && raw.action !== "list") throw new Error("Canvas lifecycle changes require mode=apply.");
      return scoped(dependencies.manage)(raw);
    };
    const checkpoint = mode === "apply" ? dependencies.history?.beginCheckpoint() : undefined;
    let context: Awaited<ReturnType<typeof newAsyncContext>> | undefined;
    try {
      const qjsContext = context = await createCanvasCodeContext();
      qjsContext.runtime.setMemoryLimit(32 * 1024 * 1024);
      qjsContext.runtime.setMaxStackSize(512 * 1024);
      qjsContext.runtime.setInterruptHandler(() => performance.now() - started > timeoutMs);
      const hostCall = (name: string, capability: Capability) => qjsContext.newFunction(name, (inputHandle) => {
        const value = qjsContext.dump(inputHandle);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Canvas capability input must be an object.");
        const deferred = qjsContext.newPromise(capability(value as Record<string, unknown>)
          .then((result) => nativeToQuickJS(qjsContext, result))
          .catch((error) => { throw error; }));
        return deferred.handle;
      });
      const hostClipboardRead = qjsContext.newFunction("clipboardRead", () => {
        checkBudget();
        const deferred = qjsContext.newPromise((async () => {
          if (typeof navigator === "undefined" || !navigator.clipboard) throw new Error("Clipboard is unavailable.");
          return qjsContext.newString(await navigator.clipboard.readText());
        })());
        return deferred.handle;
      });
      const hostClipboardWrite = qjsContext.newFunction("clipboardWrite", (textHandle) => {
        checkBudget();
        const text = qjsContext.getString(textHandle);
        const deferred = qjsContext.newPromise((async () => {
          if (mode === "preview") return nativeToQuickJS(qjsContext, { preview: true, text });
          if (typeof navigator === "undefined" || !navigator.clipboard) throw new Error("Clipboard is unavailable.");
          await navigator.clipboard.writeText(text);
          return nativeToQuickJS(qjsContext, { written: true });
        })());
        return deferred.handle;
      });
      qjsContext.setProp(qjsContext.global, "__read", hostCall("read", scoped(dependencies.read)));
      qjsContext.setProp(qjsContext.global, "__search", hostCall("search", scoped(dependencies.search)));
      qjsContext.setProp(qjsContext.global, "__write", hostCall("write", write));
      qjsContext.setProp(qjsContext.global, "__manage", hostCall("manage", manage));
      qjsContext.setProp(qjsContext.global, "__clipboardRead", hostClipboardRead);
      qjsContext.setProp(qjsContext.global, "__clipboardWrite", hostClipboardWrite);
      const source = `(async () => {\nconst canvas = Object.freeze({ read: async (input = {}) => await __read(input), search: async (input = {}) => await __search(input), write: async (input) => await __write(input), manage: async (input = {}) => await __manage(input), clipboard: Object.freeze({ readText: () => __clipboardRead(), writeText: async (text) => await __clipboardWrite(text) }) });\n${script}\n})()`;
      const evaluation = await qjsContext.evalCodeAsync(source, "chardesk-canvas-code.js");
      if (!("value" in evaluation)) throw new Error("Canvas code could not be evaluated.");
      const rawHandle = evaluation.value;
      let dumped = qjsContext.dump(rawHandle.dup()) as { type?: string; value?: unknown; error?: unknown } | unknown;
      while (dumped && typeof dumped === "object" && (dumped as { type?: string }).type === "pending" && performance.now() - started <= timeoutMs) {
        qjsContext.runtime.executePendingJobs(-1);
        await new Promise((resolve) => setTimeout(resolve, 0));
        dumped = qjsContext.dump(rawHandle.dup()) as { type?: string; value?: unknown; error?: unknown } | unknown;
      }
      if (dumped && typeof dumped === "object" && (dumped as { type?: string }).type === "pending") throw new Error("Canvas code timed out.");
      if (dumped && typeof dumped === "object" && (dumped as { type?: string }).type === "rejected") {
        const rejection = (dumped as { error?: { message?: string } }).error;
        throw new Error(rejection?.message ?? "Canvas code rejected.");
      }
      const rawResult = dumped && typeof dumped === "object" && (dumped as { type?: string }).type === "fulfilled"
        ? (dumped as { value: unknown }).value
        : dumped;
      const result = serializable(rawResult);
      truncated = result.truncated;
      checkpoint?.commit();
      return { mode, result: result.value, operations, writes, durationMs: performance.now() - started, truncated };
    } catch (error) {
      checkpoint?.cancel();
      if (error instanceof CanvasCodeRuntimeError) {
        return {
          ok: false,
          code: error.code,
          phase: "load",
          retryable: true,
          message: error.message,
          fallbackTools: ["chardesk_canvas_read", "chardesk_canvas_search", "chardesk_canvas_write"],
        };
      }
      return errorResult("execution_failed", error instanceof Error ? error.message : "Canvas code failed.");
    } finally {
      context?.dispose();
    }
  },
});

export { CANVAS_CODE_TOOL_NAME };
