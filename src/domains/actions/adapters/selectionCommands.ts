import type { RichTextCell, RichTextRow } from "@/domains/canvas/public";
import type {
  ClipboardCommandResult,
  SelectionCommandFactory,
} from "@/domains/canvas/public";
import { getStaticGridSelectionAreas } from "@/domains/selection/public";
import {
  buildClipboardPayload,
  buildStructuredClipboardPayload,
  buildStructuredTextClipboardPayload,
  hasClipboardSource,
  readClipboardPayload,
  type RenderClipboardText,
  selectStructuredClipboardNodes,
  writeClipboardPayload,
} from "./clipboardActions";
import { deliverExportClipboard, prepareSelectionPngExport } from "@/domains/export/public";
import { feedback } from "@/shared/services/effects";
import type { Point } from "@/shared/types";
import type {
  StructuredNode,
  StructuredNodeStyle,
  StructuredTextNode,
  StructuredTextStyleRange,
} from "@/domains/structured-content/public";
import {
  cloneStructuredNode,
  createStructuredNodeId,
  getNextStructuredOrder,
} from "@/domains/structured-content/public";
import { getCellOccupancy, splitGraphemes } from "@/shared/metrics";
import { cloneTextAttributes } from "@/shared/utils/ansi";
import { parsePlainTextCells } from "@/shared/utils/ansiText";
import { areJsonValuesEqual } from "@/shared/utils/equality";
import {
  getStructuredTextOffsetAtPoint,
  getStructuredTextSelectionRange,
  mergeStructuredTextStyle,
} from "@/domains/structured-content/public";
type SelectionCommandContext = Parameters<SelectionCommandFactory>[0];
type SelectionCommandState = ReturnType<SelectionCommandContext["getState"]>;

const resolveSelectionAreas = (state: SelectionCommandState) => {
  return getStaticGridSelectionAreas(
    state.interaction.staticGridSelection,
    state.contentSurface.reader
  );
};

const materializeRichRows = (rows: readonly RichTextRow[]): RichTextCell[] => {
  const cells: RichTextCell[] = [];
  for (const row of rows) {
    for (const span of row.spans) {
      let x = span.x;
      for (const char of splitGraphemes(span.text)) {
        cells.push({
          x,
          y: row.y,
          char,
          color: span.color,
          ...(span.bgColor ? { bgColor: span.bgColor } : {}),
          ...(span.attrs ? { attrs: { ...span.attrs } } : {}),
          ...(span.href ? { href: span.href } : {}),
        });
        x += getCellOccupancy(char);
      }
    }
  }
  return cells;
};

const applied = (changed: boolean): ClipboardCommandResult => ({
  status: "applied",
  changed,
});
const noop = (
  reason: Extract<ClipboardCommandResult, { status: "noop" }>["reason"]
): ClipboardCommandResult => ({ status: "noop", reason });
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
    description: description.length > 320
      ? `${description.slice(0, 317)}…`
      : description,
  });
};

const getClipboardTargetFingerprint = (
  state: SelectionCommandState
) =>
  JSON.stringify({
    address: state.interaction.address,
    canvasMode: state.canvasMode,
    selections: resolveSelectionAreas(state),
    textCursor: state.interaction.textCursor,
    staticGridSelection: state.interaction.staticGridSelection,
    staticGridEditMode: state.interaction.staticGridEditMode,
    structuredGridFocus: state.interaction.structuredGridFocus,
    selectedStructuredNodeIds: state.interaction.selectedStructuredNodeIds,
    selectedStructuredBoxId: state.interaction.selectedStructuredBoxId,
    selectedStructuredSplitHandle: state.interaction.selectedStructuredSplitHandle,
    editingStructuredTextNodeId: state.interaction.editingStructuredTextNodeId,
    structuredTextSelection: state.interaction.structuredTextSelection,
  });

const moveStructuredClipboardNode = (
  node: StructuredNode,
  dx: number,
  dy: number,
  order: number
): StructuredNode => {
  const cloned = cloneStructuredNode(node);
  if (cloned.type === "text") {
    return {
      ...cloned,
      id: createStructuredNodeId(),
      order,
      position: {
        x: cloned.position.x + dx,
        y: cloned.position.y + dy,
      },
    };
  }
  return {
    ...cloned,
    id: createStructuredNodeId(),
    order,
    start: {
      x: cloned.start.x + dx,
      y: cloned.start.y + dy,
    },
    end: {
      x: cloned.end.x + dx,
      y: cloned.end.y + dy,
    },
  };
};

