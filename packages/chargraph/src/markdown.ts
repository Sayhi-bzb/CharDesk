import {
  getTextCellWidth,
  type CharDeskTextAttributes,
  type CharDeskTextStyle,
} from "@chardesk/protocol";
import { Marked, type Token, type Tokens } from "marked";
import type {
  BundledLanguage,
  BundledTheme,
  SpecialTheme,
  ThemeRegistrationAny,
} from "shiki";
import {
  createCharGraphFragment as fragment,
  createCharGraphTextFragments as textFragments,
  getCharGraphFragmentsText as textOf,
  joinCharGraphLines as joinLines,
  mergeCharGraphStyle as mergeStyle,
  splitCharGraphLines as splitLines,
  styleCharGraphFragments as withStyle,
} from "./fragments.js";
import type { MarkdownSyntaxExtension } from "./markdown-extension.js";
import {
  defineCharGraphRenderer,
  type CharGraphDiagnostic,
  type CharGraphFragment,
  type CharGraphInlineAlignment,
  type CharGraphRenderResult,
  type CharGraphSourceRange,
  type CharGraphVisualGroup,
} from "./model.js";
import {
  locateCharGraphSourceRange as locateRaw,
  normalizeCharGraphSource,
  restoreCharGraphSourceRanges,
} from "./source-map.js";

export type MarkdownTextRuleId =
  | "strong"
  | "emphasis"
  | "strikethrough"
  | "link"
  | "heading"
  | "inline-code"
  | "blockquote"
  | "list"
  | "task-list"
  | "thematic-break"
  | "code-block"
  | "table";

export type MarkdownTextStyleRole =
  | "strong"
  | "emphasis"
  | "strikethrough"
  | "link"
  | "heading-marker"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "heading-4"
  | "inline-code"
  | "blockquote-marker"
  | "list-marker"
  | "ordered-list-marker"
  | "task-unchecked"
  | "task-checked"
  | "thematic-break"
  | "table-header"
  | "table-separator";

export type MarkdownTextRules = Record<MarkdownTextRuleId, boolean>;
export type MarkdownTextStyles = Partial<
  Record<MarkdownTextStyleRole, CharDeskTextStyle>
>;

export type MarkdownRenderOptions = {
  forced?: boolean;
  rules?: Partial<MarkdownTextRules>;
  extensionRules?: Readonly<Record<string, boolean>>;
  styles?: MarkdownTextStyles;
  extensionStyles?: Readonly<Record<string, CharDeskTextStyle>>;
  codeTheme?: BundledTheme | SpecialTheme | ThemeRegistrationAny;
};

export type CreateMarkdownRendererOptions = {
  extensions?: readonly MarkdownSyntaxExtension[];
};

const DEFAULT_RULES: MarkdownTextRules = {
  strong: true,
  emphasis: true,
  strikethrough: true,
  link: true,
  heading: true,
  "inline-code": true,
  blockquote: true,
  list: true,
  "task-list": true,
  "thematic-break": true,
  "code-block": true,
  table: true,
};

const RECOGNIZED_TOKEN_TYPES = new Set([
  "strong",
  "em",
  "del",
  "link",
  "image",
  "codespan",
  "br",
  "html",
  "heading",
  "blockquote",
  "list",
  "hr",
  "code",
  "table",
]);

const NON_SYNTAX_TOKEN_TYPES = new Set([
  "paragraph",
  "text",
  "space",
  "escape",
  "def",
  "list_item",
]);

type RenderContext = {
  source: string;
  rules: MarkdownTextRules;
  styles: MarkdownTextStyles;
  diagnostics: CharGraphDiagnostic[];
  extensionRules: Readonly<Record<string, boolean>>;
  extensionStyles: Readonly<Record<string, CharDeskTextStyle>>;
  codeTheme?: BundledTheme | SpecialTheme | ThemeRegistrationAny;
  extensions: readonly MarkdownSyntaxExtension[];
};

type LocatedRender = {
  fragments: CharGraphFragment[];
  cursor: number;
};

