/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useLocalStorageState } from 'ahooks';
import {
  useCanvasRuntime,
  useCanvasState,
  normalizeCanvasViewport,
  type CanvasViewportState,
} from '@/domains/canvas/public';
import { CanvasEngineRuntime } from './CanvasEngineRuntime';
import { CanvasFrameScheduler, CanvasScopedFrameScheduler } from './FrameScheduler';

export type CanvasViewId = 'primary' | 'secondary';

const SPLIT_ENABLED_STORAGE_KEY = 'chardesk-canvas-split-enabled';
const SPLIT_RATIO_STORAGE_KEY = 'chardesk-canvas-split-ratio';
const DEFAULT_VIEWPORT: CanvasViewportState = { offset: { x: 0, y: 0 }, zoom: 1 };
type CanvasViewSize = { width: number; height: number };
type CanvasViewSnapshot = {
  sessionId: string | null;
  pendingSessionId: string | null;
  loadState: 'idle' | 'loading' | 'error';
  loadError: string | null;
  viewport: CanvasViewportState;
  size?: CanvasViewSize;
};

const DEFAULT_VIEW_SNAPSHOT: CanvasViewSnapshot = {
  sessionId: null,
  pendingSessionId: null,
  loadState: 'idle',
  loadError: null,
  viewport: DEFAULT_VIEWPORT,
};
const EMPTY_SUBSCRIBE = () => () => undefined;
const GET_PRIMARY_VIEW_ID = () => 'primary' as const;
const GET_DEFAULT_VIEW_SNAPSHOT = () => DEFAULT_VIEW_SNAPSHOT;
const GET_DEFAULT_VIEWPORT = () => DEFAULT_VIEWPORT;

const cloneViewport = (viewport: CanvasViewportState): CanvasViewportState => ({
  offset: { ...viewport.offset },
  zoom: viewport.zoom,
});

const sameViewport = (a: CanvasViewportState, b: CanvasViewportState) =>
  a.zoom === b.zoom && a.offset.x === b.offset.x && a.offset.y === b.offset.y;

const sameSize = (a: CanvasViewSize | undefined, b: CanvasViewSize) =>
  a?.width === b.width && a.height === b.height;

const viewportWorldCenter = (viewport: CanvasViewportState, size: CanvasViewSize) => ({
  x: (size.width / 2 - viewport.offset.x) / viewport.zoom,
  y: (size.height / 2 - viewport.offset.y) / viewport.zoom,
});

const centerViewport = (
  viewport: CanvasViewportState,
  size: CanvasViewSize,
  center: { x: number; y: number }
): CanvasViewportState => ({
  ...viewport,
  offset: {
    x: size.width / 2 - center.x * viewport.zoom,
    y: size.height / 2 - center.y * viewport.zoom,
  },
});

class CanvasViewRuntime {
  readonly engine: CanvasEngineRuntime;
  private snapshot: CanvasViewSnapshot;
  private liveViewport: CanvasViewportState;
  private readonly sessionViewports = new Map<string, CanvasViewportState>();
  private pendingWorldCenter: { x: number; y: number } | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly viewportListeners = new Set<() => void>();
  private readonly publish: (viewport: CanvasViewportState) => void;

  constructor(
    viewId: CanvasViewId,
    sessionId: string | null,
    viewport: CanvasViewportState,
    frameScheduler: CanvasFrameScheduler,
    publish: (viewport: CanvasViewportState) => void
  ) {
    this.snapshot = {
      sessionId,
      pendingSessionId: null,
      loadState: 'idle',
      loadError: null,
      viewport: cloneViewport(viewport),
    };
    this.liveViewport = cloneViewport(viewport);
    this.publish = publish;
    this.engine = new CanvasEngineRuntime({
      getViewport: this.getViewport,
      setViewport: this.setViewport,
    }, new CanvasScopedFrameScheduler(frameScheduler, viewId));
    this.engine.renderActivity.subscribe((mode) => {
      if (mode === 'settled') this.commitViewport();
    });
  }

  getSnapshot = () => this.snapshot;

