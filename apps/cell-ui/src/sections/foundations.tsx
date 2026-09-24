import { TextArea } from "@chardesk/cell-ui";
import { useCellTextState } from "@chardesk/cell-ui/browser";
import { ComponentPlayground } from "../component-playground";

export const TextAreaComponentDemo = () => {
  const editor = useCellTextState("notes", { value: "Hello, 世界\nEdit these Cells.", multiline: true });
  return <ComponentPlayground id="component-text-area-playground" label="Text area" probeId="component-text-area"
    focusedId={null} onCommand={editor.dispatch} previewMinColumns={32} rows={8}
    preview={<TextArea id="notes" label="Notes" state={editor.snapshot} frame="bordered" style={{ width: 30, height: 7 }} />} />;
};
