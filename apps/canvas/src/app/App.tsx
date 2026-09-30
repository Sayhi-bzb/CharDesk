import { useLocalStorageState } from 'ahooks';
import { CanvasEditor } from '@/widgets/canvas-editor';
import {
  useCanvasPersistenceSelector,
  useCanvasRuntime,
  useCanvasState,
} from '@/domains/canvas/public';
import { Toolbar } from '@/widgets/toolbar/dock';
import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
  TooltipProvider,
  Toaster,
  Button,
  Surface,
  StatusText,
  type StatusTone,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  UiProvider,
} from '@chardesk/ui';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { feedback } from '@/shared/services/effects';
import { useShallow } from 'zustand/react/shallow';
import { CanvasSessionSelector } from '@/widgets/session-tabs/CanvasBreadcrumb';

import { AppMenu } from '@/widgets/toolbar/app-menu';
import { getStaticGridViewState } from '@/domains/selection/public';
import {
  isSourceBackedCanvasSession,
} from '@/domains/sessions/public';
import { useGlobalShortcutCommands } from './useGlobalShortcutCommands';
import { ZoomControl } from '@/widgets/toolbar/zoom-control';
import { SecurityControl } from '@/widgets/toolbar/security-control';
import { ShortcutProvider } from '@/shared/shortcuts/dispatcher';
import { useActiveCollaboration } from './useActiveCollaboration';
import { useHorizontalWheelNavigationGuard } from './useHorizontalWheelNavigationGuard';
import { CollaborationControl } from '@/widgets/collaboration/CollaborationControl';
import { RemoteSelectionOverlay } from '@/widgets/collaboration/RemoteSelectionOverlay';
import { CollaborationJoiningOverlay } from '@/widgets/collaboration/CollaborationJoiningOverlay';
import { useCollaborationSnapshot } from '@/widgets/collaboration/useCollaborationSnapshot';
import { sameCollaborationRoom } from '@/domains/collaboration/public';
import { OnboardingTourProvider } from '@/widgets/onboarding/new-user-tour';
import {
  CanvasViewProvider,
  CanvasWorkspaceProvider,
  useActiveCanvasView,
  useCanvasViewOptional,
  useCanvasWorkspace,
  type CanvasViewId,
} from '@/widgets/canvas-editor/engine/CanvasWorkspace';
import { useEditor } from '@/domains/editor/public';
import { CanvasTemplatePlacementProvider } from '@/widgets/canvas-editor/CanvasTemplatePlacement';



import { CanvasInspectorControl } from '@/widgets/canvas-inspector';
import {
  EditorChromeLayout,
  EditorChromeProvider,
  EditorPresentationProvider,
  EditorWidget,
  resolvePaneViewportFrame,
  resolveEditorHostPolicy,
  useEditorChromeLayout,
  useEditorPresentation,
} from '@/widgets/editor-chrome/public';
import { resolveEditorHostContract } from './editorHostProfile';
import { useEditorHostProfile } from './useEditorHostProfile';
import { useDocumentSource } from './useDocumentSource';
import { isLocalDocumentReaderRoute, isRetiredBlackboardRoute } from './documentRoute';
import { useRetiredBlackboard } from './useRetiredBlackboard';
import { getAppActionShortcuts } from '@/domains/actions/public';

import type { CanvasEditorCapabilities } from '@/widgets/canvas-editor/canvasEditorCapabilities';
import type { EditorViewportFrame } from '@/widgets/editor-chrome/public';
import { useUiI18n } from '@/shared/i18n';
import { RecoverableLazyBoundary } from '@/shared/components/RecoverableLazyBoundary';
import { requireLoadedModule } from '@/shared/lib/moduleLoadRecovery';
import { CanvasStartupBoundary } from './CanvasStartupBoundary';
import { CanvasAppearanceBridge } from '@/shared/canvas-appearance/react';
import { useWorkspaceRoute } from '@/shared/navigation/workspace-route';
import { LocalWorkspacePage } from './LocalWorkspacePage';
import { startCloudSync } from '@/domains/account/public';


