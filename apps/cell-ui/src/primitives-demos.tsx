import { useState } from "react";
import {
  Box,
  List,
  ListItem,
  Pane,
  ResizeHandle,
  Root,
  Split,
  Splitter,
  Text,
  reorderCellItems,
  type WidgetCommand,
} from "@chardesk/cell-ui";
import { GallerySurface } from "./appearance";
import { ComponentPlayground } from "./component-playground";
import { usePlaygroundFocus } from "./playground-controls";

function ResizableDemo({ probeId }: Readonly<{ probeId: string }>) {
  const [leftSize, setLeftSize] = useState(14);
  const [topSize, setTopSize] = useState(3);
  const focus = usePlaygroundFocus(`${probeId}-frame`, []);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    if (command.type === "set-value" && command.targetId === `${probeId}-vertical-splitter`) setLeftSize(command.value);
    if (command.type === "set-value" && command.targetId === `${probeId}-horizontal-splitter`) setTopSize(command.value);
  };
  const preview = <Box id={`${probeId}-frame`} frame="bordered" borderShape="rounded"
    style={{ width: 38, height: 13, padding: 0 }}>
    <Split orientation="horizontal" style={{ width: 36, height: 11 }}>
      <Pane style={{ width: leftSize, height: 11 }} />
      <Splitter id={`${probeId}-vertical-line`} orientation="vertical" style={{ height: 11 }}>
        <ResizeHandle id={`${probeId}-vertical-splitter`} label="Resize left pane" resize={{ value: leftSize, min: 6, max: 28 }} />
      </Splitter>
      <Pane style={{ flexGrow: 1, height: 11 }}>
        <Split orientation="vertical" style={{ width: "100%", height: 11 }}>
          <Pane style={{ width: "100%", height: topSize }} />
          <Splitter id={`${probeId}-horizontal-line`} orientation="horizontal" style={{ width: "100%" }}>
            <ResizeHandle id={`${probeId}-horizontal-splitter`} label="Resize upper pane" resize={{ value: topSize, min: 2, max: 8 }} />
          </Splitter>
          <Pane style={{ width: "100%", flexGrow: 1 }} />
        </Split>
      </Pane>
    </Split>
  </Box>;
  return <ComponentPlayground id={`${probeId}-playground`} label="Resizable component" probeId={probeId}
    focusedId={focus.focusedId} onCommand={dispatch} previewMinColumns={40} showConfig={false}
    rows={15} preview={preview} />;
}

export const ResizableComponentDemo = () => <ResizableDemo probeId="component-resizable" />;

export function ReorderingPrimitiveDemo({ probeId = "primitive-reordering" }: Readonly<{ probeId?: string }> = {}) {
  const [items, setItems] = useState([
    { id: "primitive-reorder-title", label: "Title" },
    { id: "primitive-reorder-chart", label: "Chart" },
    { id: "primitive-reorder-notes", label: "Notes" },
  ]);
  const [focusedId, setFocusedId] = useState<string | null>(items[0]!.id);
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
    if (command.type === "reorder") {
      setItems((current) => [...reorderCellItems(current, command.targetId, command.toIndex)]);
      setFocusedId(command.targetId);
    }
  };
  return <GallerySurface viewport={{ width: 28, height: 6 }} focusedId={focusedId}
    onCommand={dispatch} label="Reordering primitive example" probeId={probeId}>
    <Root><Box style={{ width: 24, gap: 1 }}>
      <List id="primitive-reorder-list" label="Layers" reorderable>
        {items.map((item) => <ListItem key={item.id} id={item.id} label={item.label}>
          <Text>{item.label}</Text>
        </ListItem>)}
      </List>
    </Box></Root>
  </GallerySurface>;
}