const resolveStructuredPastePoint = (state: SelectionCommandState): Point => {
  return state.interaction.structuredGridFocus ?? state.interaction.textCursor ?? { x: 0, y: 0 };
};

const getActiveStructuredTextSelection = (state: SelectionCommandState) => {
  if (state.canvasMode !== "structured") return null;
  const range = getStructuredTextSelectionRange(state.interaction.structuredTextSelection);
  if (!range || !state.interaction.structuredTextSelection) return null;
  const node = state.structuredScene.find(
    (sceneNode) =>
      sceneNode.id === state.interaction.structuredTextSelection?.nodeId && sceneNode.type === "text"
  );
  if (!node || node.type !== "text") return null;
  return { node, range };
};

const getStructuredTextPasteTarget = (state: SelectionCommandState) => {
  const selection = getActiveStructuredTextSelection(state);
  if (selection) {
    return {
      node: selection.node,
      start: selection.range.start,
      end: selection.range.end,
    };
  }
  if (
    state.canvasMode !== "structured" ||
    !state.interaction.editingStructuredTextNodeId ||
    !state.interaction.textCursor
  ) {
    return null;
  }
  const node = state.structuredScene.find(
    (sceneNode) => sceneNode.id === state.interaction.editingStructuredTextNodeId && sceneNode.type === "text"
  );
  if (!node || node.type !== "text") return null;
  const offset = getStructuredTextOffsetAtPoint(node, state.interaction.textCursor);
  return { node, start: offset, end: offset };
};

const richCellsToPlainText = (cells: RichTextCell[] | null | undefined) => {
  if (!cells || cells.length === 0) return "";
  const rows = new Map<number, RichTextCell[]>();
  cells.forEach((cell) => {
    const row = rows.get(cell.y) ?? [];
    row.push(cell);
    rows.set(cell.y, row);
  });

  const sortedRows = [...rows.entries()].sort((a, b) => a[0] - b[0]);
  return sortedRows
    .map(([, row]) => {
      const sorted = [...row].sort((a, b) => a.x - b.x);
      let cursorX = sorted[0]?.x ?? 0;
      let text = "";
      sorted.forEach((cell) => {
        if (cell.x > cursorX) text += " ".repeat(cell.x - cursorX);
        text += cell.char;
        cursorX = cell.x + getCellOccupancy(cell.char);
      });
      return text.trimEnd();
    })
    .join("\n");
};

const isSameStructuredRangeStyle = (
  a: StructuredTextStyleRange["style"],
  b: StructuredTextStyleRange["style"]
) =>
  a.color === b.color &&
  a.bgColor === b.bgColor &&
  !!a.attrs?.bold === !!b.attrs?.bold &&
  !!a.attrs?.italic === !!b.attrs?.italic &&
  !!a.attrs?.underline === !!b.attrs?.underline &&
  !!a.attrs?.strike === !!b.attrs?.strike;

const pushStructuredTextStyleRange = (
  ranges: StructuredTextStyleRange[],
  range: StructuredTextStyleRange
) => {
  if (range.start >= range.end) return;
  const last = ranges[ranges.length - 1];
  if (last && last.end === range.start && isSameStructuredRangeStyle(last.style, range.style)) {
    last.end = range.end;
    return;
  }
  ranges.push(range);
};

