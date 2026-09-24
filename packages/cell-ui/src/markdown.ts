import { Lexer, marked, type Token } from "marked";

export type MarkdownInline = Readonly<{
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  href?: string;
}>;

export type MarkdownSourceLine = Readonly<{
  text: string;
  kind: "paragraph" | "heading" | "quote" | "code" | "rule" | "list" | "table";
  level?: number;
  content: readonly MarkdownInline[];
}>;

const safeHref = (href: string): string | undefined => {
  const value = href.trim();
  if (!value || /[\u0000-\u001f\u007f]/u.test(value)) return undefined;
  if (/^(?:https?:|mailto:|\/|#|\.?\.?\/)/iu.test(value)) return value;
  return /^[a-z][a-z\d+.-]*:/iu.test(value) ? undefined : value;
};

type Decoration = Pick<MarkdownInline, "bold" | "italic" | "strike" | "underline" | "href">;
type Span = Readonly<{ start: number; end: number; decoration: Decoration }>;
const sameDecoration = (left: Decoration, right: Decoration) => left.bold === right.bold
  && left.italic === right.italic && left.strike === right.strike
  && left.underline === right.underline && left.href === right.href;

const inlineSpans = (source: string): Span[] => {
  const spans: Span[] = [];
  const visit = (tokens: readonly Token[], raw: string, offset: number, decoration: Decoration) => {
    let cursor = 0;
    for (const token of tokens) {
      const found = raw.indexOf(token.raw, cursor);
      if (found < 0) continue;
      const start = offset + found;
      cursor = found + token.raw.length;
      const children = "tokens" in token && Array.isArray(token.tokens) ? token.tokens as readonly Token[] : null;
      if (token.type === "strong" && children) visit(children, token.raw, start, { ...decoration, bold: true });
      else if (token.type === "em" && children) visit(children, token.raw, start, { ...decoration, italic: true });
      else if (token.type === "del" && children) visit(children, token.raw, start, { ...decoration, strike: true });
      else if (token.type === "link" && children) {
        const href = safeHref(token.href);
        visit(children, token.raw, start, href ? { ...decoration, underline: true, href } : decoration);
      } else if (children) visit(children, token.raw, start, decoration);
      else if (token.type === "codespan") {
        const inner = token.raw.indexOf(token.text);
        if (inner >= 0) spans.push({ start: start + inner, end: start + inner + token.text.length, decoration });
      } else if (token.type === "text" || token.type === "escape" || token.type === "br") {
        spans.push({ start, end: start + token.raw.length, decoration });
      }
    }
  };
  visit(Lexer.lexInline(source, { gfm: true }), source, 0, {});
  return spans;
};

const styledLine = (text: string, kind: MarkdownSourceLine["kind"]): readonly MarkdownInline[] => {
  if (!text) return [{ text: " " }];
  if (kind === "code" || kind === "rule") return [{ text }];
  const headingEnd = kind === "heading" ? /^(?: {0,3}#{1,6}\s+)/u.exec(text)?.[0].length ?? 0 : 0;
  const headingClose = headingEnd ? /\s+#+\s*$/u.exec(text) : null;
  const headingContentEnd = headingClose?.index ?? text.length;
  const styles: Decoration[] = Array.from({ length: text.length }, () => ({}));
  for (const { start, end, decoration } of inlineSpans(text)) {
    for (let index = start; index < end; index++) {
      if (index < headingEnd) continue;
      styles[index] = { ...styles[index], ...decoration,
        ...(headingEnd && index < headingContentEnd ? { bold: true } : {}) };
    }
  }
  const content: MarkdownInline[] = [];
  for (let start = 0; start < text.length;) {
    const style = styles[start]!;
    let end = start + 1;
    while (end < text.length && sameDecoration(styles[end]!, style)) end++;
    content.push({ text: text.slice(start, end), ...style });
    start = end;
  }
  return content;
};

export const parseCellMarkdown = (source: string): readonly MarkdownSourceLine[] => {
  if (!source) return [];
  const tokens = marked.lexer(source, { gfm: true });
  const tokenRanges: { start: number; end: number; token: Token }[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const start = source.indexOf(token.raw, cursor);
    if (start < 0) continue;
    tokenRanges.push({ start, end: start + token.raw.length, token });
    cursor = start + token.raw.length;
  }
  let start = 0;
  let tokenIndex = 0;
  return source.split("\n").map((raw): MarkdownSourceLine => {
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    while (tokenRanges[tokenIndex] && tokenRanges[tokenIndex]!.end <= start) tokenIndex++;
    const candidate = tokenRanges[tokenIndex];
    const range = candidate && candidate.start < start + Math.max(1, raw.length) ? candidate : undefined;
    const token = range?.token;
    const kind: MarkdownSourceLine["kind"] = !text ? "paragraph" : token?.type === "heading" ? "heading"
      : token?.type === "blockquote" ? "quote"
      : token?.type === "code" ? "code"
      : token?.type === "hr" ? "rule"
      : token?.type === "list" ? "list"
      : token?.type === "table" ? "table" : "paragraph";
    const line = { text, kind, ...(token?.type === "heading" ? { level: token.depth } : {}), content: styledLine(text, kind) };
    start += raw.length + 1;
    return line;
  });
};