  getViewport = () => this.liveViewport;

  getSessionId = () => this.snapshot.sessionId;

  getRequestedSessionId = () =>
    this.snapshot.pendingSessionId ?? this.snapshot.sessionId;

  getRequestedViewport = () => {
    const sessionId = this.getRequestedSessionId();
    if (!sessionId || sessionId === this.snapshot.sessionId) {
      return cloneViewport(this.liveViewport);
    }
    return cloneViewport(
      this.sessionViewports.get(sessionId) ?? this.liveViewport
    );
  };

  requestSession(sessionId: string, fallbackViewport: CanvasViewportState) {
    if (!this.sessionViewports.has(sessionId)) {
      this.sessionViewports.set(sessionId, cloneViewport(fallbackViewport));
    }
    if (sessionId === this.snapshot.sessionId) {
      this.snapshot = {
        ...this.snapshot,
        pendingSessionId: null,
        loadState: 'idle',
        loadError: null,
      };
    } else {
      this.snapshot = {
        ...this.snapshot,
        pendingSessionId: sessionId,
        loadState: 'loading',
        loadError: null,
      };
    }
    this.listeners.forEach((listener) => listener());
  }

  failSessionRequest(message: string) {
    this.snapshot = { ...this.snapshot, loadState: 'error', loadError: message };
    this.listeners.forEach((listener) => listener());
  }

  setViewport = (
    updater: (viewport: CanvasViewportState) => CanvasViewportState,
    options: { transient?: boolean; publish?: boolean } = {}
  ) => {
    const next = cloneViewport(updater(this.getViewport()));
    const changed = !sameViewport(this.liveViewport, next);
    if (changed) {
      this.liveViewport = next;
      this.viewportListeners.forEach((listener) => listener());
    }
    if (options.transient) return;
    this.commitViewport(options.publish ?? true);
  };

  private commitViewport(publish = true) {
    if (sameViewport(this.snapshot.viewport, this.liveViewport)) return;
    const viewport = cloneViewport(this.liveViewport);
    this.snapshot = { ...this.snapshot, viewport };
    this.listeners.forEach((listener) => listener());
    if (publish) this.publish(viewport);
  }

  setContainerSize = (size: CanvasViewSize | undefined) => {
    if (!size || size.width <= 0 || size.height <= 0) return;
    const previousSize = this.snapshot.size;
    const pendingCenter = this.pendingWorldCenter;
    this.pendingWorldCenter = null;

    if (!previousSize && !pendingCenter) {
      this.snapshot = { ...this.snapshot, size };
      this.listeners.forEach((listener) => listener());
      return;
    }
    if (sameSize(previousSize, size) && !pendingCenter) return;

    const center = pendingCenter ?? viewportWorldCenter(this.liveViewport, previousSize!);
    const viewport = centerViewport(this.liveViewport, size, center);
    const viewportChanged = !sameViewport(this.liveViewport, viewport);
    this.liveViewport = viewport;
    this.snapshot = { ...this.snapshot, viewport, size };
    if (viewportChanged) {
      this.viewportListeners.forEach((listener) => listener());
    }
    this.listeners.forEach((listener) => listener());
    if (viewportChanged) this.publish(viewport);
  };

  preserveWorldCenterOnNextResize(center: { x: number; y: number }) {
    this.pendingWorldCenter = center;
  }

  replaceViewport(viewport: CanvasViewportState, publish = false) {
    this.setViewport(() => viewport, { publish });
  }

