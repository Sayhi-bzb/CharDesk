import React from "react";
import ReactDOM from "react-dom/client";
import "@chardesk/fonts/fonts.css";
import "@chardesk/font-maple/fonts.css";
import "./index.css";
import { captureOnboardingEntryState } from "@/widgets/onboarding/onboarding-model";
import { ModuleLoadFailure, ModuleLoadingScreen } from "./StartupScreens";
import { getApplicationEditorHost } from "./compositionRoot";
import { EditorProvider } from "@/domains/editor/public";
import {
  CanvasRuntimeProvider,
} from "@/domains/canvas/public";
import { CollaborationRuntimeProvider } from "@/domains/collaboration/public";
import { TextRenderingProvider } from "@/domains/document/public";
import { CanvasFontProvider } from "@/shared/fonts/react";
import { CanvasCursorProvider } from "@/shared/canvas-cursor/react";
import { BlackboardRuntimeProvider } from "@/domains/blackboard/public";
import { EDITOR_HOST_PROFILE } from "./editorHostProfile";
import { EditorHostProfileProvider } from "./editorHostProfileContext";
import {
  installModuleLoadRecovery,
  isModuleReloadPending,
  requireLoadedModule,
} from "@/shared/lib/moduleLoadRecovery";
import {
  createChardeskAgentTools,
  createChardeskMaterialsTool,
} from "./site-tools/chardeskTools";
import { startDocumentSiteTools } from "./site-tools/connector";
import {
  prepareDocumentWebMcp,
  updateWebMcpDiagnostics,
  type WebMcpProvider,
} from "./site-tools/environment";
import { isBlackboardRoute, isLocalBlackboardReaderRoute } from "./blackboardRoute";
import { createBlackboardWorkspaceTarget } from "./blackboardWorkspaceTarget";

const profile = EDITOR_HOST_PROFILE;
const host = getApplicationEditorHost(profile);
const chardeskAgentTools = isLocalBlackboardReaderRoute(window.location)
  ? [createChardeskMaterialsTool()]
  : createChardeskAgentTools({
      blackboard: host.blackboard,
      workspaceTarget: createBlackboardWorkspaceTarget({
        blackboard: host.blackboard,
        canvas: host.canvas,
        location: window.location,
        history: window.history,
      }),
    });

const startChardeskSiteTools = async () => {
  let provider: WebMcpProvider = "unavailable";
  updateWebMcpDiagnostics(document, provider, {
    status: "waiting",
    adapterId: null,
  });
  try {
    provider = await prepareDocumentWebMcp({
      target: document,
      url: new URL(window.location.href),
      dev: import.meta.env.DEV,
      envPolyfill: import.meta.env.VITE_WEBMCP_DEV_POLYFILL === "1",
    });
  } catch (error) {
    console.warn("Unable to initialize the WebMCP development polyfill.", error);
  }

  startDocumentSiteTools({
    target: document,
    tools: chardeskAgentTools,
    onStatusChange: (snapshot) => {
      if (snapshot.adapterId !== null && provider !== "polyfill") {
        provider = "native";
      }
      updateWebMcpDiagnostics(document, provider, snapshot);
    },
  });

  if (import.meta.env.DEV && provider === "unavailable") {
    console.info(
      "WebMCP is unavailable. Enable chrome://flags/#enable-webmcp-testing or add ?webmcp=polyfill for local protocol testing.",
    );
  }
};

