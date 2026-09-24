import { marked, type Token, type Tokens } from "marked";

export type MarkdownInline = Readonly<{
  text: string;
  bold?: boolean;
  underline?: boolean;
  href?: string;
}>;

export type MarkdownBlock =
  | Readonly<{ kind: "paragraph"; content: readonly MarkdownInline[] }>
  | Readonly<{ kind: "heading"; content: readonly MarkdownInline[]; level: number }>
  | Readonly<{ kind: "quote"; content: readonly MarkdownInline[] }>
  | Readonly<{ kind: "code"; text: string; language?: string }>
  | Readonly<{ kind: "rule" }>
  | Readonly<{ kind: "list"; items: readonly Readonly<{ marker: string; blocks: readonly MarkdownBlock[] }>[] }>
  | Readonly<{ kind: "table"; rows: readonly (readonly (readonly MarkdownInline[])[])[] }>;

const safeHref = (href: string): string | undefined => {
  const value = href.trim();
  if (!value || /[\u0000-\u001f\u007f]/u.test(value)) return undefined;
  if (/^(?:https?:|mailto:|\/|#|\.?\.?\/)/iu.test(value)) return value;
  return /^[a-z][a-z\d+.-]*:/iu.test(value) ? undefined : value;
};

const inline = (
  tokens: readonly Token[] | undefined,
  decoration: Pick<MarkdownInline, "bold" | "underline"> = {},
): MarkdownInline[] => {
  if (!tokens) return [];
  return tokens.flatMap((token): MarkdownInline[] => {
    if (token.type === "strong") return inline(token.tokens, { ...decoration, bold: true });
    if (token.type === "em") return inline(token.tokens, { ...decoration, underline: true });
    if (token.type === "del") return [{ text: `~${token.text}~`, ...decoration }];
    if (token.type === "link") {
      const label = inline(token.tokens, { ...decoration, underline: true });
      const href = safeHref(token.href);
      return href ? [{ text: `${label.map((part) => part.text).join("")} ↗`, ...decoration, underline: true, href }]
        : label;
    }
    if (token.type === "image") return [{ text: `[image: ${token.text || "untitled"}]`, ...decoration }];
    if (token.type === "codespan") return [{ text: `\`${token.text}\``, ...decoration }];
    if (token.type === "br") return [{ text: "\n", ...decoration }];
    if (token.type === "text" && token.tokens) return inline(token.tokens, decoration);
    if ("text" in token && typeof token.text === "string") return [{ text: token.text, ...decoration }];
    return [{ text: token.raw, ...decoration }];
  });
};

const blocks = (tokens: readonly Token[]): MarkdownBlock[] => tokens.flatMap((token): MarkdownBlock[] => {
  if (token.type === "space" || token.type === "def") return [];
  if (token.type === "heading") return [{ kind: "heading", level: token.depth, content: inline(token.tokens) }];
  if (token.type === "paragraph" || token.type === "text") {
    return [{ kind: "paragraph", content: inline(token.tokens ?? [token]) }];
  }
  if (token.type === "blockquote") return blocks(token.tokens ?? []).map((block) =>
    block.kind === "paragraph" ? { kind: "quote" as const, content: block.content } : block);
  if (token.type === "code") return [{ kind: "code", text: token.text, language: token.lang }];
  if (token.type === "hr") return [{ kind: "rule" }];
  if (token.type === "list") {
    const list = token as Tokens.List;
    return [{ kind: "list", items: list.items.map((item: Tokens.ListItem, index: number) => ({
      marker: item.task ? `[${item.checked ? "x" : " "}]` : list.ordered ? `${(list.start || 1) + index}.` : "•",
      blocks: blocks(item.tokens),
    })) }];
  }
  if (token.type === "table") {
    const cells = (row: readonly Tokens.TableCell[]) => row.map((cell) => inline(cell.tokens));
    return [{ kind: "table", rows: [cells(token.header), ...token.rows.map(cells)] }];
  }
  // HTML and unknown extensions are visible text, never executable markup.
  return [{ kind: "paragraph", content: [{ text: token.raw }] }];
});

export const parseCellMarkdown = (source: string): readonly MarkdownBlock[] =>
  blocks(marked.lexer(source, { gfm: true }));