type RenderedBlock = {
  fragments: CharGraphFragment[];
  inlineAlignment: CharGraphInlineAlignment;
};

const renderedBlock = (
  fragments: CharGraphFragment[],
  inlineAlignment: CharGraphInlineAlignment = "start"
): RenderedBlock => ({ fragments, inlineAlignment });

const stripTrailingLineEnding = (raw: string) => raw.replace(/\n$/, "");

const rawFragment = (
  raw: string,
  range: CharGraphSourceRange,
  style: CharDeskTextStyle = {}
) => {
  const text = stripTrailingLineEnding(raw);
  return [fragment(text, style, { from: range.from, to: range.from + text.length })];
};

const unsupported = (
  context: RenderContext,
  token: Token,
  range: CharGraphSourceRange
) => {
  context.diagnostics.push({
    code: "markdown-unsupported-token",
    message: `Markdown token "${token.type}" is not representable as a character graph; its source was preserved.`,
    offset: range.from,
    length: range.to - range.from,
  });
  return rawFragment(token.raw, range);
};

const fontStyleAttrs = (
  fontStyle?: number
): CharDeskTextAttributes | undefined => {
  if (!fontStyle || fontStyle < 0) return undefined;
  return {
    ...(fontStyle & 1 ? { italic: true } : {}),
    ...(fontStyle & 2 ? { bold: true } : {}),
    ...(fontStyle & 4 ? { underline: true } : {}),
  };
};

const extensionContext = (context: RenderContext) => ({
  enabled: (rule: string) => context.extensionRules[rule]
    ?? context.rules[rule as MarkdownTextRuleId]
    ?? true,
  style: (role: string) =>
    context.extensionStyles[role]
    ?? context.styles[role as MarkdownTextStyleRole],
  renderBlocks: (tokens: readonly Token[], sourceOrigin: CharGraphSourceRange) =>
    renderBlocks(tokens, sourceOrigin, context, "source"),
});

const renderExtension = async (
  extension: MarkdownSyntaxExtension,
  request: Parameters<MarkdownSyntaxExtension["render"]>[0],
  context: RenderContext
) => {
  const rendered = await extension.render(request, extensionContext(context));
  if (!rendered) return null;
  context.diagnostics.push(...rendered.diagnostics);
  return rendered;
};

const findTokenExtension = (
  context: RenderContext,
  tokenType: string
) => context.extensions.find((extension) =>
  extension.tokenTypes?.includes(tokenType)
);

const findFencedExtension = (
  context: RenderContext,
  language: string
) => context.extensions.find((extension) =>
  extension.fencedLanguages?.includes(language)
);