void startChardeskSiteTools();
const canvasStressParams = new URLSearchParams(window.location.search);
if (canvasStressParams.has("canvas-stress")) {
  host.canvas.queries.setMutationPerformanceEnabled(
    canvasStressParams.has('canvas-input-commit')
  );
  Object.defineProperty(window, "__chardeskCanvasStress", {
    configurable: true,
    value: {
      ready: () => host.canvas.ready,
      flush: () => host.canvas.retryPersistence(),
      switchSession: (id: string) => host.canvas.commands.sessions.switch(id),
      removeSession: (id: string) => host.canvas.commands.sessions.remove(id),
      sessionIds: () => host.canvas.getState().canvasSessions.map(({ id }) => id),
      activeSessionId: () => host.canvas.getState().activeCanvasId,
      createSession: (mode: "freeform" = "freeform") => {
        host.canvas.commands.sessions.create(mode, { name: "Input scheduling probe" });
        return host.canvas.getState().activeCanvasId;
      },
      setProjectionCacheBudget: (bytes: number) =>
        host.canvas.setProjectionCacheBudget(bytes),
      loadSession: (snapshot: {
        mode: "freeform";
        grid: [string, { char: string; color: string; bgColor?: string }][];
      }) => {
        host.canvas.commands.sessions.create(snapshot.mode, { name: "Memory probe" });
        const id = host.canvas.getState().activeCanvasId;
        host.canvas.commands.sessions.replaceSnapshot(id, snapshot, {
          preserveViewport: false,
          resetHistory: true,
        });
        return id;
      },
      generateHistory: (operationCount: number) => {
        host.canvas.commands.interaction.setTextCursor({ x: 0, y: 0 });
        for (let index = 0; index < operationCount; index += 1) {
          host.canvas.commands.text.write("x");
        }
      },
      setTextCursor: (point: { x: number; y: number }) =>
        (window as Window & {
          __chardeskCanvasManagedInputSetCursor?: (
            point: { x: number; y: number }
          ) => void;
        }).__chardeskCanvasManagedInputSetCursor?.(point),
      managedInputCursor: () => (window as Window & {
        __chardeskCanvasManagedInputCursor?: () => { x: number; y: number } | null;
      }).__chardeskCanvasManagedInputCursor?.() ?? null,
      writeText: (value: string, start = { x: 0, y: 0 }) => {
        host.canvas.commands.interaction.setTextCursor(start);
        const startedAt = performance.now();
        host.canvas.commands.text.write(value);
        return performance.now() - startedAt;
      },
      undo: () => host.canvas.commands.history.undo(),
      redo: () => host.canvas.commands.history.redo(),
      gridEntries: () => Array.from(
        host.canvas.getState().contentSurface.reader.materialize()
      ),
      cellCount: () => host.canvas.queries.getActiveCellCount(),
      surfaceStats: () => {
        const reader = host.canvas.getState().contentSurface.reader;
        return reader && "getStats" in reader && typeof reader.getStats === "function"
          ? reader.getStats()
          : null;
      },
      memoryStats: () => host.canvas.queries.getMemoryStats(),
      mutationStats: () => host.canvas.queries.getMutationPerformanceStats(),
      resetMutationStats: () => host.canvas.queries.resetMutationPerformance(),
      renderStats: () => (window as Window & {
        __chardeskCanvasExperienceStats?: () => Record<string, number | null>;
      }).__chardeskCanvasExperienceStats?.() ?? null,
      resetManagedInputStats: () => (window as Window & {
        __chardeskCanvasExperienceResetManagedInput?: () => void;
      }).__chardeskCanvasExperienceResetManagedInput?.(),
      focusManagedInput: () => {
        const focus = (window as Window & {
          __chardeskCanvasManagedInputFocus?: () => void;
        }).__chardeskCanvasManagedInputFocus;
        if (!focus) return false;
        focus();
        return true;
      },
      managedInputIdentity: () => (window as Window & {
        __chardeskCanvasManagedInputIdentity?: () => string;
      }).__chardeskCanvasManagedInputIdentity?.() ?? null,
      resourceStats: () => {
        const memory = host.canvas.queries.getMemoryStats();
        const experience = (window as Window & {
          __chardeskCanvasExperienceStats?: () => {
            viewportActivities: number;
            directFrames: number;
            directGlyphs: number;
            totalDirectGlyphs: number;
            lastFrameDurationMs: number | null;
            maxFrameDurationMs: number;
            p95FrameDurationMs: number;
            longFrames: number;
            lastInputPaintMs: number | null;
            lastSettleLatencyMs: number | null;
            managedInputBatches: number;
            managedInputTextLength: number;
            firstManagedInputBatches: number;
            burstManagedInputBatches: number;
            capacityManagedInputBatches: number;
            boundaryManagedInputBatches: number;
            firstManagedInputCommitP95Ms: number;
            burstManagedInputCommitP95Ms: number;
            burstManagedInputCommitMaxMs: number;
            managedInputCommitP95Ms: number;
            managedInputCommitMaxMs: number;
            managedInputQueueP95Ms: number;
            managedInputQueueMaxMs: number;
            managedInputEndToEndP95Ms: number;
            managedInputEndToEndMaxMs: number;
            managedInputBatchTextLengthP95: number;
            managedInputBatchTextLengthMax: number;
          };
        }).__chardeskCanvasExperienceStats?.();
        return {
          pressure: "normal",
          hidden: document.hidden,
          accountedBytes: memory.projectionCacheBudgetBytes,
          nominalBudgetBytes: memory.projectionCacheBudgetLimit,
          cellPlaneBytes: memory.projectionCacheBudgetBytes,
          viewportActivities: experience?.viewportActivities ?? 0,
          directFrames: experience?.directFrames ?? 0,
          directGlyphs: experience?.directGlyphs ?? 0,
          totalDirectGlyphs: experience?.totalDirectGlyphs ?? 0,
          lastFrameDurationMs: experience?.lastFrameDurationMs ?? 0,
          maxFrameDurationMs: experience?.maxFrameDurationMs ?? 0,
          p95FrameDurationMs: experience?.p95FrameDurationMs ?? 0,
          longFrames: experience?.longFrames ?? 0,
          inputPaintMs: experience?.lastInputPaintMs ?? 0,
          settleLatencyMs: experience?.lastSettleLatencyMs ?? 0,
          managedInputBatches: experience?.managedInputBatches ?? 0,
          managedInputTextLength: experience?.managedInputTextLength ?? 0,
          firstManagedInputBatches: experience?.firstManagedInputBatches ?? 0,
          burstManagedInputBatches: experience?.burstManagedInputBatches ?? 0,
          capacityManagedInputBatches:
            experience?.capacityManagedInputBatches ?? 0,
          boundaryManagedInputBatches: experience?.boundaryManagedInputBatches ?? 0,
          firstManagedInputCommitP95Ms:
            experience?.firstManagedInputCommitP95Ms ?? 0,
          burstManagedInputCommitP95Ms:
            experience?.burstManagedInputCommitP95Ms ?? 0,
          burstManagedInputCommitMaxMs:
            experience?.burstManagedInputCommitMaxMs ?? 0,
          managedInputCommitP95Ms: experience?.managedInputCommitP95Ms ?? 0,
          managedInputCommitMaxMs: experience?.managedInputCommitMaxMs ?? 0,
          managedInputQueueP95Ms: experience?.managedInputQueueP95Ms ?? 0,
          managedInputQueueMaxMs: experience?.managedInputQueueMaxMs ?? 0,
          managedInputEndToEndP95Ms:
            experience?.managedInputEndToEndP95Ms ?? 0,
          managedInputEndToEndMaxMs:
            experience?.managedInputEndToEndMaxMs ?? 0,
          managedInputBatchTextLengthP95:
            experience?.managedInputBatchTextLengthP95 ?? 0,
          managedInputBatchTextLengthMax:
            experience?.managedInputBatchTextLengthMax ?? 0,
        };
      },
      persistence: () => host.canvas.getPersistenceSnapshot(),
    },
  });
}
if (!isBlackboardRoute(window.location)) {
  captureOnboardingEntryState();
}
installModuleLoadRecovery();

