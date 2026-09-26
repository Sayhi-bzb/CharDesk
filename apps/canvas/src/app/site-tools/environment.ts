import {
  getDocumentModelContext,
  hasRegisterTool,
} from "./modelContext";
import type { SiteToolConnectorSnapshot } from "./connector";

export type WebMcpProvider = "native" | "polyfill" | "unavailable";
type WebMcpCapability = "standard" | "imperative" | "unavailable";

type WebMcpPolyfillLoader = () => Promise<void>;

type PrepareDocumentWebMcpOptions = Readonly<{
  target: Document;
  url: URL;
  dev: boolean;
  envPolyfill?: boolean;
  loadPolyfill?: WebMcpPolyfillLoader;
}>;

const loadDefaultPolyfill: WebMcpPolyfillLoader = async () => {
  const { initializeWebMCPPolyfill } = await import("@mcp-b/webmcp-polyfill");
  initializeWebMCPPolyfill();
};

export const detectDocumentWebMcpProvider = (
  target: Document,
): Exclude<WebMcpProvider, "polyfill"> => {
  const context = getDocumentModelContext(target);
  return hasRegisterTool(context) ? "native" : "unavailable";
};

export const prepareDocumentWebMcp = async ({
  target,
  url,
  dev,
  envPolyfill = false,
  loadPolyfill = loadDefaultPolyfill,
}: PrepareDocumentWebMcpOptions): Promise<WebMcpProvider> => {
  const existing = detectDocumentWebMcpProvider(target);
  if (existing !== "unavailable") return existing;

  const queryPolyfill = url.searchParams.get("webmcp") === "polyfill";
  if (!dev || (!envPolyfill && !queryPolyfill)) return "unavailable";

  await loadPolyfill();
  return detectDocumentWebMcpProvider(target) === "native"
    ? "polyfill"
    : "unavailable";
};

const getWebMcpCapability = (
  snapshot: SiteToolConnectorSnapshot,
): WebMcpCapability => {
  if (snapshot.adapterId === "standard-webmcp") return "standard";
  if (snapshot.adapterId === "imperative-webmcp") return "imperative";
  return "unavailable";
};

export const updateWebMcpDiagnostics = (
  target: Document,
  provider: WebMcpProvider,
  snapshot: SiteToolConnectorSnapshot,
) => {
  target.documentElement.dataset.webmcpProvider = provider;
  target.documentElement.dataset.webmcpStatus = snapshot.status;
  target.documentElement.dataset.webmcpCapability = getWebMcpCapability(snapshot);
};
