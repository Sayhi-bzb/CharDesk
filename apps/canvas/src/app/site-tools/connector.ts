import { imperativeWebMcpAdapter } from "./adapters/imperativeWebMcp";
import { standardWebMcpAdapter } from "./adapters/standardWebMcp";
import type {
  AgentToolDefinition,
  SiteToolHostAdapterId,
  SiteToolInstallation,
} from "./contracts";
import { getDocumentModelContext } from "./modelContext";

type SiteToolConnectorStatus =
  | "waiting"
  | "registering"
  | "ready"
  | "failed"
  | "disposed";

export type SiteToolConnectorSnapshot = Readonly<{
  status: SiteToolConnectorStatus;
  adapterId: SiteToolHostAdapterId | null;
}>;

type SiteToolConnector = Readonly<{
  getStatus: () => SiteToolConnectorStatus;
  dispose: () => void;
}>;

type SiteToolConnectorOptions = Readonly<{
  target: Document;
  tools: readonly AgentToolDefinition[];
  retryDelays?: readonly number[];
  onStatusChange?: (snapshot: SiteToolConnectorSnapshot) => void;
}>;

const DEFAULT_RETRY_DELAYS = [50, 100, 250, 500, 1_000, 2_000] as const;

type ResolvedHost = Readonly<{
  id: SiteToolHostAdapterId;
  install: () => Promise<SiteToolInstallation>;
}>;

const resolveSiteToolHost = (
  target: Document,
  tools: readonly AgentToolDefinition[],
): ResolvedHost | null => {
  const context = getDocumentModelContext(target);
  if (standardWebMcpAdapter.supports(context)) {
    return {
      id: standardWebMcpAdapter.id,
      install: () => standardWebMcpAdapter.install(context, tools),
    };
  }
  if (imperativeWebMcpAdapter.supports(context)) {
    return {
      id: imperativeWebMcpAdapter.id,
      install: () => imperativeWebMcpAdapter.install(context, tools),
    };
  }
  return null;
};

export const startDocumentSiteTools = ({
  target,
  tools,
  retryDelays = DEFAULT_RETRY_DELAYS,
  onStatusChange,
}: SiteToolConnectorOptions): SiteToolConnector => {
  const delays = retryDelays.length > 0 ? retryDelays : DEFAULT_RETRY_DELAYS;
  const lifecycle = target.defaultView;
  let status: SiteToolConnectorStatus = "waiting";
  let disposed = false;
  let retryIndex = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let adapterId: SiteToolHostAdapterId | null = null;
  let installation: SiteToolInstallation | null = null;

  const setStatus = (next: SiteToolConnectorStatus) => {
    status = next;
    onStatusChange?.({ status, adapterId });
  };

  const clearRetry = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const scheduleRetry = () => {
    if (disposed || status === "ready" || timer !== null) return;
    const delay = delays[Math.min(retryIndex, delays.length - 1)]!;
    retryIndex += 1;
    timer = setTimeout(() => {
      timer = null;
      void probe();
    }, delay);
  };

  const probe = async () => {
    if (disposed || status === "ready" || status === "registering") return;
    const host = resolveSiteToolHost(target, tools);
    if (!host) {
      setStatus("waiting");
      scheduleRetry();
      return;
    }

    clearRetry();
    adapterId = host.id;
    setStatus("registering");
    try {
      const candidate = await host.install();
      if (disposed) {
        candidate.dispose();
        return;
      }
      installation = candidate;
      setStatus("ready");
    } catch (error) {
      if (disposed) return;
      if (adapterId === "standard-webmcp") {
        adapterId = null;
        setStatus("waiting");
        scheduleRetry();
        return;
      }
      setStatus("failed");
      console.warn("Unable to register site tools with the imperative WebMCP host.", error);
    }
  };

  const probeNow = () => {
    if (status !== "waiting") return;
    clearRetry();
    void probe();
  };

  const onVisibilityChange = () => {
    if (!target.hidden) probeNow();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    setStatus("disposed");
    clearRetry();
    installation?.dispose();
    installation = null;
    target.removeEventListener("visibilitychange", onVisibilityChange);
    lifecycle?.removeEventListener("focus", probeNow);
    lifecycle?.removeEventListener("pageshow", probeNow);
    lifecycle?.removeEventListener("pagehide", dispose);
  };

  target.addEventListener("visibilitychange", onVisibilityChange);
  lifecycle?.addEventListener("focus", probeNow);
  lifecycle?.addEventListener("pageshow", probeNow);
  lifecycle?.addEventListener("pagehide", dispose);
  setStatus("waiting");
  void probe();

  return { getStatus: () => status, dispose };
};
