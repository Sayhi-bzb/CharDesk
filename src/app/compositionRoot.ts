import {
  createEditorCommandsExtension,
  createSelectionCommandFactory,
} from "@/domains/actions/public";
import {
  CanvasRuntime,
  createCanvasRuntime,
} from "@/domains/canvas/public";
import {
  CollaborationRuntime,
  createCollaborationRuntime,
} from "@/domains/collaboration/public";
import {
  createTextRenderingRuntime,
  parseDocumentSessionSource,
  TextRenderingWorkerClient,
  type TextRenderingRuntime,
  type TextRenderingStorage,
} from "@/domains/document/public";
import {
  createCanvasEditorExtension,
  createCanvasEditorRuntime,
  connectEditorKeymapPersistence,
  type CanvasEditorRuntime,
  type EditorExtension,
} from "@/domains/editor/public";
import { EDITOR_PERSISTENCE_KEY } from "@/domains/sessions/public";
import type { CanvasState } from "@/domains/canvas/public";
import type { CanvasSessionSnapshot } from "@/domains/sessions/public";
import {
  EDITOR_HOST_PROFILE,
  type EditorHostProfile,
} from "./editorHostProfile";
import {
  BlackboardRuntime,
  IndexedDbBlackboardRepository,
  type BlackboardWorkspaceRepository,
} from "@/domains/blackboard/public";
import { createCanvasFontRuntime, type CanvasFontRuntime, type CanvasFontStorage } from "@/shared/fonts/runtime";
import {
  createCanvasCursorRuntime,
  type CanvasCursorRuntime,
  type CanvasCursorStorage,
} from "@/shared/canvas-cursor/runtime";

type KeymapStorage = Pick<Storage, "getItem" | "setItem">;

type ApplicationEditorHostOptions = {
  canvasPersistence?: false | { storage: Storage; key: string; migrateLegacy?: boolean };
  keymapStorage?: KeymapStorage | false;
  textRenderingStorage?: TextRenderingStorage | false;
  canvasFontStorage?: CanvasFontStorage | false;
  canvasCursorStorage?: CanvasCursorStorage | false;
  profile?: EditorHostProfile;
  initialSessions?: readonly CanvasSessionSnapshot[];
  blackboardRepository?: BlackboardWorkspaceRepository;
};

export class ApplicationEditorHost {
  readonly canvas: CanvasRuntime;
  readonly collaboration: CollaborationRuntime;
  readonly editor: CanvasEditorRuntime;
  readonly textRendering: TextRenderingRuntime;
  readonly canvasFont: CanvasFontRuntime;
  readonly canvasCursor: CanvasCursorRuntime;
  readonly textRenderingWorker: TextRenderingWorkerClient;
  readonly blackboard: BlackboardRuntime;
  readonly profile: EditorHostProfile;
  #disposed = false;

  constructor({
    canvasPersistence = false,
    keymapStorage = false,
    textRenderingStorage = false,
    canvasFontStorage = false,
    canvasCursorStorage = false,
    profile = EDITOR_HOST_PROFILE,
    initialSessions,
    blackboardRepository = new IndexedDbBlackboardRepository(),
  }: ApplicationEditorHostOptions = {}) {
    this.profile = profile;
    this.canvasFont = createCanvasFontRuntime({ storage: canvasFontStorage });
    this.canvasCursor = createCanvasCursorRuntime({ storage: canvasCursorStorage });
    this.collaboration = createCollaborationRuntime();
    this.textRendering = createTextRenderingRuntime({ storage: textRenderingStorage });
    this.textRenderingWorker = new TextRenderingWorkerClient(this.textRendering);
    this.blackboard = new BlackboardRuntime(blackboardRepository);
    this.canvas = createCanvasRuntime({
      persistence: canvasPersistence,
      selectionCommands: createSelectionCommandFactory({
        renderClipboardText: this.textRenderingWorker.render,
        getFontProfile: () => this.canvasFont.getSnapshot().profile,
      }),
      parseSessionSource: parseDocumentSessionSource,
      reportIntegrityIssues: (issues) =>
        this.collaboration.reportIntegrityIssues(issues),
      initialSessions,
    });
    this.editor = createCanvasEditorRuntime({
      state: { get: this.canvas.getState, subscribe: this.canvas.subscribe },
      history: this.canvas.commands.history,
      transactions: { run: this.canvas.commands.history.transact },
      onToolChange: this.canvas.commands.tools.set,
    });
    this.editor
      .registerExtension(createCanvasEditorExtension(this.editor.interactionPort))
      .registerExtension(createEditorCommandsExtension(this.canvas));
    if (keymapStorage) {
      const persistenceExtension: EditorExtension<CanvasState> = {
        id: "chardesk.editor-keymap-persistence",
        setup: () => connectEditorKeymapPersistence(this.editor.keymap, keymapStorage),
      };
      this.editor.registerExtension(persistenceExtension);
    }
    this.editor.start(this.editor.getState().tool);
  }

  dispose = async () => {
    if (this.#disposed) return;
    this.#disposed = true;
    this.editor.dispose();
    this.canvasFont.dispose();
    this.canvasCursor.dispose();
    this.textRenderingWorker.dispose();
    await this.collaboration.disconnect();
    this.canvas.dispose();
  };
}

export const createApplicationEditorHost = (options?: ApplicationEditorHostOptions) =>
  new ApplicationEditorHost(options);

let applicationHost: ApplicationEditorHost | null = null;

export const releaseApplicationEditorHost = async () => {
  const host = applicationHost;
  applicationHost = null;
  await host?.dispose();
};

export const getApplicationEditorHost = (
  profile: EditorHostProfile = EDITOR_HOST_PROFILE
): ApplicationEditorHost => {
  if (!applicationHost) {
    const storage = typeof localStorage === "undefined" ? false : localStorage;
    applicationHost = createApplicationEditorHost({
      profile,
      canvasPersistence: storage
        ? { storage, key: EDITOR_PERSISTENCE_KEY, migrateLegacy: true }
        : false,
      keymapStorage: storage,
      textRenderingStorage: storage,
      canvasFontStorage: storage,
      canvasCursorStorage: storage,
    });
  }
  return applicationHost;
};

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void releaseApplicationEditorHost();
  });
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
