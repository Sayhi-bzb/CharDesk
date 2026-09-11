import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Box, Root, ScrollArea, Text, type WidgetCommand } from "@chardesk/cell-ui";
import { DEFAULT_CELL_UI_METRICS } from "@chardesk/cell-ui/browser";
import { GallerySurface } from "./appearance";
import {
  MIN_SPLIT_COLUMNS,
  PLAYGROUND_ROWS,
  columnsForPixelWidth,
  resolveComponentPlaygroundLayout,
} from "./component-playground-layout";

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
}: Readonly<{
  id: string;
  label: string;
  probeId: string;
  focusedId: string | null;
  onCommand: (command: WidgetCommand) => void;
  preview: ReactNode;
  controls: ReactNode;
  previewMinColumns: number;
  controlsColumns: number;
  overlayRows?: number;
}>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [totalColumns, setTotalColumns] = useState(MIN_SPLIT_COLUMNS);
  const measuredColumnsRef = useRef(MIN_SPLIT_COLUMNS);
  const [controlsScroll, setControlsScroll] = useState({ x: 0, y: 0 });
  const layout = resolveComponentPlaygroundLayout(
    totalColumns,
    previewMinColumns,
    controlsColumns,
  );
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
    if (command.type === "scroll" && command.targetId === controlsScrollId) {
      setControlsScroll({ x: command.scrollX, y: command.scrollY });
    }
    if (command.type === "focus" && command.reveal?.targetId === controlsScrollId) {
      setControlsScroll({ x: command.reveal.scrollX, y: command.reveal.scrollY });
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
    >
      <Root id={`${id}-root`} style={{ direction: layout.stacked ? "column" : "row" }}>
      <Box
        id={`${id}-preview`}
        style={{ width: layout.previewColumns, height: PLAYGROUND_ROWS }}
      >
        <Box id={`${id}-preview-top`} style={{ flexGrow: 1 }} />
        <Box id={`${id}-preview-row`} style={{ direction: "row" }}>
          <Box id={`${id}-preview-left`} style={{ flexGrow: 1 }} />
          {preview}
          <Box id={`${id}-preview-right`} style={{ flexGrow: 1 }} />
        </Box>
        <Box id={`${id}-preview-bottom`} style={{ flexGrow: 1 }} />
      </Box>
      {layout.stacked
        ? <Text id={`${id}-divider`} textStyle={{ dim: true }}>{"─".repeat(layout.viewport.width)}</Text>
        : <Box id={`${id}-divider`} style={{ width: 1, height: PLAYGROUND_ROWS }}>
            {Array.from({ length: PLAYGROUND_ROWS }, (_, row) => (
              <Text id={`${id}-divider-${row}`} key={row} textStyle={{ dim: true }}>│</Text>
            ))}
          </Box>}
      <ScrollArea
        id={controlsScrollId}
        label={`${label} properties`}
        scrollX={controlsScroll.x}
        scrollY={controlsScroll.y}
        style={{ width: layout.propsColumns, height: PLAYGROUND_ROWS }}
      >
        <Box
          id={`${id}-controls-alignment`}
          style={{
            width: layout.controlsExtentColumns,
            minHeight: layout.controlsMinRows,
          }}
        >
          <Box id={`${id}-controls-before`} style={{ flexGrow: 1 }} />
          <Box
            id={`${id}-controls`}
            style={{
              width: layout.controlsInset + controlsColumns,
              paddingLeft: layout.controlsInset,
            }}
          >
            {controls}
          </Box>
          <Box id={`${id}-controls-after`} style={{ flexGrow: 1 }} />
        </Box>
      </ScrollArea>
      </Root>
    </GallerySurface>
  </div>;
}
