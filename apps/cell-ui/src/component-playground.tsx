import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Box, Root, ScrollArea, Text, type WidgetCommand } from "@chardesk/cell-ui";
import { DEFAULT_CELL_UI_METRICS, type CellSurfaceProps } from "@chardesk/cell-ui/browser";
import { GallerySurface } from "./appearance";
import {
  MIN_SPLIT_COLUMNS,
  PLAYGROUND_ROWS,
  columnsForPixelWidth,
  resolveComponentPlaygroundLayout,
} from "./component-playground-layout";

const defaultComponentRecipe: NonNullable<CellSurfaceProps["recipe"]> = {};

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
  preview: ReactNode;
  controls?: ReactNode;
  previewMinColumns: number;
  controlsColumns?: number;
  overlayRows?: number;
  rows?: number;
}>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [totalColumns, setTotalColumns] = useState(MIN_SPLIT_COLUMNS);
  const measuredColumnsRef = useRef(MIN_SPLIT_COLUMNS);
  const [previewScroll, setPreviewScroll] = useState({ x: 0, y: 0 });
  const [controlsScroll, setControlsScroll] = useState({ x: 0, y: 0 });
  const layout = resolveComponentPlaygroundLayout(
    totalColumns,
    previewMinColumns,
    controlsColumns ?? 1,
    controls !== undefined,
    rows,
  );
  const previewScrollId = `${id}-preview-scroll`;
  const controlsScrollId = `${id}-controls-scroll`;
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      if (host.clientWidth <= 0) return;
      const next = columnsForPixelWidth(
        host.clientWidth,
        DEFAULT_CELL_UI_METRICS.cellWidth,
      );
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
  }, []);
  const dispatch = (command: WidgetCommand) => {
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

  return <div ref={hostRef} className="component-playground">
    <GallerySurface
      className="component-playground__surface"
      viewport={layout.viewport}
      overlayViewport={{
        width: layout.viewport.width,
        height: layout.viewport.height + overlayRows,
      }}
      focusedId={focusedId}
      onCommand={dispatch}
      label={label}
      probeId={probeId}
      recipe={defaultComponentRecipe}
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
            {preview}
            <Box id={`${id}-preview-right`} variant="ghost" style={{ flexGrow: 1 }} />
          </Box>
          <Box id={`${id}-preview-bottom`} variant="ghost" style={{ flexGrow: 1 }} />
        </Box>
      </ScrollArea>
      {controls === undefined ? null : layout.stacked
        ? <Text id={`${id}-divider`} textStyle={{ dim: true }}>{"─".repeat(layout.viewport.width)}</Text>
        : <Box id={`${id}-divider`} variant="ghost" style={{ width: 1, height: rows }}>
            {Array.from({ length: rows }, (_, row) => (
              <Text id={`${id}-divider-${row}`} key={row} textStyle={{ dim: true }}>│</Text>
            ))}
          </Box>}
      {controls === undefined ? null : <ScrollArea
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
              width: layout.controlsInset + (controlsColumns ?? 1),
              paddingLeft: layout.controlsInset,
            }}
          >
            {controls}
          </Box>
          <Box id={`${id}-controls-after`} variant="ghost" style={{ flexGrow: 1 }} />
        </Box>
      </ScrollArea>}
      </Root>
    </GallerySurface>
  </div>;
}
