import { useState } from "react";
import { GallerySurface } from "../appearance";
import {
  Grid, GridCell, GridRow, Menu, MenuItem, RangeSlider, RangeSliderThumb,
  Root, Text, TextArea, Tree, TreeItem, type WidgetCommand,
} from "@chardesk/cell-ui";
import { useCellGridState, useCellMenuState, useCellTextState, useCellTreeState } from "@chardesk/cell-ui/browser";

export const RangeSliderComponentDemo = () => {
  const [values, setValues] = useState<[number, number]>([25, 75]);
  const dispatch = (command: WidgetCommand) => {
    if (command.type !== "set-value") return;
    if (command.targetId === "range-start") setValues(([_, end]) => [command.value, end]);
    if (command.targetId === "range-end") setValues(([start]) => [start, command.value]);
  };
  return <GallerySurface viewport={{ width: 32, height: 3 }} onCommand={dispatch} label="Range slider" probeId="component-range-slider">
    <Root><Text>{`Range ${values[0]}–${values[1]}`}</Text>
      <RangeSlider id="range" label="Range" min={0} max={100} style={{ width: 28 }}>
        <RangeSliderThumb id="range-start" label="Start" value={values[0]} />
        <RangeSliderThumb id="range-end" label="End" value={values[1]} />
      </RangeSlider>
    </Root>
  </GallerySurface>;
};

export const TextAreaComponentDemo = () => {
  const editor = useCellTextState("notes", { value: "Hello, 世界\nEdit these Cells.", multiline: true });
  return <GallerySurface viewport={{ width: 32, height: 8 }} onCommand={editor.dispatch} label="Text area" probeId="component-text-area">
    <Root><TextArea id="notes" label="Notes" state={editor.snapshot} frame="bordered" style={{ width: 30, height: 7 }} /></Root>
  </GallerySurface>;
};

export const MenuComponentDemo = () => {
  const menu = useCellMenuState([{ id: "new", label: "New file" }, { id: "open", label: "Open file" }, { id: "save", label: "Save" }]);
  return <GallerySurface viewport={{ width: 28, height: 5 }} focusedId={menu.focusedId} onCommand={menu.dispatch} label="Menu" probeId="component-menu">
    <Root><Menu label="File actions">{menu.items.map((item) =>
      <MenuItem key={item.id} id={item.id} focused={menu.focusedId === item.id}><Text>{item.label}</Text></MenuItem>
    )}</Menu></Root>
  </GallerySurface>;
};

export const TreeComponentDemo = () => {
  const tree = useCellTreeState([{ id: "src", label: "src", children: [{ id: "app", label: "app.ts" }, { id: "index", label: "index.ts" }] }], { defaultExpandedIds: ["src"] });
  return <GallerySurface viewport={{ width: 28, height: 5 }} focusedId={tree.focusedId} onCommand={tree.dispatch} label="Tree" probeId="component-tree">
    <Root><Tree label="Files">{tree.rows.map((row) =>
      <TreeItem key={row.item.id} id={row.item.id} level={row.level} parentItemId={row.parentId ?? undefined}
        hasChildren={row.hasChildren} expanded={row.expanded} focused={tree.focusedId === row.item.id}
        selected={tree.selectedId === row.item.id}><Text>{row.item.label}</Text></TreeItem>
    )}</Tree></Root>
  </GallerySurface>;
};

export const GridComponentDemo = () => {
  const grid = useCellGridState([{ id: "row", cells: [{ id: "name", label: "Name" }, { id: "value", label: "Value" }] }]);
  return <GallerySurface viewport={{ width: 36, height: 3 }} focusedId={grid.focusedId} onCommand={grid.dispatch} label="Grid" probeId="component-grid">
    <Root><Grid label="Properties" rowCount={grid.rowCount} columnCount={grid.columnCount}>
      {grid.rows.map((row, rowIndex) => <GridRow id={row.id} key={row.id} rowIndex={rowIndex + 1}>
        {row.cells.map((cell, columnIndex) => <GridCell id={cell.id} key={cell.id} rowIndex={rowIndex + 1}
          columnIndex={columnIndex + 1} focused={grid.focusedId === cell.id} selected={grid.selectedId === cell.id}
          style={{ width: 16 }}><Text>{cell.label}</Text></GridCell>)}
      </GridRow>)}
    </Grid></Root>
  </GallerySurface>;
};