  bindSession(sessionId: string, fallbackViewport: CanvasViewportState) {
    const currentSessionId = this.snapshot.sessionId;
    if (
      currentSessionId === sessionId &&
      this.snapshot.pendingSessionId === null &&
      this.snapshot.loadState === 'idle'
    ) return;
    if (currentSessionId) {
      this.sessionViewports.set(currentSessionId, cloneViewport(this.liveViewport));
    }
    const viewport = cloneViewport(
      this.sessionViewports.get(sessionId) ?? fallbackViewport
    );
    this.snapshot = {
      ...this.snapshot,
      sessionId,
      pendingSessionId: null,
      loadState: 'idle',
      loadError: null,
      viewport,
    };
    this.liveViewport = cloneViewport(viewport);
    this.viewportListeners.forEach((listener) => listener());
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  subscribeViewport = (listener: () => void) => {
    this.viewportListeners.add(listener);
    return () => this.viewportListeners.delete(listener);
  };

}

class CanvasWorkspaceRuntime {
  readonly views: Record<CanvasViewId, CanvasViewRuntime>;
  private readonly frameScheduler = new CanvasFrameScheduler();
  private readonly publishViewport: (sessionId: string, viewport: CanvasViewportState) => void;
  private readonly switchSession: (sessionId: string) => Promise<boolean>;
  private globalSessionId: string | null;
  private activeViewId: CanvasViewId = 'primary';
  private secondaryInitialized = false;
  private readonly activeListeners = new Set<() => void>();
  private readonly activeViewportListeners = new Set<() => void>();
  private ownerCount = 0;
  private releaseGeneration = 0;
  private disposed = false;
  private activationGeneration = 0;
  private switchingSessionId: string | null = null;

  constructor(
    sessionId: string | null,
    viewport: CanvasViewportState,
    publishViewport: (sessionId: string, viewport: CanvasViewportState) => void,
    switchSession: (sessionId: string) => Promise<boolean>
  ) {
    this.globalSessionId = sessionId;
    this.publishViewport = publishViewport;
    this.switchSession = switchSession;
    const publish = (viewId: CanvasViewId) => (next: CanvasViewportState) => {
      const sessionId = this.globalSessionId;
      if (
        sessionId &&
        viewId === this.activeViewId &&
        this.views?.[viewId].getSessionId() === sessionId
      ) {
        this.publishViewport(sessionId, cloneViewport(next));
      }
    };
    this.views = {
      primary: new CanvasViewRuntime(
        'primary',
        sessionId,
        viewport,
        this.frameScheduler,
        publish('primary')
      ),
      secondary: new CanvasViewRuntime(
        'secondary',
        sessionId,
        viewport,
        this.frameScheduler,
        publish('secondary')
      ),
    };
    for (const [viewId, view] of Object.entries(this.views)) {
      view.subscribe(() => {
        if (viewId === this.activeViewId) {
          this.activeViewportListeners.forEach((listener) => listener());
        }
      });
    }
  }

  getActiveViewId = () => this.activeViewId;

  subscribeActive = (listener: () => void) => {
    this.activeListeners.add(listener);
    return () => this.activeListeners.delete(listener);
  };

  getActiveViewport = () => this.views[this.activeViewId].getViewport();

  getActiveViewportSnapshot = () =>
    this.views[this.activeViewId].getSnapshot().viewport;

  setActiveViewport = (
    updater: (viewport: CanvasViewportState) => CanvasViewportState,
    options?: { transient?: boolean }
  ) => this.views[this.activeViewId].setViewport(updater, options);

  subscribeActiveViewport = (listener: () => void) => {
    this.activeViewportListeners.add(listener);
    return () => this.activeViewportListeners.delete(listener);
  };

  async activate(viewId: CanvasViewId) {
    const generation = ++this.activationGeneration;
    const changedView = this.activeViewId !== viewId;
    this.activeViewId = viewId;
    if (changedView) {
      this.activeListeners.forEach((listener) => listener());
    }

    const view = this.views[viewId];
    const sessionId = view.getRequestedSessionId();
    const viewport = view.getRequestedViewport();
    if (sessionId && sessionId !== this.globalSessionId) {
      this.switchingSessionId = sessionId;
      const switched = await this.switchSession(sessionId);
      if (generation !== this.activationGeneration) return false;
      this.switchingSessionId = null;
      if (!switched) {
        view.failSessionRequest('Canvas could not be loaded');
        this.activeViewportListeners.forEach((listener) => listener());
        return false;
      }
      view.bindSession(sessionId, viewport);
      view.replaceViewport(viewport);
      this.publishViewport(sessionId, viewport);
    } else {
      if (sessionId) view.bindSession(sessionId, viewport);
      if (sessionId) this.publishViewport(sessionId, viewport);
    }
    this.activeViewportListeners.forEach((listener) => listener());
    return true;
  }

