import { GallerySurface } from "../appearance";
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
  const range = useCellRangeState();
  const name = useCellTextState("editor-name", {
    value: "notes.txt",
  });
  const document = useCellTextState("editor-document", {
    value: "Hello, 世界 👋\nEdit this Cell-native document.",
    multiline: true,
  });
  const dispatch = (command: WidgetCommand) => {
    name.dispatch(command);
    document.dispatch(command);
  };

  return <GallerySurface
    viewport={{ width: 40, height: 10 }}
    onCommand={dispatch}
    cellRange={range.snapshot}
    onCellRangeCommand={range.dispatch}
    label="Cell text editor"
    probeId="editor"
    fontAudit
  >
    <Root id="editor-root">
      <Box id="editor-workspace">
        <Text id="editor-name-label">File name</Text>
        <TextInput
          id="editor-name"
          label="File name"
          state={name.snapshot}
        />
        <Text id="editor-document-label">Document</Text>
        <TextArea
          id="editor-document"
          label="Document"
          state={document.snapshot}
          variant="bordered"
          style={{ height: 7 }}
        />
      </Box>
    </Root>
  </GallerySurface>;
};
