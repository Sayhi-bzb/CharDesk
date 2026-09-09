import {
  decodeCharDeskTextRuns,
  type CharDeskTextAttributes,
  type CharDeskTextRun,
  type CharDeskTextStyle,
} from "@chardesk/protocol";
import {
  parseBlockLayout,
  renderBlockLayoutDocument,
  type BlockLayoutBlock,
  type BlockLayoutRenderOptions,
} from "./block-layout.js";
import { createCharGraphFragment } from "./fragments.js";
import { createMarkdownRenderer, type MarkdownRenderOptions } from "./markdown.js";
import { CHARDESK_MARKDOWN_EXTENSIONS } from "./markdown-modules.js";
import type {
  CharGraphDiagnostic,
  CharGraphFragment,
  CharGraphRenderResult,
} from "./model.js";

export type CharGraphTextMode = "auto" | "raw" | "ansi" | "markdown";

export type CharGraphBlockLayoutOptions = BlockLayoutRenderOptions & {
  /** Controls which parsed boundary evidence activates layout composition. */
  activation?: "field-boundary" | "any-boundary";
};

export type CharGraphTextRenderOptions = {
  mode?: CharGraphTextMode;
  markdown?: MarkdownRenderOptions;
  layout?: false | CharGraphBlockLayoutOptions;
};

export type CharGraphTextRendererId = Exclude<CharGraphTextMode, "auto"> | "block-layout";

export type CharGraphTextRenderResult = CharGraphRenderResult & {
  renderer: CharGraphTextRendererId;
  pipeline: readonly CharGraphTextRendererId[];
};

type StyleSpan = CharDeskTextStyle & {
  from: number;
  to: number;
  href?: string;
};

const DEFAULT_MARKDOWN_OPTIONS: MarkdownRenderOptions = {
  styles: {
    strong: { attrs: { bold: true } },
    emphasis: { attrs: { italic: true } },
    strikethrough: { attrs: { strike: true } },
    link: { attrs: { underline: true } },
    "heading-1": { attrs: { bold: true, underline: true } },
    "heading-2": { attrs: { bold: true } },
    "heading-3": { attrs: { bold: true, italic: true } },
    "heading-4": { attrs: { italic: true } },
  },
};

const textMarkdownRenderer = createMarkdownRenderer({
  extensions: CHARDESK_MARKDOWN_EXTENSIONS,
});

const resolveMarkdownOptions = (
  options: MarkdownRenderOptions | undefined,
  forced: boolean
): MarkdownRenderOptions => ({
  ...DEFAULT_MARKDOWN_OPTIONS,
  ...options,
  ...(forced ? { forced: true } : {}),
  rules: { ...DEFAULT_MARKDOWN_OPTIONS.rules, ...options?.rules },
  extensionRules: {
    ...DEFAULT_MARKDOWN_OPTIONS.extensionRules,
    ...options?.extensionRules,
  },
  styles: { ...DEFAULT_MARKDOWN_OPTIONS.styles, ...options?.styles },
  extensionStyles: {
    ...DEFAULT_MARKDOWN_OPTIONS.extensionStyles,
    ...options?.extensionStyles,
  },
});

const sameAttrs = (
  left?: CharDeskTextAttributes,
  right?: CharDeskTextAttributes
) =>
  left?.bold === right?.bold &&
  left?.italic === right?.italic &&
  left?.underline === right?.underline &&
  left?.strike === right?.strike &&
  left?.inverse === right?.inverse;

const mergeStyles = (
  semantic: CharDeskTextStyle & { href?: string },
  explicit: CharDeskTextStyle & { href?: string }
) => ({
  ...((explicit.color ?? semantic.color)
    ? { color: explicit.color ?? semantic.color }
    : {}),
  ...((explicit.bgColor ?? semantic.bgColor)
    ? { bgColor: explicit.bgColor ?? semantic.bgColor }
    : {}),
  ...((semantic.attrs || explicit.attrs)
    ? { attrs: { ...(semantic.attrs ?? {}), ...(explicit.attrs ?? {}) } }
    : {}),
  ...((explicit.href ?? semantic.href)
    ? { href: explicit.href ?? semantic.href }
    : {}),
});

const pushRun = (
  runs: CharGraphFragment[],
  text: string,
  style: CharDeskTextStyle & { href?: string },
  origin?: { from: number; to: number }
) => {
  if (!text) return;
  const previous = runs.at(-1);
  if (
    previous &&
    previous.color === style.color &&
    previous.bgColor === style.bgColor &&
    previous.href === style.href &&
    sameAttrs(previous.attrs, style.attrs) &&
    previous.origin?.to === origin?.from
  ) {
    previous.text += text;
    if (origin && previous.origin) previous.origin.to = origin.to;
    return;
  }
  runs.push(createCharGraphFragment(text, style, origin, style.href));
};

const spansFromRuns = (runs: readonly CharDeskTextRun[]): StyleSpan[] => {
  const spans: StyleSpan[] = [];
  let offset = 0;
  for (const run of runs) {
    const from = offset;
    offset += run.text.length;
    if (!run.color && !run.bgColor && !run.attrs && !run.href) continue;
    spans.push({
      from,
      to: offset,
      ...(run.color ? { color: run.color } : {}),
      ...(run.bgColor ? { bgColor: run.bgColor } : {}),
      ...(run.attrs ? { attrs: { ...run.attrs } } : {}),
      ...(run.href ? { href: run.href } : {}),
    });
  }
  return spans;
};