  selectSession(viewId: CanvasViewId, sessionId: string, viewport: CanvasViewportState) {
    this.views[viewId].requestSession(sessionId, viewport);
    void this.activate(viewId);
  }

  openSplit() {
    if (this.secondaryInitialized) return;
    this.secondaryInitialized = true;
    const primary = this.views.primary.getSnapshot();
    if (primary.sessionId) {
      this.views.secondary.bindSession(primary.sessionId, primary.viewport);
    }
    this.views.secondary.replaceViewport(primary.viewport);
    if (primary.size) {
      const center = viewportWorldCenter(primary.viewport, primary.size);
      this.views.primary.preserveWorldCenterOnNextResize(center);
      this.views.secondary.preserveWorldCenterOnNextResize(center);
    }
  }

  closeSplit() {
    // View bindings and cameras stay alive so reopening restores the workspace.
  }

  syncCanvasState(
    sessionId: string | null,
    viewport: CanvasViewportState,
    availableSessionIds: ReadonlySet<string>
  ) {
    if (
      this.switchingSessionId &&
      sessionId !== this.switchingSessionId
    ) {
      this.switchingSessionId = null;
      this.activationGeneration += 1;
    }
    this.globalSessionId = sessionId;
    if (sessionId) {
      for (const view of Object.values(this.views)) {
        const boundSessionId = view.getSessionId();
        if (!boundSessionId || !availableSessionIds.has(boundSessionId)) {
          view.bindSession(sessionId, viewport);
        }
      }
    }

    const activeView = this.views[this.activeViewId];
    if (sessionId && activeView.getSessionId() !== sessionId) {
      activeView.bindSession(sessionId, viewport);
      this.publishViewport(sessionId, activeView.getViewport());
    }
  }

