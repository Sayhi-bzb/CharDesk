// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  detectDocumentWebMcpProvider,
  prepareDocumentWebMcp,
  updateWebMcpDiagnostics,
} from "./environment";
import { getWebMcpStatus, subscribeWebMcpStatus } from '@/shared/services/webmcp-status';

const createDocument = () => document.implementation.createHTMLDocument();

const installContext = (target: Document, complete = true) => {
  Object.defineProperty(target, "modelContext", {
    configurable: true,
    value: {
      registerTool: vi.fn(),
      ...(complete ? { getTools: vi.fn() } : {}),
    },
  });
};

describe("WebMCP environment", () => {
  it("prefers an existing standards-track host without loading the polyfill", async () => {
    const target = createDocument();
    installContext(target);
    const loadPolyfill = vi.fn();

    await expect(prepareDocumentWebMcp({
      target,
      url: new URL("http://localhost/blackboard?webmcp=polyfill"),
      dev: true,
      loadPolyfill,
    })).resolves.toBe("native");
    expect(loadPolyfill).not.toHaveBeenCalled();
  });

  it("recognizes a registerTool-only Site Tools host as native WebMCP", () => {
    const target = createDocument();
    installContext(target, false);

    expect(detectDocumentWebMcpProvider(target)).toBe("native");
  });

  it("installs the explicit development polyfill", async () => {
    const target = createDocument();
    const loadPolyfill = vi.fn(async () => installContext(target));

    await expect(prepareDocumentWebMcp({
      target,
      url: new URL("http://localhost/blackboard?webmcp=polyfill"),
      dev: true,
      loadPolyfill,
    })).resolves.toBe("polyfill");
    expect(loadPolyfill).toHaveBeenCalledOnce();
    expect(detectDocumentWebMcpProvider(target)).toBe("native");
  });

  it("accepts the development environment switch", async () => {
    const target = createDocument();
    const loadPolyfill = vi.fn(async () => installContext(target));

    await expect(prepareDocumentWebMcp({
      target,
      url: new URL("http://localhost/blackboard"),
      dev: true,
      envPolyfill: true,
      loadPolyfill,
    })).resolves.toBe("polyfill");
  });

  it("never enables the polyfill from production switches", async () => {
    const target = createDocument();
    const loadPolyfill = vi.fn();

    await expect(prepareDocumentWebMcp({
      target,
      url: new URL("https://chardesk.com/blackboard?webmcp=polyfill"),
      dev: false,
      envPolyfill: true,
      loadPolyfill,
    })).resolves.toBe("unavailable");
    expect(loadPolyfill).not.toHaveBeenCalled();
  });

  it("publishes provider and registration diagnostics", () => {
    const target = createDocument();
    updateWebMcpDiagnostics(target, "native", {
      status: "ready",
      adapterId: "imperative-webmcp",
    });

    expect(target.documentElement.dataset.webmcpProvider).toBe("native");
    expect(target.documentElement.dataset.webmcpStatus).toBe("ready");
    expect(target.documentElement.dataset.webmcpCapability).toBe("imperative");
    expect(getWebMcpStatus()).toBe('ready');
  });

  it('publishes registration changes without treating readiness as an agent connection', () => {
    const target = createDocument();
    const changed = vi.fn();
    updateWebMcpDiagnostics(target, 'native', { status: 'ready', adapterId: null });
    const unsubscribe = subscribeWebMcpStatus(changed);
    const transitions = [
      ['registering', 'native', 'preparing'],
      ['ready', 'native', 'ready'],
      ['waiting', 'unavailable', 'unavailable'],
      ['failed', 'polyfill', 'error'],
      ['disposed', 'native', 'unavailable'],
    ] as const;
    for (const [status, provider, expected] of transitions) {
      updateWebMcpDiagnostics(target, provider, { status, adapterId: null });
      expect(getWebMcpStatus()).toBe(expected);
      expect(target.documentElement.dataset.webmcpStatus).toBe(status);
    }
    expect(changed).toHaveBeenCalledTimes(5);
    unsubscribe();
    updateWebMcpDiagnostics(target, 'native', { status: 'registering', adapterId: null });
    expect(changed).toHaveBeenCalledTimes(5);
  });
});
