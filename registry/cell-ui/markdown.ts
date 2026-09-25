import { marked } from "marked";

export type MarkdownCodeBlock = Readonly<{
  index: number;
  startLine: number;
  endLine: number;
  raw: string;
  code: string;
  language?: string;
}>;

export const parseCellMarkdownCodeBlocks = (source: string): readonly MarkdownCodeBlock[] => {
  const blocks: MarkdownCodeBlock[] = [];
  let cursor = 0;
  for (const token of marked.lexer(source, { gfm: true })) {
    const start = source.indexOf(token.raw, cursor);
    if (start < 0) continue;
    const end = start + token.raw.length;
    cursor = end;
    if (token.type !== "code") continue;
    const startLine = source.slice(0, start).split("\n").length - 1;
    const endLine = source.slice(0, end).split("\n").length - (token.raw.endsWith("\n") ? 1 : 0);
    blocks.push({
      index: blocks.length,
      startLine,
      endLine,
      raw: token.raw,
      code: token.text,
      ...(token.lang ? { language: token.lang.trim() } : {}),
    });
  }
  return blocks;
};

export const safeMarkdownHref = (href: string): string | undefined => {
  const value = href.trim();
  if (!value || /\p{Cc}/u.test(value)) return undefined;
  if (/^(?:https?:|mailto:|\/|#|\.?\.?\/)/iu.test(value)) return value;
  return /^[a-z][a-z\d+.-]*:/iu.test(value) ? undefined : value;
};