const renderInline = async (
  tokens: readonly Token[],
  scope: CharGraphSourceRange,
  style: CharDeskTextStyle,
  context: RenderContext,
  startCursor = scope.from
): Promise<LocatedRender> => {
  const output: CharGraphFragment[] = [];
  let cursor = startCursor;
  for (const token of tokens) {
    const range = locateRaw(context.source, token.raw, scope, cursor);
    cursor = Math.max(cursor, range.to);
    const extension = findTokenExtension(context, token.type);
    if (extension) {
      const rendered = await renderExtension(extension, {
        kind: "token",
        token,
        source: token.raw,
        sourceOrigin: range,
      }, context);
      if (rendered) {
        output.push(...withStyle(rendered.fragments, style));
        continue;
      }
    }
    switch (token.type) {
      case "text": {
        if (token.tokens?.length) {
          const rendered = await renderInline(token.tokens, range, style, context, range.from);
          output.push(...rendered.fragments);
        } else {
          output.push(...textFragments(token.text, style, range));
        }
        break;
      }
      case "escape":
        output.push(fragment(token.text, style, range));
        break;
      case "strong": {
        const strong = token as Tokens.Strong;
        const rendered = await renderInline(strong.tokens, range, style, context, range.from);
        output.push(...withStyle(
          rendered.fragments,
          context.rules.strong ? context.styles.strong : undefined
        ));
        break;
      }
      case "em": {
        const emphasis = token as Tokens.Em;
        const rendered = await renderInline(emphasis.tokens, range, style, context, range.from);
        output.push(...withStyle(
          rendered.fragments,
          context.rules.emphasis ? context.styles.emphasis : undefined
        ));
        break;
      }
      case "del": {
        const deletion = token as Tokens.Del;
        const rendered = await renderInline(deletion.tokens, range, style, context, range.from);
        output.push(...withStyle(
          rendered.fragments,
          context.rules.strikethrough ? context.styles.strikethrough : undefined
        ));
        break;
      }
      case "codespan":
        output.push(fragment(
          token.text,
          mergeStyle(style, context.rules["inline-code"]
            ? context.styles["inline-code"]
            : undefined),
          range
        ));
        break;
      case "link": {
        const link = token as Tokens.Link;
        const rendered = await renderInline(link.tokens, range, style, context, range.from);
        output.push(...withStyle(
          rendered.fragments,
          context.rules.link ? context.styles.link : undefined,
          context.rules.link ? link.href : undefined
        ));
        break;
      }
      case "br":
        output.push(fragment("\n", style, range));
        break;
      case "image":
      case "html":
        output.push(...withStyle(unsupported(context, token, range), style));
        break;
      default:
        output.push(...withStyle(unsupported(context, token, range), style));
        break;
    }
  }
  return { fragments: output, cursor };
};

const padCell = (
  fragments: readonly CharGraphFragment[],
  width: number,
  alignment: "left" | "right" | "center" | null,
  origin: CharGraphSourceRange
) => {
  const remaining = Math.max(0, width - getTextCellWidth(textOf(fragments)));
  const left = alignment === "right"
    ? remaining
    : alignment === "center"
      ? Math.floor(remaining / 2)
      : 0;
  return [
    fragment(" ".repeat(left + 1), {}, origin),
    ...fragments,
    fragment(" ".repeat(remaining - left + 1), {}, origin),
  ];
};

const renderTable = async (
  token: Tokens.Table,
  range: CharGraphSourceRange,
  context: RenderContext
) => {
  if (!context.rules.table) return rawFragment(token.raw, range);
  const rows = [token.header, ...token.rows];
  let cursor = range.from;
  const renderedRows: CharGraphFragment[][][] = [];
  for (const row of rows) {
    const renderedRow: CharGraphFragment[][] = [];
    for (const cell of row) {
      const rendered = await renderInline(
        cell.tokens,
        range,
        {},
        context,
        cursor
      );
      cursor = rendered.cursor;
      renderedRow.push(rendered.fragments);
    }
    renderedRows.push(renderedRow);
  }
  const columnCount = Math.max(token.header.length, ...renderedRows.map((row) => row.length));
  const widths = Array.from({ length: columnCount }, (_, column) => Math.max(
    1,
    ...renderedRows.map((row) => getTextCellWidth(textOf(row[column] ?? [])))
  ));
  const lines: CharGraphFragment[][] = [];
  renderedRows.forEach((row, rowIndex) => {
    const line: CharGraphFragment[] = [];
    widths.forEach((width, column) => {
      if (column > 0) line.push(fragment("  ", {}, range));
      const cell = row[column] ?? [];
      const origin = cell.find((item) => item.origin)?.origin ?? range;
      const padded = padCell(cell, width, token.align[column] ?? null, origin);
      line.push(...(rowIndex === 0
        ? withStyle(padded, context.styles["table-header"])
        : padded));
    });
    lines.push(line);
    if (rowIndex < renderedRows.length - 1) {
      const separator: CharGraphFragment[] = [];
      widths.forEach((width, column) => {
        if (column > 0) separator.push(fragment("  ", {}, range));
        separator.push(fragment(
          (rowIndex === 0 ? "━" : "─").repeat(width + 2),
          context.styles["table-separator"],
          range
        ));
      });
      lines.push(separator);
    }
  });
  return joinLines(lines, range);
};