const styleAt = (spans: readonly StyleSpan[], offset: number) => {
  let style: CharDeskTextStyle & { href?: string } = {};
  for (const span of spans) {
    if (span.from > offset || span.to <= offset) continue;
    style = mergeStyles(style, span);
  }
  return style;
};

const composeFragments = (
  spans: readonly StyleSpan[],
  fragments: readonly CharGraphFragment[]
) => {
  const runs: CharGraphFragment[] = [];
  for (const fragment of fragments) {
    const semantic = {
      ...(fragment.color ? { color: fragment.color } : {}),
      ...(fragment.bgColor ? { bgColor: fragment.bgColor } : {}),
      ...(fragment.attrs ? { attrs: { ...fragment.attrs } } : {}),
      ...(fragment.href ? { href: fragment.href } : {}),
    };
    const origin = fragment.origin;
    if (!origin || origin.to - origin.from !== fragment.text.length) {
      pushRun(
        runs,
        fragment.text,
        mergeStyles(semantic, origin ? styleAt(spans, origin.from) : {}),
        origin
      );
      continue;
    }
    const boundaries = new Set([origin.from, origin.to]);
    for (const span of spans) {
      const from = Math.max(origin.from, span.from);
      const to = Math.min(origin.to, span.to);
      if (from < to) {
        boundaries.add(from);
        boundaries.add(to);
      }
    }
    const sorted = [...boundaries].sort((left, right) => left - right);
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const from = sorted[index]!;
      const to = sorted[index + 1]!;
      pushRun(
        runs,
        fragment.text.slice(from - origin.from, to - origin.from),
        mergeStyles(semantic, styleAt(spans, from)),
        { from, to }
      );
    }
  }
  return runs;
};

const rawResult = (source: string): CharGraphTextRenderResult => ({
  fragments: [createCharGraphFragment(source, {}, { from: 0, to: source.length })],
  recognized: false,
  diagnostics: [],
  renderer: "raw",
  pipeline: ["raw"],
});

const renderScalarText = async (
  source: string,
  options: CharGraphTextRenderOptions
): Promise<CharGraphTextRenderResult> => {
  const mode = options.mode ?? "auto";
  if (mode === "raw") return rawResult(source);

  const decoded = decodeCharDeskTextRuns(source, {
    syntax: mode === "ansi" ? "ansi" : "auto",
  });
  const hasAnsi = decoded.hasAnsi && (
    mode === "ansi" || decoded.ansiEvidence === "explicit"
  );
  const diagnostics: CharGraphDiagnostic[] = hasAnsi
    ? decoded.diagnostics.map((item) => ({ ...item }))
    : [];
  const decodedText = hasAnsi ? decoded.text : source;
  const ansiSpans = hasAnsi ? spansFromRuns(decoded.runs) : [];

  if (mode !== "ansi") {
    const markdown = await textMarkdownRenderer.render(
      decodedText,
      resolveMarkdownOptions(options.markdown, mode === "markdown")
    );
    if (markdown.recognized) {
      return {
        ...markdown,
        fragments: hasAnsi
          ? composeFragments(ansiSpans, markdown.fragments)
          : markdown.fragments,
        diagnostics: [...diagnostics, ...markdown.diagnostics],
        renderer: "markdown",
        pipeline: [...(hasAnsi ? ["ansi" as const] : []), "markdown"],
      };
    }
  }

  if (!hasAnsi) return rawResult(source);
  return {
    fragments: decoded.runs.map((run) => createCharGraphFragment(
      run.text,
      run,
      undefined,
      run.href
    )),
    recognized: true,
    diagnostics,
    renderer: "ansi",
    pipeline: ["ansi"],
  };
};

const renderLayoutField = (
  block: BlockLayoutBlock,
  options: CharGraphTextRenderOptions
) => {
  const protectsBoundary = Boolean(block.protectedSource) &&
    options.mode !== "raw" && options.mode !== "ansi";
  return renderScalarText(
    protectsBoundary ? block.protectedSource! : block.source,
    protectsBoundary && (options.mode ?? "auto") === "auto"
      ? { ...options, mode: "markdown" }
      : options
  );
};

export const renderCharGraphText = async (
  source: string,
  options: CharGraphTextRenderOptions = {}
): Promise<CharGraphTextRenderResult> => {
  if (options.layout !== false) {
    const parsed = parseBlockLayout(source);
    const {
      activation = "field-boundary",
      ...renderOptions
    } = options.layout ?? {};
    const layoutActivated = activation === "any-boundary"
      ? parsed.recognized
      : parsed.boundaries.fields > 0;
    if (parsed.document && layoutActivated) {
      const rendered = await renderBlockLayoutDocument(
        parsed.document,
        (block) => renderLayoutField(block, options),
        renderOptions
      );
      return {
        ...rendered,
        recognized: true,
        renderer: "block-layout",
        pipeline: ["block-layout"],
      };
    }
  }
  return renderScalarText(source, options);
};