const SidebarRight = lazy(() =>
  import('@/widgets/toolbar/sidebar-right').then((loaded) => ({
    default: requireLoadedModule(loaded).SidebarRight,
  }))
);

const getDocumentStatusTone = (
  state: ReturnType<typeof useDocumentSource>['status']['state'] |
    ReturnType<typeof useRetiredBlackboard>['status']['state']
): StatusTone => {
  switch (state) {
    case 'warning':
    case 'missing':
      return 'warning';
    case 'disconnected':
      return 'error';
    default:
      return 'neutral';
  }
};

function SidebarShortcutRegistration() {
  const { toggleSidebar } = useSidebar();
  const editor = useEditor();
  useEffect(() => {
    const disposeCommand = editor.commands.register('app.chrome', {
      id: 'ui.toggle-sidebar',
      execute: () => {
        toggleSidebar();
        return { handled: true, status: 'succeeded' };
      },
    });
    const disposeBinding = editor.keymap.register('app.chrome', {
      id: 'command:toggle-sidebar',
      label: 'Toggle Sidebar',
      category: 'Canvas',
      scope: 'application',
      shortcuts: getAppActionShortcuts('toggle-sidebar'),
      target: { type: 'command', id: 'ui.toggle-sidebar' },
      when: ({ targetKind }) => targetKind !== 'editable' && targetKind !== 'overlay',
    });
    return () => {
      disposeBinding();
      disposeCommand();
    };
  }, [editor, toggleSidebar]);
  return null;
}

function PhoneSidebarTrigger() {
  const { openMobile } = useSidebar();
  const { t } = useUiI18n();
  if (openMobile) return null;
  return <SidebarTrigger side="right" aria-label={t('sidebar.toggle')} />;
}

function SplitViewCommandRegistration() {
  const editor = useEditor();
  const { splitEnabled, setSplitEnabled } = useCanvasWorkspace();
  const { viewportFrame, formFactor } = useEditorChromeLayout();
  const splitAvailable = resolveEditorHostPolicy(formFactor).splitView &&
    (viewportFrame.width === 0 || viewportFrame.width >= 640);
  useEffect(() => editor.commands.register('app.chrome', {
    id: 'ui.toggle-split-view',
    execute: () => {
      if (!splitAvailable) return { handled: false, status: 'unhandled' };
      setSplitEnabled(!splitEnabled);
      return { handled: true, status: 'succeeded' };
    },
  }), [editor, setSplitEnabled, splitAvailable, splitEnabled]);
  return null;
}

type CanvasPaneProps = {
  viewId: CanvasViewId;
  onUndo: () => void;
  onRedo: () => void;
  capabilities: CanvasEditorCapabilities;
  fitContentRevision: number;
  viewportFrame?: EditorViewportFrame;
  collaborate: boolean;
  split: boolean;
  manageSessions: boolean;
};

function BoundCanvasSessionSelector({
  manageSessions,
  onboardingTarget = false,
  showPaneActivity = false,
}: {
  manageSessions: boolean;
  onboardingTarget?: boolean;
  showPaneActivity?: boolean;
}) {
  const view = useCanvasViewOptional();
  if (!view) return null;
  return (
    <CanvasSessionSelector
      manageSessions={manageSessions}
      selectedSessionId={view.selectedSessionId}
      onSelectSession={view.selectSession}
      onActivate={view.activate}
      onboardingTarget={onboardingTarget}
      paneActive={showPaneActivity && view.isActive}
    />
  );
}

function HostedCanvasSessionSelector({
  viewId,
  manageSessions,
  showPaneActivity,
}: {
  viewId: CanvasViewId;
  manageSessions: boolean;
  showPaneActivity: boolean;
}) {
  return (
    <CanvasViewProvider viewId={viewId}>
      <div
        data-canvas-ui="true"
        data-testid={`canvas-session-selector-${viewId}`}
        className="pointer-events-auto min-w-0 max-w-[min(14rem,calc(100vw-7.75rem))]"
      >
        <BoundCanvasSessionSelector
          manageSessions={manageSessions}
          onboardingTarget
          showPaneActivity={showPaneActivity}
        />
      </div>
    </CanvasViewProvider>
  );
}

