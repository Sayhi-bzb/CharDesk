import { GallerySurface } from "../appearance";
import { useState } from "react";
import {
  Box,
  Root,
  Text,
  TextArea,
  TextInput,
  type WidgetCommand,
} from "@chardesk/cell-ui";
import {
  useCellRangeState,
  useCellTextState,
} from "@chardesk/cell-ui/browser";

export const TextEditingDemo = () => {
  const [message, setMessage] = useState("Ready");
  const range = useCellRangeState();
  const name = useCellTextState("editor-name", {
    value: "notes.txt",
    onChange: (value) => setMessage(`Name: ${value}`),
  });
  const document = useCellTextState("editor-document", {
    value: "Hello, 世界 👋\nEdit this Cell-native document.",
    multiline: true,
    onChange: (_value, snapshot) => setMessage(`Document revision ${snapshot.revision}`),
  });
  const dispatch = (command: WidgetCommand) => {
    name.dispatch(command);
    document.dispatch(command);
    if (command.type === "activate") setMessage(`${command.targetId} submitted`);
  };

  return (
    <>
      <GallerySurface
        viewport={{ width: 40, height: 13 }}
        onCommand={dispatch}
        cellRange={range.snapshot}
        onCellRangeCommand={range.dispatch}
        label="Cell text editor"
        probeId="editor"
      >
        <Root id="editor-root">
          <Box id="editor-workspace">
            <Text id="editor-name-label">File name</Text>
            <TextInput
              id="editor-name"
              label="File name"
              state={name.snapshot}
              style={{ border: true, height: 3 }}
            />
            <Text id="editor-document-label">Document</Text>
            <TextArea
              id="editor-document"
              label="Document"
              state={document.snapshot}
              style={{ border: true, height: 7 }}
            />
          </Box>
        </Root>
      </GallerySurface>
      <output aria-label="Text editing status" role="status" aria-live="polite">
        {message}
      </output>
      <pre aria-label="Selected Cell text">
        {range.snapshot?.text ?? "No Cell range selected"}
      </pre>
    </>
  );
};
