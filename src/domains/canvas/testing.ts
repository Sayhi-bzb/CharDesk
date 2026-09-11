export * from "./public";
import type { CanvasSessionSourceParser } from "./state/sessionImportPort";
import type { SelectionCommandFactory } from "./state/selectionCommandPort";
import { CanvasDocumentRegistry } from "./state/CanvasDocumentRegistry";
import type { CanvasStore } from "./state/editorStore";
import { CanvasRuntime } from "./runtime";
import type {
  CanvasContentSurfaceState,
  CanvasState,
} from "./state/interfaces";
import { createCanvasContentSurface } from "./state/helpers/gridHelpers";
import { createGridSurfaceReader } from "./cell-plane/model";
import type { GridCell } from "@/shared/types";
import {
  updateCanvasInteraction,
  type CanvasInteractionSnapshot,
  type CanvasInteractionUpdate,
} from "./state/canvasInteractionState";

type CanvasTestStatePatch = Partial<Omit<CanvasState, "interaction">> &
  CanvasInteractionUpdate & {
    interaction?: CanvasInteractionSnapshot;
    offset?: { x: number; y: number };
    zoom?: number;
  };

export let defaultCanvasDocuments: CanvasDocumentRegistry;
export let useEditorStore: CanvasStore;
export let canvasCommands: CanvasRuntime["commands"];
export let testingCanvasRuntime: CanvasRuntime;

export const initializeCanvasTesting = ({
  selectionCommands,
  parseSessionSource,
}: {
  selectionCommands: SelectionCommandFactory;
  parseSessionSource: CanvasSessionSourceParser;
}) => {
  if (testingCanvasRuntime) return testingCanvasRuntime;
  defaultCanvasDocuments = new CanvasDocumentRegistry();
  testingCanvasRuntime = new CanvasRuntime({
    documents: defaultCanvasDocuments,
    selectionCommands,
    parseSessionSource,
    persistence: false,
  });
  useEditorStore = testingCanvasRuntime.store;
  canvasCommands = testingCanvasRuntime.commands;
  return testingCanvasRuntime;
};

export const getCanvasState = () => useEditorStore.getState();

/** Test fixture adapter; production state has no flat interaction or viewport fields. */
export const setCanvasTestState = (patch: CanvasTestStatePatch) => {
  const {
    interaction,
    offset,
    zoom,
    staticGrid,
    hoveredGrid,
    scratchLayer,
    canvasColorPickerTarget,
    ...statePatch
  } = patch;
  const interactionUpdate: CanvasInteractionUpdate = {
    ...(staticGrid !== undefined ? { staticGrid } : {}),
    ...(hoveredGrid !== undefined ? { hoveredGrid } : {}),
    ...(scratchLayer !== undefined ? { scratchLayer } : {}),
    ...(canvasColorPickerTarget !== undefined ? { canvasColorPickerTarget } : {}),
  };
  const current = useEditorStore.getState();
  useEditorStore.setState({
    ...statePatch,
    interaction: updateCanvasInteraction(
      interaction ?? current.interaction,
      interactionUpdate
    ),
  });
  if (offset !== undefined || zoom !== undefined) {
    testingCanvasRuntime.viewport.setViewport((viewport) => ({
      offset: offset ?? viewport.offset,
      zoom: zoom ?? viewport.zoom,
    }));
  }
};
export class TestCanvasContentSurface implements CanvasContentSurfaceState {
  readonly reader;
  readonly revision;

  constructor(entries?: readonly (readonly [string, GridCell])[] | null) {
    const surface = createCanvasContentSurface(
      createGridSurfaceReader(new Map(entries ?? []))
    );
    this.reader = surface.reader;
    this.revision = surface.revision;
  }
}
export const applyFreeformSnapshotToYMaps = (
  entries: Parameters<CanvasDocumentRegistry["replaceCellPage"]>[1]
) => canvasCommands.grid.replace(entries);
export const undoCanvas = () => canvasCommands.history.undo();
export const redoCanvas = () => canvasCommands.history.redo();
export const replaceCanvasGrid = (
  entries: Parameters<CanvasDocumentRegistry["replaceCellPage"]>[1]
) => canvasCommands.grid.replace(entries);