function CanvasPaneContent({
  onUndo,
  onRedo,
  capabilities,
  fitContentRevision,
  viewportFrame,
  collaborate,
  split,
  manageSessions,
}: Omit<CanvasPaneProps, 'viewId'>) {
  const view = useCanvasViewOptional();
  const { t } = useUiI18n();
  if (!view) return null;
  const paneViewportFrame = viewportFrame && view.containerSize
    ? resolvePaneViewportFrame(
        viewportFrame,
        view.containerSize,
        split ? (view.viewId === 'primary' ? 'start' : 'end') : 'single'
      )
    : viewportFrame;
  return (
    <div
      data-testid={`canvas-view-${view.viewId}`}
      data-active={view.isActive ? 'true' : 'false'}
      data-load-state={view.loadState}
      data-session-id={view.sessionId ?? undefined}
      aria-busy={view.loadState === 'loading'}
      aria-label={
        view.viewId === 'primary' ? t('canvasView.primary') : t('canvasView.secondary')
      }
      className="relative size-full overflow-hidden"
    >
      <CanvasEditor
        onUndo={onUndo}
        onRedo={onRedo}
        capabilities={capabilities}
        fitContentRevision={fitContentRevision}
        viewportFrame={paneViewportFrame}
        active={view.isActive && view.loadState === 'idle'}
        onActivate={view.activate}
        onContainerSizeChange={view.setContainerSize}
      />
      {view.loadState === 'loading' ? (
        <>
          <div
            data-testid={`canvas-view-loading-${view.viewId}`}
            className="pointer-events-auto absolute inset-0 z-(--layer-canvas-interaction) cursor-progress bg-transparent"
          />
          <Surface
            kind="overlay"
            data-canvas-ui="true"
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute left-1/2 top-(--editor-safe-top) z-(--layer-contextual) -translate-x-1/2 px-2 py-1"
          >
            <StatusText tone="neutral" className="whitespace-nowrap text-xs">
              {t('canvasView.loading')}
            </StatusText>
          </Surface>
        </>
      ) : null}
      {view.loadState === 'error' ? (
        <Surface
          kind="overlay"
          data-canvas-ui="true"
          role="alert"
          className="pointer-events-auto absolute left-1/2 top-(--editor-safe-top) z-(--layer-contextual) flex -translate-x-1/2 items-center gap-2 px-2 py-1"
        >
          <StatusText tone="error" className="whitespace-nowrap text-xs">
            {t('canvasView.loadFailed')}
          </StatusText>
          <Button
            type="button"
            tone="subtle"
            size="sm"
            disabled={!view.selectedSessionId}
            onClick={() => {
              if (view.selectedSessionId) view.selectSession(view.selectedSessionId);
            }}
          >
            {t('canvasView.retry')}
          </Button>
        </Surface>
      ) : null}
      {split && view.viewId === 'secondary' ? (
        <EditorWidget role="pane">
          <div
            data-canvas-ui="true"
            data-testid="canvas-session-selector-secondary"
            className="pointer-events-auto absolute left-(--editor-chrome-inset) top-(--editor-safe-top) z-(--layer-chrome) max-w-[min(14rem,calc(100%-1rem))]"
          >
            <BoundCanvasSessionSelector
              manageSessions={manageSessions}
              showPaneActivity
            />
          </div>
        </EditorWidget>
      ) : null}
      {collaborate && view.isActive && (
        <>
          <RemoteSelectionOverlay viewportFrame={paneViewportFrame} />
          <CollaborationJoiningOverlay />
        </>
      )}
    </div>
  );
}

function CanvasPane({ viewId, ...props }: CanvasPaneProps) {
  return (
    <CanvasViewProvider viewId={viewId}>
      <CanvasPaneContent {...props} />
    </CanvasViewProvider>
  );
}

