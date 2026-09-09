import type { ClipboardCommandResult, SelectionCommandFactory } from "@/domains/canvas/public";
import { deliverExportClipboard, prepareSelectionPngExport } from "@/domains/export/public";
import { getStaticGridSelectionAreas } from "@/domains/selection/public";
import { feedback } from "@/shared/services/effects";
import { parsePlainTextCells } from "@/shared/utils/ansiText";
import { areJsonValuesEqual } from "@/shared/utils/equality";
import type { CanvasArtifactPalette } from "@/shared/metrics";
import {
  buildClipboardPayload,
  hasClipboardSource,
  readClipboardPayload,
  type RenderClipboardText,
  writeClipboardPayload,
} from "./clipboardActions";

type SelectionCommandContext = Parameters<SelectionCommandFactory>[0];
type SelectionCommandState = ReturnType<SelectionCommandContext["getState"]>;

const resolveSelectionAreas = (state: SelectionCommandState) =>
  getStaticGridSelectionAreas(
    state.interaction.staticGridSelection,
    state.contentSurface.reader
  );

const applied = (changed: boolean): ClipboardCommandResult => ({ status: "applied", changed });
const noop = (
  reason: Extract<ClipboardCommandResult, { status: "noop" }>["reason"]
): ClipboardCommandResult => ({ status: "noop", reason });
const failed = (
  reason: Extract<ClipboardCommandResult, { status: "failed" }>["reason"]
): ClipboardCommandResult => {
  if (reason === "stale-target") {
    feedback.warning("Clipboard action canceled", {
      description: "The active canvas or selection changed before the clipboard operation completed.",
    });
  } else {
    feedback.error("Clipboard operation failed", {
      description: "Could not access the system clipboard.",
    });
  }
  return { status: "failed", reason };
};

const notifyPasteRenderDiagnostics = (
  diagnostics: readonly { code: string; message: string }[]
) => {
  const unique = [...new Map(
    diagnostics.map((diagnostic) => [
      `${diagnostic.code}\u0000${diagnostic.message}`,
      diagnostic.message,
    ])
  ).values()];
  if (unique.length === 0) return;
  const remaining = unique.length - 1;
  const suffix = remaining > 0
    ? ` ${remaining} more rendering ${remaining === 1 ? "issue was" : "issues were"} detected.`
    : "";
  const description = `${unique[0]}${suffix}`;
  feedback.warning("Pasted with limited rendering", {
    id: "paste-render-diagnostics",
    description: description.length > 320 ? `${description.slice(0, 317)}…` : description,
  });
};

const getClipboardTargetFingerprint = (state: SelectionCommandState) =>
  JSON.stringify({
    address: state.interaction.address,
    canvasMode: state.canvasMode,
    selections: resolveSelectionAreas(state),
    textCursor: state.interaction.textCursor,
    staticGridSelection: state.interaction.staticGridSelection,
    staticGridEditMode: state.interaction.staticGridEditMode,
  });

export const createSelectionCommandFactory = ({
  renderClipboardText,
  getFontProfile,
  getArtifactPalette,
}: {
  renderClipboardText: RenderClipboardText;
  getFontProfile?: () => import("@chardesk/fonts").CharDeskFontProfile;
  getArtifactPalette?: () => CanvasArtifactPalette;
}): SelectionCommandFactory => ({ getState: get, mutations }) => ({
  canCopyOrCut: () => {
    const state = get();
    return hasClipboardSource(resolveSelectionAreas(state), state.interaction.textCursor);
  },

  copySelection: async (options) => {
    const state = get();
    const payload = buildClipboardPayload(
      state.contentSurface.reader,
      resolveSelectionAreas(state),
      state.interaction.textCursor,
      state.brushColor,
      options?.ansi ? "ansi" : "plain"
    );
    if (!payload) return noop("empty-source");
    const copied = await writeClipboardPayload(payload, {
      event: options?.event,
      withRich: !!options?.rich && !options?.ansi,
    });
    return copied ? applied(false) : failed("clipboard-failed");
  },

  cutSelection: async (options) => {
    const state = get();
    const selections = resolveSelectionAreas(state);
    const targetFingerprint = getClipboardTargetFingerprint(state);
    const payload = buildClipboardPayload(
      state.contentSurface.reader,
      selections,
      state.interaction.textCursor,
      state.brushColor
    );
    if (!payload) return noop("empty-source");
    const copied = await writeClipboardPayload(payload, {
      event: options?.event,
      withRich: !!options?.event,
    });
    if (!copied) return failed("clipboard-failed");

    const current = get();
    const currentSelections = resolveSelectionAreas(current);
    const currentPayload = buildClipboardPayload(
      current.contentSurface.reader,
      currentSelections,
      current.interaction.textCursor,
      current.brushColor
    );
    if (
      getClipboardTargetFingerprint(current) !== targetFingerprint ||
      !areJsonValuesEqual(currentPayload, payload)
    ) return failed("stale-target");
    if (currentSelections.length > 0) mutations.deleteSelection();
    else if (current.interaction.textCursor) mutations.erasePoints([current.interaction.textCursor]);
    return applied(true);
  },

  pasteFromClipboard: async (options) => {
    const initialState = get();
    const targetFingerprint = getClipboardTargetFingerprint(initialState);
    const payload = await readClipboardPayload(
      options?.eventDataTransfer,
      initialState.brushColor,
      renderClipboardText
    );
    const state = get();
    if ("error" in payload && payload.error) return failed(payload.error);
    if (getClipboardTargetFingerprint(state) !== targetFingerprint) return failed("stale-target");
    const completePaste = () => {
      notifyPasteRenderDiagnostics(payload.diagnostics);
      return applied(true);
    };
    const selectResult = state.canvasMode === "freeform";
    if ("richRows" in payload && payload.richRows) {
      mutations.pasteRichRows(payload.richRows, undefined, { selectResult });
      return completePaste();
    }
    if (payload.richCells) {
      mutations.pasteRichData(payload.richCells, undefined, { selectResult });
      return completePaste();
    }
    if (payload.plainText) {
      const cells = parsePlainTextCells(payload.plainText, state.brushColor);
      if (cells.length === 0) return noop("empty-clipboard");
      mutations.pasteRichData(cells, undefined, { selectResult });
      return completePaste();
    }
    return noop("empty-clipboard");
  },

  copySelectionAsPng: async (withGrid) => {
    const state = get();
    const selections = resolveSelectionAreas(state);
    if (selections.length === 0) return;
    const showFailure = (code?: string) => {
      feedback.error("Snapshot Failed", {
        description: code === "image-too-large"
          ? "Selection is too large to copy as one PNG. Reduce the selected area."
          : "Could not write image to clipboard.",
      });
    };
    try {
      const prepared = prepareSelectionPngExport(
        state.contentSurface.reader,
        selections,
        withGrid,
        true,
        getFontProfile?.(),
        state.canvasMode === "freeform" ? getArtifactPalette?.() : undefined
      );
      if (!prepared.ok) return showFailure(prepared.error.code);
      const delivered = await deliverExportClipboard(prepared.value);
      if (!delivered.ok) return showFailure(delivered.error.code);
      feedback.success("Snapshot Copied", {
        description: withGrid
          ? "Image with grid lines is ready to paste."
          : "Image without grid lines is ready to paste.",
      });
    } catch {
      showFailure();
    }
  },
});
