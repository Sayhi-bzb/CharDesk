import { GallerySurface } from "../appearance";
import { useState } from "react";
import {
  Box,
  List,
  ListItem,
  Root,
  ScrollArea,
  Text,
  type WidgetCommand,
} from "@chardesk/cell-ui";
import { useCellListState } from "@chardesk/cell-ui/browser";

const actionItems = [
  { id: "core-new", label: "New file" },
  { id: "core-open", label: "Open file" },
  { id: "core-save", label: "Save" },
] as const;

const fileItems = [
  "src/index.ts",
  "src/app.ts",
  "src/layout.ts",
  "src/theme.ts",
  "src/events.ts",
  "src/input.ts",
  "src/semantics.ts",
].map((path, index) => ({
  id: `core-file-${path}`,
  label: `${String(index + 1).padStart(2, "0")}  ${path}`,
}));

export const CoreControlsDemo = () => {
  const [scrollY, setScrollY] = useState(0);
  const actions = useCellListState(actionItems, {
    defaultFocusedId: "core-open",
    defaultSelectedId: "core-open",
  });
  const files = useCellListState(fileItems);
  const focusedId = actions.focusedId ?? files.focusedId;
  const dispatch = (command: WidgetCommand) => {
    actions.dispatch(command);
    files.dispatch(command);
    if (command.type === "scroll") setScrollY(command.scrollY);
    if (command.type === "focus" && command.reveal) {
      setScrollY(command.reveal.scrollY);
    }
  };

  return (
      <GallerySurface
        viewport={{ width: 32, height: 10 }}
        focusedId={focusedId}
        onCommand={dispatch}
        label="File commands and files"
        probeId="core"
      >
        <Root id="core-root">
          <Box id="core-workspace">
            <List id="core-actions" label="Actions" style={{ height: 3 }}>
              {actions.items.map((item) => (
                <ListItem
                  id={item.id}
                  key={item.id}
                  focused={actions.focusedId === item.id}
                  selected={actions.selectedId === item.id}
                ><Text>{item.label}</Text></ListItem>
              ))}
            </List>
            <Text id="core-offset">{`offset: ${scrollY} / 3`}</Text>
            <ScrollArea
              id="core-files"
              scrollY={scrollY}
              style={{ border: true, height: 6 }}
            >
              <List id="core-file-list" label="Files">
                {files.items.map((item) => (
                  <ListItem
                    id={item.id}
                    key={item.id}
                    focused={files.focusedId === item.id}
                    selected={files.selectedId === item.id}
                  ><Text>{item.label}</Text></ListItem>
                ))}
              </List>
            </ScrollArea>
          </Box>
        </Root>
      </GallerySurface>
  );
};