const renderCode = async (
  token: Tokens.Code,
  range: CharGraphSourceRange,
  context: RenderContext
): Promise<RenderedBlock> => {
  if (!context.rules["code-block"]) {
    return renderedBlock(rawFragment(token.raw, range));
  }
  const codeRange = locateRaw(context.source, token.text, range, range.from);
  const language = token.lang?.split(/[\s,]/, 1)[0]?.toLowerCase();
  if (!language) return renderedBlock([fragment(token.text, {}, codeRange)]);
  const extension = findFencedExtension(context, language);
  if (extension) {
    const rendered = await renderExtension(extension, {
      kind: "fenced-code",
      language,
      source: token.text,
      sourceOrigin: codeRange,
      rawSource: token.raw,
      rawOrigin: range,
    }, context);
    if (rendered) {
      return renderedBlock(
        rendered.fragments,
        rendered.preferredInlineAlignment ?? "start"
      );
    }
  }
  try {
    const { codeToTokens } = await import("shiki");
    const highlighted = await codeToTokens(token.text, {
      lang: language as BundledLanguage,
      theme: context.codeTheme ?? "github-light",
    });
    const output: CharGraphFragment[] = [];
    let offset = 0;
    highlighted.tokens.forEach((line, lineIndex) => {
      line.forEach((part) => {
        output.push(fragment(part.content, {
          color: part.color ?? highlighted.fg,
          ...(fontStyleAttrs(part.fontStyle)
            ? { attrs: fontStyleAttrs(part.fontStyle) }
            : {}),
        }, {
          from: codeRange.from + offset,
          to: codeRange.from + offset + part.content.length,
        }));
        offset += part.content.length;
      });
      if (lineIndex < highlighted.tokens.length - 1) {
        output.push(fragment("\n", {}, {
          from: codeRange.from + offset,
          to: codeRange.from + offset + 1,
        }));
        offset += 1;
      }
    });
    return renderedBlock(output);
  } catch (error) {
    context.diagnostics.push({
      code: "markdown-highlight-failed",
      message: error instanceof Error
        ? `Could not highlight ${language}: ${error.message}`
        : `Could not highlight ${language}.`,
      offset: range.from,
      length: range.to - range.from,
    });
    return renderedBlock([fragment(token.text, {}, codeRange)]);
  }
};

