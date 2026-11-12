import { Box, Button, Markdown, ScrollArea, Text, type CellPoint } from "@chardesk/cell-ui";
import { CODE_BLOCK_PREVIEW_LINES, shouldCollapseCode } from "./code-block-lines";
type CopyState = "Copy" | "Copied" | "Copy failed";
export const fence = (code: string, language: string) => `\`\`\`${language}\n${code}\n\`\`\``;

export const renderDocumentationCodeBlock = (
  id: string, code: string, language: string, scroll: CellPoint, copyState: CopyState,
  expanded: boolean, mode: "light" | "dark",
) => {
  const collapsible = shouldCollapseCode(code);
  const visible = collapsible && !expanded ? code.split("\n").slice(0, CODE_BLOCK_PREVIEW_LINES).join("\n") : code;
  const rows = visible.split("\n").length;
  const source = fence(visible, language);
  const gutterWidth = String(code.split("\n").length).length + 2;
  const icon = copyState === "Copied" ? "✓" : copyState === "Copy failed" ? "!" : "󰆏";
  return <Box id={`${id}-code`} variant="surface" style={{ width: "100%", gap: 0 }}>
    <Box style={{ direction: "row", width: "100%" }}>
      {rows > 1 ? <Box id={`${id}-numbers`} style={{ width: gutterWidth, paddingTop: 1, flexShrink: 0 }}>
        {Array.from({ length: rows }, (_, index) => <Text key={index}
          textStyle={{ color: mode === "light" ? "#555555" : "#aaaaaa" }}>
          {String(index + 1).padStart(gutterWidth - 1)}
        </Text>)}
      </Box> : null}
      <ScrollArea id={`${id}-scroll`} scrollX={scroll.x} scrollY={scroll.y}
        style={{ flexGrow: 1, flexShrink: 1 }}>
        <Markdown source={source} />
      </ScrollArea>
      <Button id={`${id}-copy`} label={copyState === "Copy" ? "Copy code" : copyState}
        variant="surface" style={{ position: "absolute", top: 0, right: 1 }}><Text>{icon}</Text></Button>
    </Box>
    {collapsible ? <Box id={`${id}-footer`} style={{ direction: "row", width: "100%" }}>
      <Box style={{ flexGrow: 1 }} />
      <Button id={`${id}-toggle`} variant="ghost">
        <Text>{expanded ? "Show less" : "Show more"}</Text>
      </Button>
      <Box style={{ flexGrow: 1 }} />
    </Box> : null}
  </Box>;
};
