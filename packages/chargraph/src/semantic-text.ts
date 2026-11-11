import { iterateGraphemes, type CharDeskTextStyle } from "@chardesk/protocol";
import { mergeCharGraphStyle, splitCharGraphLines, joinCharGraphLines } from "./fragments.js";
import type { CharGraphFragment, CharGraphHeading, CharGraphRenderResult } from "./model.js";
import type { MarkdownRenderOptions, MarkdownTextRuleId, MarkdownTextStyleRole } from "./markdown.js";
import { createCharDeskMarkdownStyles } from "./markdown-theme.js";
import { wrapMarkdownProse } from "./markdown-wrap.js";
import { highlightCode } from "./code-highlighting.js";

/** Non-overlapping UTF-16 ranges over literal source. Styles never insert or remove characters. */
export type CharDeskSemanticSpan = {
  from: number;
  to: number;
  roles: readonly MarkdownTextStyleRole[];
  href?: string;
  preformatted?: boolean;
  headingLevel?: number;
  codeBlockId?: number;
  codeLanguage?: string;
};

const ruleFor = (role: MarkdownTextStyleRole): MarkdownTextRuleId => {
  if (role.startsWith("heading-")) return "heading";
  if (role.startsWith("table-")) return "table";
  if (role.startsWith("task-")) return "task-list";
  if (role === "list-marker" || role === "ordered-list-marker") return "list";
  if (role === "blockquote-marker") return "blockquote";
  return role as MarkdownTextRuleId;
};

export async function renderSemanticText(
  source: string,
  spans: readonly CharDeskSemanticSpan[],
  options: MarkdownRenderOptions = {}
): Promise<CharGraphRenderResult> {
  const styles = { ...createCharDeskMarkdownStyles().styles, ...options.styles };
  const ordered = [...spans].sort((a, b) => a.from - b.from).map(span => {
    let style: CharDeskTextStyle = {};
    for (const role of span.roles) {
      if (options.rules?.[ruleFor(role)] !== false) style = mergeCharGraphStyle(style, styles[role]);
    }
    return { ...span, style };
  });
  const fragments: CharGraphFragment[] = [];
  const diagnostics: CharGraphRenderResult["diagnostics"] = [];
  const blocks = new Map<number, { from: number; to: number; language: string }>();
  for (const span of ordered) {
    if (span.codeBlockId === undefined || !span.codeLanguage) continue;
    const block = blocks.get(span.codeBlockId);
    if (block) block.to = span.to;
    else blocks.set(span.codeBlockId, { from: span.from, to: span.to, language: span.codeLanguage });
  }
  const highlighted: CharGraphFragment[] = [];
  if (options.rules?.["code-block"] !== false) for (const block of blocks.values()) {
    try {
      highlighted.push(...await highlightCode(source.slice(block.from, block.to), block.language, options.codeTheme, block.from));
    } catch {
      diagnostics.push({ code: "markdown-highlight-failed", message: `Could not highlight ${block.language}.` });
    }
  }
  let syntaxIndex = 0;
  let cursor = 0;
  let previousSpan: typeof ordered[number] | undefined;
  let previousSyntax: CharGraphFragment | undefined;
  const headingStarts: { from: number; level: number; label: string }[] = [];
  let sourceRow = 0;
  const seenSourceRows = new Set<number>();
  for (const { segment, index } of iterateGraphemes(source)) {
    while (ordered[cursor] && ordered[cursor]!.to <= index) cursor++;
    const candidate = ordered[cursor];
    const span = candidate && candidate.from <= index ? candidate : undefined;
    if (span?.headingLevel && !seenSourceRows.has(sourceRow) && options.rules?.heading !== false) {
      const lineEnd = source.indexOf("\n", index);
      headingStarts.push({ from: index, level: span.headingLevel, label: source.slice(index, lineEnd < 0 ? source.length : lineEnd).trim() });
      seenSourceRows.add(sourceRow);
    }
    const previous = fragments.at(-1);
    while (highlighted[syntaxIndex] && highlighted[syntaxIndex]!.origin!.to <= index) syntaxIndex++;
    const syntax = highlighted[syntaxIndex];
    const syntaxStyle = syntax?.origin && syntax.origin.from <= index ? syntax : undefined;
    if (previous && span === previousSpan && syntaxStyle === previousSyntax) {
      previous.text += segment;
      previous.origin!.to = index + segment.length;
    } else fragments.push({
      text: segment,
      ...mergeCharGraphStyle(span?.style ?? {}, syntaxStyle),
      ...(span?.href && options.rules?.link !== false ? { href: span.href } : {}),
      origin: { from: index, to: index + segment.length },
    });
    previousSpan = span;
    previousSyntax = syntaxStyle;
    if (segment.includes("\n")) sourceRow++;
  }
  const lines = splitCharGraphLines(fragments);
  const preformatted = ordered.filter(span => span.preformatted);
  let preformattedIndex = 0;
  const wrapped = options.proseWrapWidth ? lines.map(line => {
    const from = line[0]?.origin?.from ?? 0;
    const to = line.at(-1)?.origin?.to ?? from;
    while (preformatted[preformattedIndex] && preformatted[preformattedIndex]!.to <= from) preformattedIndex++;
    return (preformatted[preformattedIndex]?.from ?? Infinity) < to
      ? line : wrapMarkdownProse(line, options.proseWrapWidth!);
  }) : lines;
  const output = joinCharGraphLines(wrapped);
  const headings: CharGraphHeading[] = [];
  let row = 0;
  let headingIndex = 0;
  for (const part of output) {
    const heading = headingStarts[headingIndex];
    if (heading && part.origin && heading.from >= part.origin.from && heading.from < part.origin.to) {
      headings.push({ row, level: heading.level, label: heading.label });
      headingIndex++;
    }
    row += part.text.split("\n").length - 1;
  }
  return { fragments: output, headings, recognized: true, diagnostics };
}