function CanvasWorkspaceSurface({
  renderSplit,
  ...props
}: Omit<CanvasPaneProps, 'viewId' | 'split'> & { renderSplit: boolean }) {
  const workspace = useCanvasWorkspace();
  const activeView = useActiveCanvasView();
  const { t } = useUiI18n();

  return (
    <div
      data-onboarding-target="workspace"
      data-split-view={renderSplit ? 'true' : 'false'}
      className="relative size-full overflow-hidden"
    >
      {renderSplit ? (
        <ResizablePanelGroup
          id="canvas-split-view"
          orientation="horizontal"
          defaultLayout={{
            primary: workspace.splitRatio,
            secondary: 100 - workspace.splitRatio,
          }}
          resizeTargetMinimumSize={{ fine: 8, coarse: 24 }}
          onLayoutChanged={(layout, meta) => {
            if (meta.isUserInteraction && layout.primary != null) {
              workspace.setSplitRatio(layout.primary);
            }
          }}
        >
          <ResizablePanel id="primary" minSize="320px">
            <CanvasPane viewId="primary" split {...props} />
          </ResizablePanel>
          <ResizableHandle aria-label={t('canvasView.resize')} />
          <ResizablePanel id="secondary" minSize="320px">
            <CanvasPane viewId="secondary" split {...props} />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <CanvasPane viewId={activeView.viewId} split={false} {...props} />
      )}
    </div>
  );
}

