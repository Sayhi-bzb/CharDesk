import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Box, Root, ScrollArea, Text, type CellUiPresentation, type WidgetCommand } from "@chardesk/cell-ui";
import { CELL_SURFACE_GUARD_CELLS, DEFAULT_CELL_UI_METRICS, useCellSelectState, type CellSelectState, type CellSurfaceProps } from "@chardesk/cell-ui/browser";
import { GallerySurface } from "./appearance";
import { renderGallerySelect } from "./gallery-component-recipes";
import { useDocumentScene } from "./document-scene";
import {
  MIN_SPLIT_COLUMNS,
  PLAYGROUND_CONTROL_COLUMNS,
  PLAYGROUND_ROWS,
  columnsForPixelWidth,
  resolveComponentPlaygroundLayout,
} from "./component-playground-layout";

const defaultComponentRecipe: NonNullable<CellSurfaceProps["recipe"]> = {};
const presentationSelectWidth = 15;

type ScopedControl = Readonly<{
  presentation: CellUiPresentation;
  node: ReactNode;
  select?: CellSelectState;
}>;
type PlaygroundControl = ReactNode | ScopedControl;
type PresentationValue<T> = T | ((presentation: CellUiPresentation) => T);
const isScopedControl = (control: PlaygroundControl): control is ScopedControl =>
  typeof control === "object" && control !== null && "presentation" in control && "node" in control;

export const richOnly = (node: ReactNode, select?: CellSelectState): ScopedControl => ({
  presentation: "rich", node, select,
});

