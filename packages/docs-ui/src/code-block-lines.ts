export const CODE_BLOCK_PREVIEW_LINES = 20;

export const codeLineCount = (code: string) =>
  code.split("\n").length - Number(code.endsWith("\n"));

export const shouldCollapseCode = (code: string) =>
  codeLineCount(code) > CODE_BLOCK_PREVIEW_LINES;
