import { GallerySurface } from "../appearance";
import { useState } from "react";
import {
  Box,
  List,
  ListItem,
  Menu,
  MenuItem,
  Overlay,
  Root,
  Text,
  type WidgetCommand,
} from "@chardesk/cell-ui";
import { useCellListState, useCellMenuState } from "@chardesk/cell-ui/browser";

const launcherItems = [
  { id: "show-palette", label: "Open command palette" },
] as const;

const commandItems = [
  { id: "open-file", label: "Open file" },
  { id: "new-file", label: "New file" },
  { id: "save-file", label: "Save file" },
] as const;

export const OverlayDemo = () => {
  const [open, setOpen] = useState(false);
  const launcher = useCellListState(launcherItems, {
    defaultFocusedId: "show-palette",
    onAction: () => setOpen(true),
  });
  const commands = useCellMenuState(commandItems, {
    defaultFocusedId: "open-file",
    onAction: () => setOpen(false),
  });
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "dismiss" && command.targetId === "command-palette") {
      setOpen(false);
      return;
    }
    (open ? commands : launcher).dispatch(command);
  };

  return (
      <GallerySurface
        viewport={{ width: 36, height: 12 }}
        focusedId={open ? commands.focusedId : launcher.focusedId}
        onCommand={dispatch}
        label="Command palette workspace"
        probeId="overlay"
      >
        <Root id="overlay-root">
          <List id="overlay-launchers" label="Workspace actions" style={{ height: 1 }}>
            <ListItem
              id="show-palette"
              focused={launcher.focusedId === "show-palette"}
            ><Text>Open command palette</Text></ListItem>
          </List>
          <Box id="overlay-workspace" style={{ border: true, width: 18, height: 3 }}>
            <Text id="overlay-workspace-label">Document workspace</Text>
            {open ? (
              <Overlay
                id="command-palette"
                label="Command palette"
                position={{ x: 3, y: 2 }}
                style={{ border: true, width: 30, height: 7 }}
              >
                <Text id="palette-title" textStyle={{ bold: true }}>Commands</Text>
                <Menu id="commands" label="Commands" style={{ height: 3 }}>
                  {commands.items.map((item) => (
                    <MenuItem
                      id={item.id}
                      key={item.id}
                      focused={commands.focusedId === item.id}
                    ><Text>{item.label}</Text></MenuItem>
                  ))}
                </Menu>
                <Text id="palette-hint" textStyle={{ dim: true }}>Esc closes</Text>
              </Overlay>
            ) : null}
          </Box>
          <Text id="overlay-document-line-1">01  src/index.ts</Text>
          <Text id="overlay-document-line-2">02  src/app.ts</Text>
          <Text id="overlay-document-line-3">03  src/layout.ts</Text>
        </Root>
      </GallerySurface>
  );
};
