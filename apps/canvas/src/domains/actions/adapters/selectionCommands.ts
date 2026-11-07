import {
  createClipboardCommands,
  ClipboardRequestScope,
} from "@chardesk/editor-core/clipboard/commands";
import type { ClipboardCommandResult, SelectionCommandFactory } from "@/domains/canvas/public";
import { deliverExportClipboard, prepareSelectionPngExport } from "@/domains/export/public";
import {
  getStaticGridCursor,
  getStaticGridSelection,
  getGridSelectionRanges,
} from "@/domains/selection/public";
import { feedback } from "@/shared/services/effects";
import { parsePlainTextCells } from "@/shared/utils/ansiText";
import type { CanvasArtifactPalette } from "@/shared/canvas-appearance/artifact-style";
import type { ResolvedCanvasTheme } from "@/shared/canvas-appearance/runtime";
import {
  hasClipboardSource,
  readClipboardPayload,
  type RenderClipboardText,
  writeClipboardPayload,
} from "./clipboardActions";

type SelectionCommandContext = Parameters<SelectionCommandFactory>[0];
type SelectionCommandState = ReturnType<SelectionCommandContext["getState"]>;

const resolveSelectionRanges = (state: SelectionCommandState) =>
  getGridSelectionRanges(getStaticGridSelection(state.interaction.staticGrid));

const resolveTextCursor = (state: SelectionCommandState) =>
  getStaticGridCursor(state.interaction.staticGrid);

const failed = (
  reason: Extract<ClipboardCommandResult, { status: "failed" }>["reason"]
): ClipboardCommandResult => {
  if (reason === "stale-target") {
    feedback.warning("Clipboard action canceled", {
      description:
        "The active canvas or selection changed before the clipboard operation completed.",
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
  const unique = [
    ...new Map(
      diagnostics.map((diagnostic) => [
        `${diagnostic.code}\u0000${diagnostic.message}`,
        diagnostic.message,
      ])
    ).values(),
  ];
  if (unique.length === 0) return;
  const remaining = unique.length - 1;
  const suffix =
    remaining > 0
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
    selections: resolveSelectionRanges(state),
    staticGrid: state.interaction.staticGrid,
  });

export const createSelectionCommandFactory =
  ({
    renderClipboardText,
    getFontProfile,
    getArtifactPalette,
    getResolvedTheme,
    getMarkdownAutoAnchorsEnabled,
  }: {
    renderClipboardText: RenderClipboardText;
    getFontProfile?: () => import("@chardesk/fonts").CharDeskFontProfile;
    getArtifactPalette?: () => CanvasArtifactPalette;
    getResolvedTheme?: () => ResolvedCanvasTheme;
    getMarkdownAutoAnchorsEnabled?: () => boolean;
  }): SelectionCommandFactory =>
  ({ getState: get, mutations, isActive }) => {
    const requests = new ClipboardRequestScope();
    const createFlow = (request?: {
      event?: ClipboardEvent;
      eventDataTransfer?: DataTransfer;
      rich?: boolean;
      ansi?: boolean;
    }) =>
      createClipboardCommands({
        isActive,
        requests,
        getState: () => {
          const state = get();
          return {
            target: getClipboardTargetFingerprint(state),
            reader: state.contentSurface.reader,
            selections: resolveSelectionRanges(state),
            cursor: resolveTextCursor(state),
            foreground: state.brushColor,
            selectResult: state.canvasMode === "freeform",
          };
        },
        mutations: {
          ...mutations,
          pastePlainText: (text, color, selectResult) => {
            const cells = parsePlainTextCells(text, color);
            if (!cells.length) return false;
            mutations.pasteRichData(cells, undefined, { selectResult });
            return true;
          },
        },
        port: {
          write: async (data, flags) => ({
            status: (await writeClipboardPayload(data, {
              event: request?.event,
              withRich: flags.rich && !flags.ansi,
            }))
              ? "written"
              : "failed",
          }),
          read: (state) =>
            readClipboardPayload(
              request?.eventDataTransfer,
              state.foreground,
              renderClipboardText,
              { themeMode: getResolvedTheme?.() ?? "light" }
            ),
        },
        onFailure: (reason) => {
          failed(reason);
        },
        onPasteDiagnostics: notifyPasteRenderDiagnostics,
        autoAnchors: getMarkdownAutoAnchorsEnabled,
      });
    return {
      canCopyOrCut: () => {
        const state = get();
        return hasClipboardSource(resolveSelectionRanges(state), resolveTextCursor(state));
      },
      copySelection: (request) => createFlow(request).copy(request),
      cutSelection: (request) => createFlow(request).cut(),
      pasteFromClipboard: (request) => createFlow(request).paste(),

      copySelectionAsPng: async (withGrid) => {
        const state = get();
        const selections = resolveSelectionRanges(state);
        if (selections.length === 0) return;
        const showFailure = (code?: string) => {
          feedback.error("Snapshot Failed", {
            description:
              code === "image-too-large"
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
    };
  };
