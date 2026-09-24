import { GallerySurface } from "../appearance";
import { Root, TextArea } from "@chardesk/cell-ui";
import { useCellTextState } from "@chardesk/cell-ui/browser";

export const TextAreaComponentDemo = () => {
  const editor = useCellTextState("notes", { value: "Hello, 世界\nEdit these Cells.", multiline: true });
  return <GallerySurface viewport={{ width: 32, height: 8 }} onCommand={editor.dispatch} label="Text area" probeId="component-text-area">
    <Root><TextArea id="notes" label="Notes" state={editor.snapshot} frame="bordered" style={{ width: 30, height: 7 }} /></Root>
  </GallerySurface>;
};