const richCellsToStructuredText = (
  cells: RichTextCell[] | null | undefined,
  fallbackStyle: StructuredNodeStyle
): {
  text: string;
  style: StructuredNodeStyle;
  styleRanges?: StructuredTextStyleRange[];
} | null => {
  if (!cells || cells.length === 0) return null;
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  const maxY = Math.max(...cells.map((cell) => cell.y));
  const byRow = new Map<number, RichTextCell[]>();
  cells.forEach((cell) => {
    const row = byRow.get(cell.y) ?? [];
    row.push(cell);
    byRow.set(cell.y, row);
  });

  const lines: string[] = [];
  const styleRanges: StructuredTextStyleRange[] = [];
  let offset = 0;
  for (let y = minY; y <= maxY; y++) {
    const row = [...(byRow.get(y) ?? [])].sort((a, b) => a.x - b.x);
    let cursorX = minX;
    let line = "";
    row.forEach((cell) => {
      const gap = Math.max(0, cell.x - cursorX);
      if (gap > 0) {
        line += " ".repeat(gap);
        offset += gap;
        cursorX += gap;
      }
      const char = cell.char || " ";
      const charLength = splitGraphemes(char).length || 1;
      line += char;
      pushStructuredTextStyleRange(styleRanges, {
        start: offset,
        end: offset + charLength,
        style: {
          color: cell.color,
          ...(cell.bgColor ? { bgColor: cell.bgColor } : {}),
          ...(cloneTextAttributes(cell.attrs) ? { attrs: cloneTextAttributes(cell.attrs) } : {}),
        },
      });
      offset += charLength;
      cursorX += getCellOccupancy(char);
    });
    lines.push(line.trimEnd());
    if (y < maxY) offset += 1;
  }

  const text = lines.join("\n").replace(/\s+$/g, "");
  if (!text) return null;
  const textLength = splitGraphemes(text).length;
  const normalizedRanges = styleRanges
    .map((range) => ({
      ...range,
      end: Math.min(range.end, textLength),
    }))
    .filter((range) => range.start < range.end);
  return {
    text,
    style: fallbackStyle,
    styleRanges: normalizedRanges.length > 0 ? normalizedRanges : undefined,
  };
};

const createInheritedTextStyleRanges = (
  target: NonNullable<ReturnType<typeof getStructuredTextPasteTarget>>,
  text: string
): StructuredTextStyleRange[] | undefined => {
  const length = splitGraphemes(text).length;
  if (length === 0) return undefined;
  const offset = Math.max(0, Math.min(splitGraphemes(target.node.text).length - 1, target.start));
  return [
    {
      start: 0,
      end: length,
      style: mergeStructuredTextStyle(target.node.style, target.node.styleRanges, offset),
    },
  ];
};

const createPastedStructuredTextStyleRanges = (
  text: string,
  style: StructuredTextStyleRange["style"],
  styleRanges?: StructuredTextStyleRange[]
): StructuredTextStyleRange[] | undefined => {
  const length = splitGraphemes(text).length;
  if (length === 0) return undefined;
  return [{ start: 0, end: length, style }, ...(styleRanges ?? [])];
};

const createStructuredTextNodeFromPaste = (
  state: SelectionCommandState,
  text: string,
  style: StructuredNodeStyle,
  styleRanges?: StructuredTextStyleRange[]
): StructuredTextNode => ({
  id: createStructuredNodeId(),
  type: "text",
  order: getNextStructuredOrder(state.structuredScene),
  position: resolveStructuredPastePoint(state),
  text,
  style,
  ...(styleRanges ? { styleRanges } : {}),
});