function AppContent() {
  const hostProfile = useEditorHostProfile();
  useActiveCollaboration({ enabled: hostProfile.capabilities.collaborate });
  useHorizontalWheelNavigationGuard();
  const collaborationSnapshot = useCollaborationSnapshot();
  const persistenceRestorePhase = useCanvasPersistenceSelector(
    (status) => status.restore.phase
  );
  const activeCanvasMode = useCanvasState((state) => state.canvasMode);
  const activeSession = useCanvasState((state) =>
    state.canvasSessions.find((session) => session.id === state.activeCanvasId)
  );
  const activeCollaboration = activeSession?.collaboration;
  const sourceBacked = isSourceBackedCanvasSession(activeSession) || !!activeSession?.migrationPending || isRetiredBlackboardRoute(window.location);
  const isCollaborationReadOnly =
    !!activeCollaboration &&
    (!collaborationSnapshot.canEdit ||
      !sameCollaborationRoom(activeCollaboration, collaborationSnapshot.descriptor));
  const hostContract = resolveEditorHostContract(
    hostProfile,
    {
      mode: activeCanvasMode,
      sourceBacked,
      canEdit:
        !sourceBacked &&
        !isCollaborationReadOnly &&
        persistenceRestorePhase !== 'retrying',
    }
  );
  const { capabilities, surfaces } = hostContract;
  const localReaderEnabled = isLocalDocumentReaderRoute(window.location);
  const documentSource = useDocumentSource({
    enabled: localReaderEnabled,
  });
  const retiredWorkspace = useRetiredBlackboard({ enabled: !localReaderEnabled });
  const documentStatus = localReaderEnabled ? documentSource : retiredWorkspace;
  const { formFactor, sidebarPresentation, viewportFrame } = useEditorChromeLayout();
  const { mode, isWidgetVisible } = useEditorPresentation();
  const zenMode = mode === 'zen';
  const showHostWidgets = isWidgetVisible('host');
  const workspace = useCanvasWorkspace();
  const activeView = useActiveCanvasView();
  const splitAvailable = resolveEditorHostPolicy(formFactor).splitView &&
    (viewportFrame.width === 0 || viewportFrame.width >= 640);
  const renderSplit = workspace.splitEnabled && splitAvailable;
  const hostedSelectorViewId: CanvasViewId = renderSplit ? 'primary' : activeView.viewId;
  const { tool, staticGrid, contentSurface } = useCanvasState(
    useShallow((state) => ({
      tool: state.tool,
      staticGrid: state.interaction.staticGrid,
      contentSurface: state.contentSurface,
    }))
  );
  const editor = useEditor();
  const canvas = useCanvasRuntime();
  const initialToolApplied = useRef(false);
  useEffect(() => {
    if (initialToolApplied.current || viewportFrame.width <= 0) return;
    initialToolApplied.current = true;
    if (formFactor === 'phone') editor.setCurrentTool('pan');
  }, [editor, formFactor, viewportFrame.width]);
  const setTool = useCallback(
    (nextTool: typeof tool) => {
      editor.setCurrentTool(nextTool);
    },
    [editor]
  );
  const exitStaticGridTextEdit = canvas.commands.staticGrid.exitTextEdit;
  const staticGridView = useMemo(
    () =>
      getStaticGridViewState({
        state: staticGrid,
        grid: contentSurface.reader,
      }),
    [contentSurface, staticGrid]
  );
  const isCanvasTextEditing = staticGridView.interaction.kind === "text-edit";
  const exitCanvasTextEditing = useCallback(
    () => exitStaticGridTextEdit(),
    [exitStaticGridTextEdit]
  );
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useLocalStorageState<boolean>(
    'ui-right-panel-status',
    { defaultValue: true }
  );
  const [transientSidebar, setTransientSidebar] = useState({
    formFactor,
    open: false,
  });
  const transientSidebarOpen = transientSidebar.formFactor === formFactor && transientSidebar.open;

  const isRightPanelOpen =
    formFactor === 'desktop' ? (desktopSidebarOpen ?? true) : transientSidebarOpen;
  const setIsRightPanelOpen = useCallback(
    (open: boolean) => {
      if (formFactor === 'desktop') setDesktopSidebarOpen(open);
      else setTransientSidebar({ formFactor, open });
    },
    [formFactor, setDesktopSidebarOpen, setTransientSidebar]
  );

  const handleUndo = () => {
    const changed = editor.history.undo();
    if (changed) feedback.dismiss();
    return changed;
  };

  const handleRedo = () => {
    return editor.history.redo();
  };

  useGlobalShortcutCommands({
    capabilities,
  });

  return (
    <SidebarProvider
      presentation={sidebarPresentation}
      open={isRightPanelOpen}
      onOpenChange={setIsRightPanelOpen}
      style={{ '--sidebar-width': '18rem' } as CSSProperties}
      className="size-full overflow-hidden"
    >
      {surfaces.sidebar && <SidebarShortcutRegistration />}
      <SplitViewCommandRegistration />
      <EditorChromeLayout
        sidebarOpen={showHostWidgets && !!surfaces.sidebar && isRightPanelOpen}
        topStart={
          <div
            data-canvas-ui="true"
            data-testid="app-top-bar"
            data-zen-mode={zenMode ? 'true' : 'false'}
            className="flex min-w-0 items-center gap-1 pointer-events-none"
          >
            <div data-testid="app-primary-control-stack" className="relative size-8 flex-none">
              <div inert={!capabilities.manageSessions || undefined}>
                <EditorWidget role="essential">
                  <AppMenu
                    formFactor={formFactor}
                    splitAvailable={splitAvailable}
                  />
                </EditorWidget>
              </div>
              <EditorWidget role="host">
                <div
                  data-testid="canvas-properties-control-position"
                  className="pointer-events-auto absolute left-0 top-9"
                >
                  <CanvasInspectorControl
                    available={!!surfaces.inspector}
                    formFactor={formFactor}
                    readOnly={!capabilities.mutateContent}
                  />
                </div>
              </EditorWidget>
            </div>
            <EditorWidget role="host">
              <HostedCanvasSessionSelector
                viewId={hostedSelectorViewId}
                manageSessions={capabilities.manageSessions}
                showPaneActivity={renderSplit}
              />
            </EditorWidget>
            {showHostWidgets &&
              sourceBacked &&
              documentStatus.status.state !== 'current' &&
              documentStatus.status.state !== 'idle' && (
                <StatusText tone={getDocumentStatusTone(documentStatus.status.state)} asChild>
                  <span
                    data-testid="document-source-status"
                    data-state={documentStatus.status.state}
                    className="pointer-events-auto truncate px-2 text-xs"
                  >
                    {documentStatus.status.message}
                  </span>
                </StatusText>
              )}
            {showHostWidgets && capabilities.collaborate && (
              <div className="flex-none">
                <CollaborationControl />
              </div>
            )}
          </div>
        }
        topEnd={
          showHostWidgets && formFactor === 'phone' && surfaces.sidebar
            ? <PhoneSidebarTrigger />
            : null
        }
        bottomStart={
          !showHostWidgets || formFactor === 'phone' ? null
            : <ZoomControl viewportFrame={viewportFrame} formFactor={formFactor} />
        }
        bottomCenter={!showHostWidgets ? null : (
          <div>
            <Toolbar
              tool={tool}
              setTool={setTool}
              onUndo={handleUndo}
              isCanvasTextEditing={isCanvasTextEditing}
              onExitCanvasTextEditing={exitCanvasTextEditing}
              enabled={capabilities.navigate || capabilities.select}
              mutateContent={capabilities.mutateContent}
              formFactor={formFactor}
              viewportSize={{ width: viewportFrame.width, height: viewportFrame.height }}
            />
          </div>
        )}
        bottomEnd={!showHostWidgets || formFactor === 'phone' ? null : <SecurityControl />}
        sidebar={!showHostWidgets || !surfaces.sidebar ? null : (
          <RecoverableLazyBoundary
            resetKey={isRightPanelOpen}
            onError={() => setIsRightPanelOpen(false)}
          >
            <Suspense fallback={null}>
              <div className="size-full min-h-0 overflow-visible">
                <SidebarRight
                  canvasMode={surfaces.sidebar}
                  readOnly={!capabilities.mutateContent}
                />
              </div>
            </Suspense>
          </RecoverableLazyBoundary>
        )}
        canvas={
          <CanvasWorkspaceSurface
            onUndo={handleUndo}
            onRedo={handleRedo}
            capabilities={capabilities}
            fitContentRevision={
              documentSource.firstFitRevision + retiredWorkspace.firstFitRevision
            }
            viewportFrame={viewportFrame}
            collaborate={capabilities.collaborate}
            manageSessions={capabilities.manageSessions}
            renderSplit={renderSplit}
          />
        }
      />
      <Toaster />
    </SidebarProvider>
  );
}