const renderList = async (
  token: Tokens.List,
  range: CharGraphSourceRange,
  context: RenderContext,
  depth = 0
) => {
  if (!context.rules.list) return rawFragment(token.raw, range);
  const lines: CharGraphFragment[][] = [];
  let itemCursor = range.from;
  let orderedIndex = typeof token.start === "number" ? token.start : 1;
  for (const item of token.items) {
    const itemRange = locateRaw(context.source, item.raw, range, itemCursor);
    itemCursor = itemRange.to;
    const markerMatch = item.raw.match(/^(\s*(?:[*+-]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/);
    const markerRange = markerMatch
      ? { from: itemRange.from, to: itemRange.from + markerMatch[1]!.length }
      : itemRange;
    const enhancedTask = item.task && context.rules["task-list"];
    const baseMarker = token.ordered ? `${orderedIndex}. ` : "- ";
    const markerText = enhancedTask
      ? `${item.checked ? "●" : "○"} `
      : `${baseMarker}${item.task ? `[${item.checked ? "x" : " "}] ` : ""}`;
    const markerRole: MarkdownTextStyleRole = enhancedTask
      ? item.checked ? "task-checked" : "task-unchecked"
      : token.ordered ? "ordered-list-marker" : "list-marker";
    const nested = item.tokens.filter((child) => child.type === "list") as Tokens.List[];
    const contentTokens = item.tokens.filter((child) => child.type !== "list");
    const content = await renderBlocks(contentTokens, itemRange, context, false);
    const contentLines = splitLines(content);
    const indent = " ".repeat(depth * 4);
    contentLines.forEach((line, lineIndex) => {
      lines.push([
        fragment(indent, {}, markerRange),
        fragment(
          lineIndex === 0 ? markerText : " ".repeat(getTextCellWidth(markerText)),
          context.styles[markerRole],
          markerRange
        ),
        ...line,
      ]);
    });
    for (const child of nested) {
      const childRange = locateRaw(context.source, child.raw, itemRange, itemRange.from);
      const rendered = await renderList(child, childRange, context, depth + 1);
      lines.push(...splitLines(rendered));
    }
    if (token.loose && item !== token.items.at(-1)) lines.push([]);
    orderedIndex += 1;
  }
  return joinLines(lines, range);
};

const renderBlock = async (
  token: Token,
  range: CharGraphSourceRange,
  context: RenderContext
): Promise<RenderedBlock> => {
  const extension = findTokenExtension(context, token.type);
  if (extension) {
    const rendered = await renderExtension(extension, {
      kind: "token",
      token,
      source: token.raw,
      sourceOrigin: range,
    }, context);
    if (rendered) {
      return renderedBlock(
        rendered.fragments,
        rendered.preferredInlineAlignment ?? "start"
      );
    }
  }
  switch (token.type) {
    case "space":
    case "def":
      return renderedBlock([]);
    case "paragraph": {
      const rendered = await renderInline(
        (token as Tokens.Paragraph).tokens,
        range,
        {},
        context
      );
      return renderedBlock(rendered.fragments);
    }
    case "text":
      return renderedBlock(token.tokens?.length
        ? (await renderInline(token.tokens, range, {}, context)).fragments
        : textFragments(token.text, {}, range));
    case "heading": {
      const heading = token as Tokens.Heading;
      if (!context.rules.heading) {
        return renderedBlock(rawFragment(token.raw, range));
      }
      const body = await renderInline(heading.tokens, range, {}, context);
      const firstBodyOrigin = body.fragments.find((item) => item.origin)?.origin;
      const markerRange = firstBodyOrigin && firstBodyOrigin.from > range.from
        ? { from: range.from, to: firstBodyOrigin.from }
        : range;
      const depth = Math.min(6, Math.max(1, heading.depth));
      const role = `heading-${Math.min(depth, 4)}` as MarkdownTextStyleRole;
      return renderedBlock([
        fragment(`${"#".repeat(depth)} `, context.styles["heading-marker"], markerRange),
        ...withStyle(body.fragments, context.styles[role]),
      ]);
    }
    case "blockquote": {
      const blockquote = token as Tokens.Blockquote;
      if (!context.rules.blockquote) {
        return renderedBlock(rawFragment(token.raw, range));
      }
      const content = await renderBlocks(blockquote.tokens, range, context, "source");
      const markerRanges = [...token.raw.matchAll(/^ {0,3}>[ \t]?/gm)].map((match) => ({
        from: range.from + (match.index ?? 0),
        to: range.from + (match.index ?? 0) + match[0].length,
      }));
      const lines = splitLines(content).map((line, index) => [
        fragment(
          "│ ",
          context.styles["blockquote-marker"],
          markerRanges[index] ?? markerRanges.at(-1) ?? range
        ),
        ...line,
      ]);
      return renderedBlock(joinLines(lines, range));
    }
    case "list":
      return renderedBlock(await renderList(token as Tokens.List, range, context));
    case "code":
      return renderCode(token as Tokens.Code, range, context);
    case "hr":
      return renderedBlock(context.rules["thematic-break"]
        ? [fragment("———", context.styles["thematic-break"], range)]
        : rawFragment(token.raw, range));
    case "table": {
      const enhanced = context.rules.table;
      return renderedBlock(
        await renderTable(token as Tokens.Table, range, context),
        enhanced ? "center" : "start"
      );
    }
    case "html":
      return renderedBlock(unsupported(context, token, range));
    default:
      return renderedBlock(unsupported(context, token, range));
  }
};

const renderBlocks = async (
  tokens: readonly Token[],
  scope: CharGraphSourceRange,
  context: RenderContext,
  separate: boolean | "source",
  visualGroups?: CharGraphVisualGroup[]
) => {
  const output: CharGraphFragment[] = [];
  let cursor = scope.from;
  let outputRow = 0;
  let sourceHasBlankLine = false;
  for (const token of tokens) {
    const range = locateRaw(context.source, token.raw, scope, cursor);
    cursor = Math.max(cursor, range.to);
    if (token.type === "space") {
      sourceHasBlankLine ||= token.raw.includes("\n\n");
      continue;
    }
    const rendered = await renderBlock(token, range, context);
    if (!rendered.fragments.length) continue;
    if (output.length) {
      const lineBreaks = separate === true
        ? 2
        : separate === "source"
          ? sourceHasBlankLine ? 2 : 1
          : 0;
      if (lineBreaks) {
        output.push(fragment("\n".repeat(lineBreaks), {}, range));
        outputRow += lineBreaks;
      }
    }
    const fromRow = outputRow;
    output.push(...rendered.fragments);
    outputRow += rendered.fragments.reduce(
      (total, item) => total + (item.text.match(/\n/g)?.length ?? 0),
      0
    );
    visualGroups?.push({
      fromRow,
      toRow: outputRow + 1,
      inlineAlignment: rendered.inlineAlignment,
    });
    sourceHasBlankLine = false;
  }
  return output;
};

const createParser = (
  extensions: readonly MarkdownSyntaxExtension[]
) => {
  const parser = new Marked({ gfm: true });
  for (const extension of extensions) {
    if (extension.marked) parser.use(extension.marked);
  }
  return parser;
};

const hasRecognizedToken = (
  source: string,
  extensions: readonly MarkdownSyntaxExtension[]
) => {
  const parser = createParser(extensions);
  const tokens = parser.lexer(source);
  if (parser.defaults.walkTokens) {
    parser.walkTokens(tokens, parser.defaults.walkTokens);
  }
  let recognized = false;
  parser.walkTokens(tokens, (token) => {
    if (
      RECOGNIZED_TOKEN_TYPES.has(token.type) ||
      !NON_SYNTAX_TOKEN_TYPES.has(token.type)
    ) {
      recognized = true;
    }
  });
  return recognized;
};

export const detectMarkdownText = (
  source: string,
  extensions: readonly MarkdownSyntaxExtension[] = []
) => hasRecognizedToken(source, extensions);

export const renderMarkdownWithExtensions = async (
  source: string,
  options: MarkdownRenderOptions = {},
  extensions: readonly MarkdownSyntaxExtension[] = []
): Promise<CharGraphRenderResult> => {
  const normalized = normalizeCharGraphSource(source);
  const parser = createParser(extensions);
  const context: RenderContext = {
    source: normalized.text,
    rules: { ...DEFAULT_RULES, ...(options.rules ?? {}) },
    styles: options.styles ?? {},
    diagnostics: [],
    extensionRules: options.extensionRules ?? {},
    extensionStyles: options.extensionStyles ?? {},
    codeTheme: options.codeTheme,
    extensions,
  };
  const tokens = parser.lexer(normalized.text);
  if (parser.defaults.walkTokens) {
    await Promise.all(parser.walkTokens(tokens, parser.defaults.walkTokens));
  }
  const visualGroups: CharGraphVisualGroup[] = [];
  const fragments = await renderBlocks(
    tokens,
    { from: 0, to: normalized.text.length },
    context,
    true,
    visualGroups
  );
  return restoreCharGraphSourceRanges(normalized, {
    fragments,
    recognized: options.forced === true || hasRecognizedToken(
      normalized.text,
      extensions
    ),
    diagnostics: context.diagnostics,
    visualGroups,
  });
};

export const createMarkdownRenderer = (
  options: CreateMarkdownRendererOptions = {}
) => {
  const extensions = [...(options.extensions ?? [])];
  return defineCharGraphRenderer<MarkdownRenderOptions>({
    id: "markdown",
    render: (source, renderOptions) => renderMarkdownWithExtensions(
      source,
      renderOptions,
      extensions
    ),
  });
};