export const createSelectionCommandFactory = ({
  renderClipboardText,
  getFontProfile,
}: {
  renderClipboardText: RenderClipboardText;
  getFontProfile?: () => import("@chardesk/fonts").CharDeskFontProfile;
}): SelectionCommandFactory => ({ getState: get, mutations }) => ({
  canCopyOrCut: () => {
    const state = get();
    const { textCursor } = state.interaction;
    const { canvasMode, structuredScene } = state;
    const selections = resolveSelectionAreas(state);
    if (canvasMode === "structured") {
      return !!getActiveStructuredTextSelection(state) || structuredScene.length > 0;
    }
    return hasClipboardSource(selections, textCursor);
  },

  copySelection: async (options) => {
    const state = get();
    const { textCursor, selectedStructuredNodeIds } = state.interaction;
    const { contentSurface, brushColor, canvasMode, structuredScene } = state;
    const grid = contentSurface.reader;
    const selections = resolveSelectionAreas(state);
    if (canvasMode === "structured") {
      const textSelection = getActiveStructuredTextSelection(state);
      const payload = textSelection
        ? buildStructuredTextClipboardPayload(
            textSelection.node,
            textSelection.range.start,
            textSelection.range.end
          )
        : buildStructuredClipboardPayload(structuredScene, selectedStructuredNodeIds);
      if (!payload) return noop("empty-source");
      const copied = await writeClipboardPayload(payload, {
        event: options?.event,
        withRich: true,
      });
      if (!copied) return failed("clipboard-failed");
      return applied(false);
    }
    const payload = buildClipboardPayload(
      grid,
      selections,
      textCursor,
      brushColor,
      options?.ansi ? "ansi" : "plain"
    );
    if (!payload) return noop("empty-source");
    const copied = await writeClipboardPayload(payload, {
      event: options?.event,
      withRich: !!options?.rich && !options?.ansi,
    });
    if (!copied) return failed("clipboard-failed");
    return applied(false);
  },

  cutSelection: async (options) => {
    const state = get();
    const { textCursor } = state.interaction;
    const { contentSurface, brushColor, canvasMode } = state;
    const grid = contentSurface.reader;
    const selections = resolveSelectionAreas(state);
    const targetFingerprint = getClipboardTargetFingerprint(state);
    if (canvasMode === "structured") {
      const textSelection = getActiveStructuredTextSelection(state);
      if (textSelection) {
        const payload = buildStructuredTextClipboardPayload(
          textSelection.node,
          textSelection.range.start,
          textSelection.range.end
        );
        if (!payload) return noop("empty-source");
        const copied = await writeClipboardPayload(payload, {
          event: options?.event,
          withRich: true,
        });
        if (!copied) return failed("clipboard-failed");

        const current = get();
        const currentSelection = getActiveStructuredTextSelection(current);
        const currentPayload = currentSelection
          ? buildStructuredTextClipboardPayload(
              currentSelection.node,
              currentSelection.range.start,
              currentSelection.range.end
            )
          : null;
        if (
          getClipboardTargetFingerprint(current) !== targetFingerprint ||
          !areJsonValuesEqual(currentPayload, payload)
        ) {
          return failed("stale-target");
        }
        mutations.replaceStructuredTextRange(
          textSelection.node.id,
          textSelection.range.start,
          textSelection.range.end,
          ""
        );
        return applied(true);
      }

      if (state.interaction.selectedStructuredNodeIds.length === 0) {
        return noop("empty-source");
      }
      const nodesToCut = selectStructuredClipboardNodes(
        state.structuredScene,
        state.interaction.selectedStructuredNodeIds
      );
      const payload = buildStructuredClipboardPayload(
        state.structuredScene,
        state.interaction.selectedStructuredNodeIds
      );
      if (!payload || nodesToCut.length === 0) return noop("empty-source");
      const copied = await writeClipboardPayload(payload, {
        event: options?.event,
        withRich: true,
      });
      if (!copied) return failed("clipboard-failed");

      const current = get();
      const currentNodesToCut = selectStructuredClipboardNodes(
        current.structuredScene,
        current.interaction.selectedStructuredNodeIds
      );
      const currentPayload = buildStructuredClipboardPayload(
        current.structuredScene,
        current.interaction.selectedStructuredNodeIds
      );
      if (
        getClipboardTargetFingerprint(current) !== targetFingerprint ||
        !areJsonValuesEqual(currentPayload, payload)
      ) {
        return failed("stale-target");
      }
      const cutIds = new Set(currentNodesToCut.map((node) => node.id));
      mutations.applyStructuredScene(
        current.structuredScene.filter((node) => !cutIds.has(node.id)),
        true
      );
      return applied(true);
    }

    const payload = buildClipboardPayload(grid, selections, textCursor, brushColor);
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
    ) {
      return failed("stale-target");
    }
    if (currentSelections.length > 0) {
      mutations.deleteSelection();
    } else if (current.interaction.textCursor) {
      mutations.erasePoints([current.interaction.textCursor]);
    }
    return applied(true);
  },

  pasteFromClipboard: async (options) => {
    const initialState = get();
    const { brushColor } = initialState;
    const targetFingerprint = getClipboardTargetFingerprint(initialState);
    const payload = await readClipboardPayload(
      options?.eventDataTransfer,
      brushColor,
      renderClipboardText
    );
    const state = get();
    if ("error" in payload && payload.error) return failed(payload.error);
    if (getClipboardTargetFingerprint(state) !== targetFingerprint) {
      return failed("stale-target");
    }
    const { canvasMode } = state;
    const completePaste = () => {
      notifyPasteRenderDiagnostics(payload.diagnostics);
      return applied(true);
    };

    if (canvasMode === "structured") {
      const renderedCells = payload.richCells ??
        ("richRows" in payload && payload.richRows
          ? materializeRichRows(payload.richRows)
          : null);
      const textTarget = getStructuredTextPasteTarget(state);
      if (textTarget) {
        const richText = richCellsToStructuredText(renderedCells, {
          color: brushColor,
        });
        const text =
          payload.structuredText?.text ??
          richText?.text ??
          payload.plainText ??
          richCellsToPlainText(payload.structured?.surfaceCells);
        if (!text) return noop("empty-clipboard");
        const normalizedText = text.replace(/\r\n?/g, "\n");
        mutations.replaceStructuredTextRange(
          textTarget.node.id,
          textTarget.start,
          textTarget.end,
          normalizedText,
          payload.structuredText
            ? createPastedStructuredTextStyleRanges(
                normalizedText,
                payload.structuredText.style,
                payload.structuredText.styleRanges
              )
            : (richText?.styleRanges ?? createInheritedTextStyleRanges(textTarget, normalizedText))
        );
        return completePaste();
      }
      const structured = payload.structured;
      if (structured) {
        const pastePoint = resolveStructuredPastePoint(state);
        const dx = pastePoint.x - structured.bounds.x;
        const dy = pastePoint.y - structured.bounds.y;
        const maxOrder = state.structuredScene.reduce((max, node) => Math.max(max, node.order), 0);
        const pastedNodes = structured.structuredNodes
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((node, index) => moveStructuredClipboardNode(node, dx, dy, maxOrder + index + 1));
        mutations.applyStructuredScene(
          [...state.structuredScene, ...pastedNodes],
          true
        );
        mutations.updateInteraction({
          selectedStructuredNodeIds: pastedNodes.map((node) => node.id),
          selectedStructuredBoxId:
            pastedNodes.length === 1 && pastedNodes[0].type === "box"
              ? pastedNodes[0].id
              : null,
          structuredGridFocus: null,
          textCursor: null,
          editingStructuredTextNodeId: null,
          structuredTextSelection: null,
        });
        return completePaste();
      }

      const richText = richCellsToStructuredText(renderedCells, {
        color: brushColor,
      });
      const pastedText = payload.structuredText
        ? {
            text: payload.structuredText.text,
            style: payload.structuredText.style,
            styleRanges: payload.structuredText.styleRanges,
          }
        : (richText ??
          (payload.plainText
            ? {
                text: payload.plainText.replace(/\r\n?/g, "\n"),
                style: { color: brushColor },
              }
            : null));
      if (!pastedText?.text) return noop("empty-clipboard");
      const nextNode = createStructuredTextNodeFromPaste(
        state,
        pastedText.text,
        pastedText.style,
        pastedText.styleRanges
      );
      mutations.applyStructuredScene([...state.structuredScene, nextNode], true);
      mutations.updateInteraction({
        selectedStructuredNodeIds: [nextNode.id],
        selectedStructuredBoxId: null,
        selectedStructuredSplitHandle: null,
        structuredContextPoint: null,
        structuredGridFocus: null,
        textCursor: null,
        editingStructuredTextNodeId: null,
        structuredTextSelection: null,
      });
      return completePaste();
    }

    if ("richRows" in payload && payload.richRows) {
      mutations.pasteRichRows(payload.richRows, undefined, {
        selectResult: canvasMode === "freeform",
      });
      return completePaste();
    }

    if (payload.richCells) {
      mutations.pasteRichData(payload.richCells, undefined, {
        selectResult: canvasMode === "freeform",
      });
      return completePaste();
    }

    if (payload.plainText) {
      const cells = parsePlainTextCells(payload.plainText, brushColor);
      if (cells.length === 0) return noop("empty-clipboard");
      mutations.pasteRichData(cells, undefined, {
        selectResult: canvasMode === "freeform",
      });
      return completePaste();
    }
    return noop("empty-clipboard");
  },

  copySelectionAsPng: async (withGrid) => {
    const state = get();
    const grid = state.contentSurface.reader;
    const selections = resolveSelectionAreas(state);
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
      const prepared = prepareSelectionPngExport(grid, selections, withGrid, true, getFontProfile?.());
      if (!prepared.ok) {
        showFailure(prepared.error.code);
        return;
      }
      const delivered = await deliverExportClipboard(prepared.value);
      if (!delivered.ok) {
        showFailure(delivered.error.code);
        return;
      }
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
