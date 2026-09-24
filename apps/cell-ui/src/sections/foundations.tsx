import { GallerySurface } from "../appearance";
import {
  Grid, GridCell, GridRow, Root, Text, TextArea,
} from "@chardesk/cell-ui";
import { useCellGridState, useCellTextState } from "@chardesk/cell-ui/browser";

export const TextAreaComponentDemo = () => {
  const editor = useCellTextState("notes", { value: "Hello, 世界\nEdit these Cells.", multiline: true });
  return <GallerySurface viewport={{ width: 32, height: 8 }} onCommand={editor.dispatch} label="Text area" probeId="component-text-area">
    <Root><TextArea id="notes" label="Notes" state={editor.snapshot} frame="bordered" style={{ width: 30, height: 7 }} /></Root>
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