  acquire() {
    if (this.disposed) return () => undefined;
    this.ownerCount += 1;
    this.releaseGeneration += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.ownerCount = Math.max(0, this.ownerCount - 1);
      const generation = ++this.releaseGeneration;
      queueMicrotask(() => {
        if (
          !this.disposed &&
          this.ownerCount === 0 &&
          this.releaseGeneration === generation
        ) this.dispose();
      });
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ownerCount = 0;
    this.releaseGeneration += 1;
    this.views.secondary.engine.dispose();
    this.views.primary.engine.dispose();
    this.frameScheduler.dispose();
  }
}

type CanvasWorkspaceContextValue = {
  runtime: CanvasWorkspaceRuntime;
  splitEnabled: boolean;
  setSplitEnabled: (enabled: boolean) => void;
  splitRatio: number;
  setSplitRatio: (ratio: number) => void;
  selectViewSession: (viewId: CanvasViewId, sessionId: string) => void;
};

type CanvasViewContextValue = {
  viewId: CanvasViewId;
  runtime: CanvasViewRuntime;
};

const CanvasWorkspaceContext = createContext<CanvasWorkspaceContextValue | null>(null);
const CanvasViewContext = createContext<CanvasViewContextValue | null>(null);

export function CanvasWorkspaceProvider({ children }: { children: ReactNode }) {
  const canvas = useCanvasRuntime();
  const activeCanvasId = useCanvasState((state) => state.activeCanvasId);
  const [runtime] = useState(() => {
    const state = canvas.getState();
    return new CanvasWorkspaceRuntime(
      state.activeCanvasId,
      canvas.viewport.getSnapshot(),
      canvas.commands.sessions.saveViewport,
      canvas.commands.sessions.switch
    );
  });
  const [storedSplitEnabled, storeSplitEnabled] = useLocalStorageState<boolean>(
    SPLIT_ENABLED_STORAGE_KEY,
    { defaultValue: false }
  );
  const [storedSplitRatio, storeSplitRatio] = useLocalStorageState<number>(
    SPLIT_RATIO_STORAGE_KEY,
    { defaultValue: 50 }
  );
  const splitEnabled = storedSplitEnabled ?? false;
  const splitRatio = Math.min(75, Math.max(25, storedSplitRatio ?? 50));
  useEffect(() => {
    const sync = () => {
      const state = canvas.getState();
      const activeSession = state.canvasSessions.find(
        (session) => session.id === state.activeCanvasId
      );
      runtime.syncCanvasState(
        state.activeCanvasId,
        normalizeCanvasViewport(activeSession?.viewport),
        new Set(state.canvasSessions.map((session) => session.id))
      );
    };
    sync();
    return canvas.subscribe((state, previous) => {
      if (
        state.activeCanvasId === previous.activeCanvasId &&
        state.canvasSessions === previous.canvasSessions
      ) return;
      sync();
    });
  }, [activeCanvasId, canvas, runtime]);

  useEffect(() => canvas.viewport.bind({
    getViewport: runtime.getActiveViewport,
    getSnapshot: runtime.getActiveViewportSnapshot,
    setViewport: runtime.setActiveViewport,
    subscribe: runtime.subscribeActiveViewport,
  }), [canvas.viewport, runtime]);

  useEffect(() => runtime.acquire(), [runtime]);

  useEffect(() => {
    if (splitEnabled) runtime.openSplit();
    else runtime.closeSplit();
  }, [runtime, splitEnabled]);

  useEffect(() => {
    const syncRetained = () => {
      const ids = new Set<string>();
      const activeView = runtime.views[runtime.getActiveViewId()].getSnapshot();
      if (activeView.sessionId) ids.add(activeView.sessionId);
      if (activeView.pendingSessionId) ids.add(activeView.pendingSessionId);
      if (splitEnabled) {
        const secondary = runtime.views.secondary.getSnapshot();
        if (secondary.sessionId) ids.add(secondary.sessionId);
        if (secondary.pendingSessionId) ids.add(secondary.pendingSessionId);
      }
      canvas.setRetainedCanvasIds(Array.from(ids));
    };
    syncRetained();
    const unsubPrimary = runtime.views.primary.subscribe(syncRetained);
    const unsubSecondary = runtime.views.secondary.subscribe(syncRetained);
    const unsubActive = runtime.subscribeActive(syncRetained);
    return () => {
      unsubActive();
      unsubSecondary();
      unsubPrimary();
    };
  }, [canvas, runtime, splitEnabled]);

  const setSplitEnabled = useCallback((enabled: boolean) => {
    storeSplitEnabled(enabled);
  }, [storeSplitEnabled]);

  const setSplitRatio = useCallback((ratio: number) => {
    storeSplitRatio(Math.min(75, Math.max(25, ratio)));
  }, [storeSplitRatio]);
  const selectViewSession = useCallback((viewId: CanvasViewId, sessionId: string) => {
    const session = canvas.getState().canvasSessions.find((item) => item.id === sessionId);
    if (!session) return;
    runtime.selectSession(
      viewId,
      sessionId,
      session.viewport ?? DEFAULT_VIEWPORT
    );
  }, [canvas, runtime]);
  const value = useMemo<CanvasWorkspaceContextValue>(() => ({
    runtime,
    splitEnabled,
    setSplitEnabled,
    splitRatio,
    setSplitRatio,
    selectViewSession,
  }), [runtime, selectViewSession, setSplitEnabled, setSplitRatio, splitEnabled, splitRatio]);

  return createElement(CanvasWorkspaceContext.Provider, { value }, children);
}

export function CanvasViewProvider({
  viewId,
  children,
}: {
  viewId: CanvasViewId;
  children: ReactNode;
}) {
  const workspace = useCanvasWorkspace();
  const value = useMemo(() => ({ viewId, runtime: workspace.runtime.views[viewId] }), [
    viewId,
    workspace.runtime,
  ]);
  return createElement(CanvasViewContext.Provider, { value }, children);
}

export const useCanvasWorkspace = () => {
  const workspace = useContext(CanvasWorkspaceContext);
  if (!workspace) throw new Error('useCanvasWorkspace must be used within CanvasWorkspaceProvider');
  return workspace;
};

export const useCanvasWorkspaceOptional = () => useContext(CanvasWorkspaceContext);

export const useCanvasViewOptional = () => {
  const workspace = useContext(CanvasWorkspaceContext);
  const view = useContext(CanvasViewContext);
  const activeViewId = useSyncExternalStore(
    workspace?.runtime.subscribeActive ?? EMPTY_SUBSCRIBE,
    workspace?.runtime.getActiveViewId ?? GET_PRIMARY_VIEW_ID,
    workspace?.runtime.getActiveViewId ?? GET_PRIMARY_VIEW_ID
  );
  const selectedViewId = view?.viewId ?? activeViewId;
  const selectedRuntime = view?.runtime ?? workspace?.runtime.views[selectedViewId];
  const snapshot = useSyncExternalStore(
    selectedRuntime?.subscribe ?? EMPTY_SUBSCRIBE,
    selectedRuntime?.getSnapshot ?? GET_DEFAULT_VIEW_SNAPSHOT,
    selectedRuntime?.getSnapshot ?? GET_DEFAULT_VIEW_SNAPSHOT
  );
  if (!workspace || !selectedRuntime) return null;
  return {
    viewId: selectedViewId,
    runtime: selectedRuntime.engine,
    sessionId: snapshot.sessionId,
    selectedSessionId: snapshot.pendingSessionId ?? snapshot.sessionId,
    loadState: snapshot.loadState,
    loadError: snapshot.loadError,
    viewport: snapshot.viewport,
    isActive: activeViewId === selectedViewId,
    activate: () => { void workspace.runtime.activate(selectedViewId); },
    selectSession: (sessionId: string) =>
      workspace.selectViewSession(selectedViewId, sessionId),
    setOffset: (updater: (offset: CanvasViewportState['offset']) => CanvasViewportState['offset']) =>
      selectedRuntime.setViewport((current) => ({ ...current, offset: updater(current.offset) })),
    setZoom: (updater: (zoom: number) => number) =>
      selectedRuntime.setViewport((current) => ({
        ...current,
        zoom: updater(current.zoom),
      })),
    setViewport: selectedRuntime.setViewport,
    subscribeViewport: selectedRuntime.subscribeViewport,
    getViewport: selectedRuntime.getViewport,
    containerSize: snapshot.size,
    setContainerSize: selectedRuntime.setContainerSize,
  };
};

export const useCanvasLiveViewportOptional = () => {
  const workspace = useContext(CanvasWorkspaceContext);
  const view = useContext(CanvasViewContext);
  const activeViewId = useSyncExternalStore(
    workspace?.runtime.subscribeActive ?? EMPTY_SUBSCRIBE,
    workspace?.runtime.getActiveViewId ?? GET_PRIMARY_VIEW_ID,
    workspace?.runtime.getActiveViewId ?? GET_PRIMARY_VIEW_ID
  );
  const selectedViewId = view?.viewId ?? activeViewId;
  const selectedRuntime = view?.runtime ?? workspace?.runtime.views[selectedViewId];
  const viewport = useSyncExternalStore(
    selectedRuntime?.subscribeViewport ?? EMPTY_SUBSCRIBE,
    selectedRuntime?.getViewport ?? GET_DEFAULT_VIEWPORT,
    selectedRuntime?.getViewport ?? GET_DEFAULT_VIEWPORT
  );
  return selectedRuntime ? viewport : null;
};

export const useActiveCanvasView = () => {
  const workspace = useCanvasWorkspace();
  const activeViewId = useSyncExternalStore(
    workspace.runtime.subscribeActive,
    workspace.runtime.getActiveViewId,
    workspace.runtime.getActiveViewId
  );
  const view = workspace.runtime.views[activeViewId];
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  return {
    viewId: activeViewId,
    runtime: view.engine,
    sessionId: snapshot.sessionId,
    viewport: snapshot.viewport,
    containerSize: snapshot.size,
  };
};
