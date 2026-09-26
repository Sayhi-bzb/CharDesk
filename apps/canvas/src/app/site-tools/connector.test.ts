// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentToolDefinition } from "./contracts";
import { startDocumentSiteTools } from "./connector";
import type { WebMcpTool } from "./modelContext";

const tools: readonly AgentToolDefinition[] = [{
  name: "read_workspace",
  title: "Read workspace",
  description: "Read the active workspace.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  execute: () => ({ ok: true }),
}];

const createDocument = () => document.implementation.createHTMLDocument();

const installContext = (
  target: Document,
  registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => unknown,
  complete = true,
) => {
  Object.defineProperty(target, "modelContext", {
    configurable: true,
    value: {
      registerTool,
      ...(complete ? { getTools: vi.fn() } : {}),
    },
  });
};

describe("site tool connector", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("registers immediately without origin coordination", async () => {
    const target = createDocument();
    expect(target.defaultView?.navigator.locks).toBeUndefined();
    const registerTool = vi.fn();
    installContext(target, registerTool);
    const execute = vi.fn((_input, context) => context?.signal);
    const standardTools: readonly AgentToolDefinition[] = [{
      ...tools[0]!,
      outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
      execute,
    }];

    const onStatusChange = vi.fn();
    const connector = startDocumentSiteTools({
      target,
      tools: standardTools,
      onStatusChange,
    });
    await vi.waitFor(() => expect(connector.getStatus()).toBe("ready"));
    expect(registerTool).toHaveBeenCalledTimes(1);
    const registered = registerTool.mock.calls[0]?.[0] as WebMcpTool;
    expect(registered.title).toBe("Read workspace");
    const registrationSignal = registerTool.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(registered.annotations).toEqual({ readOnlyHint: true });
    expect(registered.outputSchema).toEqual(standardTools[0]?.outputSchema);
    const executionController = new AbortController();
    expect(await registered.execute({}, { signal: executionController.signal }))
      .toBe(executionController.signal);
    expect(onStatusChange).toHaveBeenLastCalledWith({
      status: "ready",
      adapterId: "standard-webmcp",
    });
    connector.dispose();
    expect(registrationSignal.aborted).toBe(true);
  });

  it("uses the imperative WebMCP adapter when getTools is absent", async () => {
    const target = createDocument();
    const registered: WebMcpTool[] = [];
    const registerTool = vi.fn((tool: WebMcpTool) => registered.push(tool));
    installContext(target, registerTool, false);
    const imperativeTools: readonly AgentToolDefinition[] = [{
      ...tools[0]!,
      execute: () => "imperative-result",
    }];
    const onStatusChange = vi.fn();

    const connector = startDocumentSiteTools({
      target,
      tools: imperativeTools,
      onStatusChange,
    });
    await vi.waitFor(() => expect(connector.getStatus()).toBe("ready"));

    expect(registerTool.mock.calls[0]).toHaveLength(1);
    expect(await registered[0]!.execute({})).toBe("imperative-result");
    expect(onStatusChange).toHaveBeenLastCalledWith({
      status: "ready",
      adapterId: "imperative-webmcp",
    });
    connector.dispose();
  });

  it("discovers a WebMCP host injected after the page has mounted", async () => {
    vi.useFakeTimers();
    const target = createDocument();
    const registerTool = vi.fn();
    const connector = startDocumentSiteTools({ target, tools });
    expect(connector.getStatus()).toBe("waiting");

    await vi.advanceTimersByTimeAsync(1_000);
    installContext(target, registerTool);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(connector.getStatus()).toBe("ready");
    expect(registerTool).toHaveBeenCalledTimes(1);
    connector.dispose();
  });

  it("retries a rolled-back standards-track registration failure", async () => {
    vi.useFakeTimers();
    const target = createDocument();
    const registerTool = vi.fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValue(undefined);
    installContext(target, registerTool);

    const connector = startDocumentSiteTools({ target, tools, retryDelays: [10] });
    await vi.advanceTimersByTimeAsync(10);

    expect(connector.getStatus()).toBe("ready");
    expect(registerTool).toHaveBeenCalledTimes(2);
    const firstSignal = registerTool.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(firstSignal.aborted).toBe(true);
    connector.dispose();
  });

  it("does not duplicate a partially failed imperative registration", async () => {
    vi.useFakeTimers();
    const target = createDocument();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const registerTool = vi.fn().mockRejectedValue(new Error("registration failed"));
    installContext(target, registerTool, false);

    const connector = startDocumentSiteTools({ target, tools, retryDelays: [10] });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(connector.getStatus()).toBe("failed");
    expect(registerTool).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledOnce();
    connector.dispose();
  });

  it("stops probing after disposal", async () => {
    vi.useFakeTimers();
    const target = createDocument();
    const registerTool = vi.fn();
    const connector = startDocumentSiteTools({ target, tools, retryDelays: [10] });
    connector.dispose();
    installContext(target, registerTool);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(connector.getStatus()).toBe("disposed");
    expect(registerTool).not.toHaveBeenCalled();
  });
});
