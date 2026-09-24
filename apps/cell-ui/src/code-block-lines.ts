export const CODE_BLOCK_PREVIEW_LINES = 20;

export const shouldCollapseCode = (code: string) =>
  code.split("\n").length - Number(code.endsWith("\n")) > CODE_BLOCK_PREVIEW_LINES;