const root = ReactDOM.createRoot(document.getElementById("root")!);

root.render(<ModuleLoadingScreen />);

const renderLoadFailure = () => {
  root.render(<ModuleLoadFailure onReload={() => window.location.reload()} />);
};

void import("./App").then((module) => {
  const { default: App } = requireLoadedModule(module);
  root.render(
    <React.StrictMode>
      <EditorHostProfileProvider profile={host.profile}>
        <BlackboardRuntimeProvider runtime={host.blackboard}>
          <TextRenderingProvider runtime={host.textRendering}>
            <CanvasFontProvider runtime={host.canvasFont}>
              <CanvasCursorProvider runtime={host.canvasCursor}>
                <CanvasRuntimeProvider runtime={host.canvas}>
                  <CollaborationRuntimeProvider runtime={host.collaboration}>
                    <EditorProvider editor={host.editor}>
                      <App />
                    </EditorProvider>
                  </CollaborationRuntimeProvider>
                </CanvasRuntimeProvider>
              </CanvasCursorProvider>
            </CanvasFontProvider>
          </TextRenderingProvider>
        </BlackboardRuntimeProvider>
      </EditorHostProfileProvider>
    </React.StrictMode>
  );
}).catch((error: unknown) => {
  if (isModuleReloadPending()) return;
  console.error(error);
  renderLoadFailure();
});