function AppScreen() {
  const canvas = useCanvasRuntime();
  useEffect(() => startCloudSync(canvas), [canvas]);
  const workspaceRoute = useWorkspaceRoute();
  if (workspaceRoute) return <LocalWorkspacePage />;
  return (
    <OnboardingTourProvider autoStart={!isLocalDocumentReaderRoute(window.location)}>
      <CanvasWorkspaceProvider>
        <CanvasTemplatePlacementProvider>
          <AppContent />
        </CanvasTemplatePlacementProvider>
      </CanvasWorkspaceProvider>
    </OnboardingTourProvider>
  );
}

export default function App() {
  const { t } = useUiI18n();
  const uiMessages = useMemo(
    () => ({
      dialogClose: t('dialog.close'),
      notificationRegion: t('notification.region'),
      sidebarTitle: t('sidebar.title'),
      sidebarMobileDescription: t('sidebar.mobileDescription'),
      sidebarToggle: t('sidebar.toggle'),
    }),
    [t]
  );

  return (
    <UiProvider messages={uiMessages}>
      <CanvasAppearanceBridge />
      <ShortcutProvider>
        <TooltipProvider>
          <EditorPresentationProvider>
            <EditorChromeProvider>
              <CanvasStartupBoundary>
                <AppScreen />
              </CanvasStartupBoundary>
            </EditorChromeProvider>
          </EditorPresentationProvider>
        </TooltipProvider>
      </ShortcutProvider>
    </UiProvider>
  );
}
