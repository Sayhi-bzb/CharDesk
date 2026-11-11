import type { CharDeskSemanticSpan } from "@chardesk/chargraph";

type Marks = Omit<CharDeskSemanticSpan, "from" | "to">;
type Chunk = Marks & { text: string; separator?: boolean };
const blocks = new Set(["P", "DIV", "SECTION", "ARTICLE", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "UL", "OL", "LI", "TABLE", "TR"]);
const whitespace = /\s/u;
const horizontalWhitespace = /[^\S\r\n]/u;
const headingRoles = ["heading-1", "heading-2", "heading-3", "heading-4"] as const;

/** Plain text owns characters and spacing; detached HTML only annotates matching text. */
export function readHtmlClipboard(html: string, plainText: string): {
  source: string;
  spans: CharDeskSemanticSpan[] | null;
} | null {
  if (!html || html.length > 16_777_216 || typeof DOMParser === "undefined") return null;
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("script, style, noscript, iframe, object, template, [hidden], [aria-hidden=true]").forEach(node => node.remove());
  const chunks: Chunk[] = [];
  let semantic = false;
  let nextCodeBlockId = 0;
  const separator = (text: string) => {
    if (chunks.length && !chunks.at(-1)!.text.endsWith(text)) chunks.push({ text, roles: [], separator: true });
  };
  const visit = (node: Node, inherited: Marks) => {
    if (node.nodeType === 3) {
      if (node.nodeValue) chunks.push({ ...inherited, text: node.nodeValue });
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as HTMLElement;
    const tag = element.tagName;
    if (tag === "BR") {
      chunks.push({ text: "\n", roles: [] });
      return;
    }
    if (blocks.has(tag)) separator("\n");
    let roles = [...inherited.roles];
    const weight = element.style?.fontWeight ?? "";
    if (weight === "normal" || (weight && Number(weight) < 600)) roles = roles.filter(role => role !== "strong");
    else if (tag === "B" || tag === "STRONG" || weight === "bold" || Number(weight) >= 600) roles.push("strong");
    if (element.style?.fontStyle === "normal") roles = roles.filter(role => role !== "emphasis");
    else if (tag === "EM" || tag === "I" || element.style?.fontStyle === "italic") roles.push("emphasis");
    if (["DEL", "S", "STRIKE"].includes(tag)) roles.push("strikethrough");
    const preformatted = inherited.preformatted || tag === "PRE";
    const codeBlockId = tag === "PRE" ? nextCodeBlockId++ : inherited.codeBlockId;
    const codeLanguage = tag === "CODE"
      ? /(?:^|\s)language-([\w+-]+)/.exec(element.className)?.[1] ?? inherited.codeLanguage
      : inherited.codeLanguage;
    if (tag === "CODE" && !preformatted) roles.push("inline-code");
    const href = tag === "A" ? element.getAttribute("href") ?? undefined : inherited.href;
    if (tag === "A" && href) roles.push("link");
    const isHeading = /^H[1-6]$/.test(tag);
    const headingLevel = isHeading ? Number(tag[1]) : inherited.headingLevel;
    if (isHeading) roles.push(headingRoles[Math.min(headingLevel!, 4) - 1]!);
    if (tag === "TH") roles.push("table-header");
    semantic ||= roles.length > 0 || preformatted || ["LI", "BLOCKQUOTE"].includes(tag);
    const marks: Marks = {
      roles: [...new Set(roles)],
      ...(href ? { href } : {}),
      ...(preformatted ? { preformatted } : {}),
      ...(headingLevel ? { headingLevel } : {}),
      ...(codeBlockId !== undefined ? { codeBlockId } : {}),
      ...(codeLanguage ? { codeLanguage } : {}),
    };
    for (const child of element.childNodes) visit(child, marks);
    if (tag === "TD" || tag === "TH") separator("\t");
    if (blocks.has(tag)) separator("\n");
  };
  visit(document.body, { roles: [] });
  if (plainText && !semantic) return null;
  while (chunks.at(-1)?.separator) chunks.pop();
  const source = (plainText || chunks.map(chunk => chunk.text).join("")).replace(/\r\n?/g, "\n");
  const spans: CharDeskSemanticSpan[] = [];
  let cursor = 0;
  for (const chunk of chunks) {
    let from: number | undefined = chunk.preformatted ? cursor : undefined;
    let to = cursor;
    const leadingSpace = /^[^\S\r\n]+/u.test(chunk.text);
    for (const char of chunk.text) {
      if (whitespace.test(char)) continue;
      const beforeSpace = cursor;
      while (cursor < source.length && whitespace.test(source[cursor]!)) cursor++;
      // Refuse a partial or guessed match; raw source remains intact on failure.
      if (!source.startsWith(char, cursor)) return { source, spans: null };
      from ??= leadingSpace && !source.slice(beforeSpace, cursor).includes("\n") ? beforeSpace : cursor;
      cursor += char.length;
      to = cursor;
    }
    if (chunk.preformatted ? /\s$/u.test(chunk.text) : /[^\S\r\n]$/u.test(chunk.text)) {
      const beforeSpace = cursor;
      const trailingWhitespace = chunk.preformatted ? whitespace : horizontalWhitespace;
      while (cursor < source.length && trailingWhitespace.test(source[cursor]!)) cursor++;
      if (cursor > beforeSpace) {
        from ??= beforeSpace;
        to = cursor;
      }
    }
    if (from !== undefined && to > from) {
      spans.push({
        from, to, roles: chunk.roles,
        ...(chunk.href ? { href: chunk.href } : {}),
        ...(chunk.preformatted ? { preformatted: chunk.preformatted } : {}),
        ...(chunk.headingLevel ? { headingLevel: chunk.headingLevel } : {}),
        ...(chunk.codeBlockId !== undefined ? { codeBlockId: chunk.codeBlockId } : {}),
        ...(chunk.codeLanguage ? { codeLanguage: chunk.codeLanguage } : {}),
      });
    }
  }
  if (source.slice(cursor).trim()) return { source, spans: null };
  return { source, spans };
}
