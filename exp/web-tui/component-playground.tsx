import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Box, Root, ScrollArea, Text, type WidgetCommand } from "@chardesk/cell-ui";
import { GallerySurface } from "./appearance";

const PREVIEW_COLUMNS = 34;
const CONTROLS_COLUMNS = 29;
const PLAYGROUND_ROWS = 7;
const NARROW_COLUMNS = 29;
const narrowQuery = window.matchMedia("(max-width: 720px)");

const subscribeToNarrowLayout = (listener: () => void) => {
  narrowQuery.addEventListener("change", listener);
  return () => narrowQuery.removeEventListener("change", listener);
};

export function ComponentPlayground({
  id,
  label,
  probeId,
  focusedId,
  onCommand,
  preview,
  controls,
}: Readonly<{
  id: string;
  label: string;
  probeId: string;
  focusedId: string | null;
  onCommand: (command: WidgetCommand) => void;
  preview: ReactNode;
  controls: ReactNode;
}>) {
  const narrow = useSyncExternalStore(
    subscribeToNarrowLayout,
    () => narrowQuery.matches,
    () => false,
  );
  const [controlsScrollY, setControlsScrollY] = useState(0);
  const controlsScrollId = `${id}-controls-scroll`;
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "scroll" && command.targetId === controlsScrollId) {
      setControlsScrollY(command.scrollY);
    }
    if (command.type === "focus" && command.reveal?.targetId === controlsScrollId) {
      setControlsScrollY(command.reveal.scrollY);
    }
    onCommand(command);
  };

  return <GallerySurface
    viewport={narrow
      ? { width: NARROW_COLUMNS, height: PLAYGROUND_ROWS * 2 + 1 }
      : { width: PREVIEW_COLUMNS + 1 + CONTROLS_COLUMNS, height: PLAYGROUND_ROWS }}
    focusedId={focusedId}
    onCommand={dispatch}
    label={label}
    probeId={probeId}
  >
    <Root id={`${id}-root`} style={{ direction: narrow ? "column" : "row" }}>
      <Box
        id={`${id}-preview`}
        style={{ width: narrow ? NARROW_COLUMNS : PREVIEW_COLUMNS, height: PLAYGROUND_ROWS }}
      >
        <Box id={`${id}-preview-top`} style={{ flexGrow: 1 }} />
        <Box id={`${id}-preview-row`} style={{ direction: "row" }}>
          <Box id={`${id}-preview-left`} style={{ flexGrow: 1 }} />
          {preview}
          <Box id={`${id}-preview-right`} style={{ flexGrow: 1 }} />
        </Box>
        <Box id={`${id}-preview-bottom`} style={{ flexGrow: 1 }} />
      </Box>
      {narrow
        ? <Text id={`${id}-divider`} textStyle={{ dim: true }}>{"─".repeat(NARROW_COLUMNS)}</Text>
        : <Box id={`${id}-divider`} style={{ width: 1, height: PLAYGROUND_ROWS }}>
            {Array.from({ length: PLAYGROUND_ROWS }, (_, row) => (
              <Text id={`${id}-divider-${row}`} key={row} textStyle={{ dim: true }}>│</Text>
            ))}
          </Box>}
      <ScrollArea
        id={controlsScrollId}
        label={`${label} properties`}
        scrollY={controlsScrollY}
        style={{ width: CONTROLS_COLUMNS, height: PLAYGROUND_ROWS }}
      >
        <Box
          id={`${id}-controls`}
          style={{
            width: CONTROLS_COLUMNS - 1,
            paddingTop: 1,
            paddingBottom: 1,
            paddingLeft: 3,
          }}
        >
          {controls}
        </Box>
      </ScrollArea>
    </Root>
  </GallerySurface>;
}