export function ComponentPlayground({
  id,
  label,
  probeId,
  focusedId,
  onCommand,
  preview,
  controls,
  previewMinColumns,
  controlsColumns,
  overlayRows = 0,
  rows = PLAYGROUND_ROWS,
}: Readonly<{
  id: string;
  label: string;
  probeId: string;
  focusedId: string | null;
  onCommand: (command: WidgetCommand) => void;
  preview: PresentationValue<ReactNode>;
  controls?: readonly PlaygroundControl[];
  previewMinColumns: number;
  controlsColumns?: number;
  overlayRows?: PresentationValue<number>;
  rows?: number;
}>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const documentScene = useDocumentScene();
  const [totalColumns, setTotalColumns] = useState(MIN_SPLIT_COLUMNS);
  const measuredColumnsRef = useRef(MIN_SPLIT_COLUMNS);
  const [previewScroll, setPreviewScroll] = useState({ x: 0, y: 0 });
  const [controlsScroll, setControlsScroll] = useState({ x: 0, y: 0 });
  const [presentation, setPresentation] = useState<CellUiPresentation>("rich");
  const [localFocusedId, setLocalFocusedId] = useState<string | null>(null);
  const presentationRichId = `${id}-presentation-rich`;
  const presentationTextId = `${id}-presentation-text`;
  const presentationItems = useMemo(() => [
    { id: presentationRichId, label: "Rich" },
    { id: presentationTextId, label: "Text" },
  ], [id]);
  const presentationSelect = useCellSelectState(`${id}-presentation`, presentationItems, {
    defaultSelectedId: presentationRichId,
    onSelectionChange: (itemId) => {
      const next = itemId === presentationTextId ? "text" : "rich";
      controls?.forEach((control) => {
        if (isScopedControl(control) && control.presentation !== next && control.select?.open) {
          control.select.dispatch({ type: "dismiss", targetId: control.select.contentId });
        }
      });
      setPresentation(next);
    },
  });
  const effectiveFocusedId = presentationSelect.open
    ? presentationSelect.focusedId
    : localFocusedId ?? focusedId;
  const controlColumns = Math.max(controlsColumns ?? 1, PLAYGROUND_CONTROL_COLUMNS);
  const resolvedOverlayRows = typeof overlayRows === "function" ? overlayRows(presentation) : overlayRows;
  const resolvedPreview = typeof preview === "function" ? preview(presentation) : preview;
  const layout = resolveComponentPlaygroundLayout(
    documentScene?.width ?? totalColumns,
    previewMinColumns,
    controlColumns,
    true,
    rows,
  );
  const previewScrollId = `${id}-preview-scroll`;
  const controlsScrollId = `${id}-controls-scroll`;
  useLayoutEffect(() => {
    if (documentScene) return;
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      if (host.clientWidth <= 0) return;
      const next = Math.max(1, columnsForPixelWidth(
        host.clientWidth,
        DEFAULT_CELL_UI_METRICS.cellWidth,
      ) - 2 * CELL_SURFACE_GUARD_CELLS);
      if (measuredColumnsRef.current === next) return;
      measuredColumnsRef.current = next;
      setTotalColumns(next);
      setPreviewScroll({ x: 0, y: 0 });
      setControlsScroll({ x: 0, y: 0 });
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [documentScene]);
  const dispatch = (command: WidgetCommand) => {
    presentationSelect.dispatch(command);
    if (command.type === "focus") {
      const isPresentationFocus = command.targetId === presentationSelect.triggerId
        || presentationSelect.items.some(({ id: itemId }) => itemId === command.targetId);
      setLocalFocusedId(isPresentationFocus ? command.targetId : null);
    }
    if (command.type === "activate" && presentationSelect.items.some(({ id: itemId }) => itemId === command.targetId)) {
      setLocalFocusedId(presentationSelect.triggerId);
    }
    if (command.type === "dismiss" && command.targetId === presentationSelect.contentId) {
      setLocalFocusedId(presentationSelect.triggerId);
    }
    if (command.type === "scroll" && command.targetId === previewScrollId) {
      setPreviewScroll({ x: command.scrollX, y: command.scrollY });
    }
    if (command.type === "scroll" && command.targetId === controlsScrollId) {
      setControlsScroll({ x: command.scrollX, y: command.scrollY });
    }
    if (command.type === "focus") {
      for (const reveal of command.reveals ?? (command.reveal ? [command.reveal] : [])) {
        if (reveal.targetId === previewScrollId) setPreviewScroll({ x: reveal.scrollX, y: reveal.scrollY });
        if (reveal.targetId === controlsScrollId) setControlsScroll({ x: reveal.scrollX, y: reveal.scrollY });
      }
    }
    onCommand(command);
  };

  const surface = <GallerySurface
      className="component-playground__surface"
      viewport={layout.viewport}
      overlayViewport={{
        width: layout.viewport.width,
        height: layout.viewport.height + Math.max(resolvedOverlayRows, presentationSelect.open ? 4 : 0),
      }}
      focusedId={effectiveFocusedId}
      onCommand={dispatch}
      label={label}
      probeId={probeId}
      recipe={defaultComponentRecipe}
      presentation={presentation}
    >
      <Root id={`${id}-root`} style={{ direction: layout.stacked ? "column" : "row" }}>
      <ScrollArea
        id={previewScrollId}
        variant="ghost"
        scrollX={previewScroll.x}
        scrollY={previewScroll.y}
        style={{ width: layout.previewColumns, height: rows }}
      >
        <Box id={`${id}-preview`} variant="ghost" style={{ minHeight: rows }}>
          <Box id={`${id}-preview-top`} variant="ghost" style={{ flexGrow: 1 }} />
          <Box id={`${id}-preview-row`} variant="ghost" style={{ direction: "row" }}>
            <Box id={`${id}-preview-left`} variant="ghost" style={{ flexGrow: 1 }} />
            {resolvedPreview}
            <Box id={`${id}-preview-right`} variant="ghost" style={{ flexGrow: 1 }} />
          </Box>
          <Box id={`${id}-preview-bottom`} variant="ghost" style={{ flexGrow: 1 }} />
        </Box>
      </ScrollArea>
      {layout.stacked
        ? <Text id={`${id}-divider`} textStyle={{ dim: true }}>{"─".repeat(layout.viewport.width)}</Text>
        : <Box id={`${id}-divider`} variant="ghost" style={{ width: 1, height: rows }}>
            {Array.from({ length: rows }, (_, row) => (
              <Text id={`${id}-divider-${row}`} key={row} textStyle={{ dim: true }}>│</Text>
            ))}
          </Box>}
      <ScrollArea
        id={controlsScrollId}
        variant="ghost"
        scrollX={controlsScroll.x}
        scrollY={controlsScroll.y}
        style={{ width: layout.propsColumns, height: rows }}
      >
        <Box
          id={`${id}-controls-alignment`}
          variant="ghost"
          style={{
            width: layout.controlsExtentColumns,
            minHeight: layout.controlsMinRows,
          }}
        >
          <Box id={`${id}-controls-before`} variant="ghost" style={{ flexGrow: 1 }} />
          <Box
            id={`${id}-controls`}
            variant="ghost"
            style={{
              width: layout.controlsInset + controlColumns,
              paddingLeft: layout.controlsInset,
            }}
          >
            <Box id={`${id}-presentation-control`} variant="ghost">
              <Text id={`${id}-presentation-label`}>presentation</Text>
              {renderGallerySelect({
                label: "presentation",
                select: presentationSelect,
                focusedId: effectiveFocusedId,
                width: presentationSelectWidth,
                showLabel: false,
              })}
            </Box>
            {controls?.map((control) => isScopedControl(control)
              ? control.presentation === presentation ? control.node : null
              : control)}
          </Box>
          <Box id={`${id}-controls-after`} variant="ghost" style={{ flexGrow: 1 }} />
        </Box>
      </ScrollArea>
      </Root>
    </GallerySurface>;
  return documentScene ? surface : <div ref={hostRef} className="component-playground">{surface}</div>;
}
