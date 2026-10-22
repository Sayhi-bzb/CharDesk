import {
  decodeCharDeskTextRuns,
  layoutCharDeskTextRunsToRows,
  materializeCharDeskTextRows,
  type CharDeskTextRow,
  type CharDeskAnsiEvidence,
  type CharDeskTextDiagnostic,
  type CharDeskTextStyle,
  type CharDeskTextSyntax,
  type ParsedCharDeskText,
} from "@chardesk/protocol";
import { createCharGraphFragment } from "./fragments.js";
import type { CharGraphDiagnostic, CharGraphFragment, CharGraphHeading } from "./model.js";
import {
  renderCharGraphText,
  type CharGraphTextRenderOptions,
  type CharGraphTextRendererId,
} from "./text.js";

export type CharDeskSourceKind = "chargraph" | "chardesk" | "ansi" | "plain";
export type CharDeskTextFormat = "auto" | "plain" | "ansi" | "markdown" | "chardesk";

export type CharDeskTextCompilerId =
  | CharGraphTextRendererId
  | "chardesk"
  | "plain";

export type CompileCharDeskTextOptions = Omit<
  CharGraphTextRenderOptions,
  "mode"
> & {
  /** Legacy input name; explicit format takes precedence. */
  sourceKind?: CharDeskSourceKind;
  format?: CharDeskTextFormat | "raw";
  chargraphMode?: CharGraphTextRenderOptions["mode"];
  defaultStyle?: CharDeskTextStyle;
  pipelineDefaultStyles?: Partial<
    Record<CharDeskTextCompilerId, CharDeskTextStyle>
  >;
  tabSize?: number;
  /** Protocol-only compatibility policy, used by the Viewer's syntax attribute. */
  protocolSyntax?: CharDeskTextSyntax;
};

export type CharDeskTextRequest = Omit<CompileCharDeskTextOptions, "sourceKind" | "chargraphMode" | "format"> & {
  source: string;
  format: CharDeskTextFormat;
};

export const normalizeCharDeskTextRequest = (
  source: string,
  options: CompileCharDeskTextOptions = {},
): CharDeskTextRequest => {
  const { sourceKind, chargraphMode, format, ...renderOptions } = options;
  const selected = format ?? (sourceKind === "chargraph" || sourceKind === undefined
    ? chargraphMode ?? "auto"
    : sourceKind);
  return { ...renderOptions, source, format: selected === "raw" ? "plain" : selected };
};

export type CompiledCharDeskText = {
  source: string;
  sourceKind: CharDeskSourceKind;
  renderer: CharDeskTextCompilerId;
  pipeline: readonly CharDeskTextCompilerId[];
  fragments: CharGraphFragment[];
  headings: CharGraphHeading[];
  rows: CharDeskTextRow[];
  plainText: string;
  width: number;
  height: number;
  diagnostics: CharGraphDiagnostic[];
  protocolDiagnostics: CharDeskTextDiagnostic[];
  hasAnsi: boolean;
  ansiEvidence: CharDeskAnsiEvidence;
};

export class CharDeskTextCompileError extends Error {
  readonly code: "terminal-escape";

  constructor(code: "terminal-escape") {
    super("CharDesk files use visible ESC-less ANSI controls.");
    this.name = "CharDeskTextCompileError";
    this.code = code;
  }
}

const compileProtocolSource = (
  source: string,
  sourceKind: "plain" | "ansi" | "chardesk",
  syntax: CharDeskTextSyntax = "ansi",
) => {
  if (sourceKind === "chardesk" && source.includes("\u001b")) {
    throw new CharDeskTextCompileError("terminal-escape");
  }
  if (sourceKind === "plain") {
    return {
      fragments: [createCharGraphFragment(source)],
      diagnostics: [] as CharGraphDiagnostic[],
      renderer: "plain" as const,
      pipeline: ["plain" as const],
      hasAnsi: false,
      ansiEvidence: "none" as const,
    };
  }
  const decoded = decodeCharDeskTextRuns(source, { syntax });
  return {
    fragments: decoded.runs.map((run) => createCharGraphFragment(
      run.text,
      run,
      undefined,
      run.href,
    )),
    diagnostics: decoded.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    renderer: sourceKind,
    pipeline: [sourceKind],
    hasAnsi: decoded.hasAnsi,
    ansiEvidence: decoded.ansiEvidence,
  };
};

const isProtocolDiagnostic = (
  diagnostic: CharGraphDiagnostic
): diagnostic is CharGraphDiagnostic & CharDeskTextDiagnostic =>
  (diagnostic.code === "malformed-ansi" ||
    diagnostic.code === "unsupported-control" ||
    diagnostic.code === "unsupported-sgr") &&
  diagnostic.offset !== undefined &&
  diagnostic.length !== undefined;

export const compileCharDeskText = async (
  source: string,
  options: CompileCharDeskTextOptions = {},
): Promise<CompiledCharDeskText> => {
  const request = normalizeCharDeskTextRequest(source, options);
  const rendered = request.format === "auto" || request.format === "markdown"
    ? await renderCharGraphText(source, {
        mode: request.format,
        markdown: request.markdown,
      })
    : compileProtocolSource(source, request.format, request.protocolSyntax);
  return compileRenderedText(rendered, request);
};

type RenderedText = Awaited<ReturnType<typeof renderCharGraphText>> | ReturnType<typeof compileProtocolSource>;

const compileRenderedText = (
  rendered: RenderedText,
  request: CharDeskTextRequest,
): CompiledCharDeskText => {
  const pipelineDefaultStyle = [...rendered.pipeline]
    .reverse()
    .map((renderer) => request.pipelineDefaultStyles?.[renderer])
    .find((style) => style !== undefined);
  const document = layoutCharDeskTextRunsToRows(rendered.fragments, {
    defaultStyle: pipelineDefaultStyle ?? request.defaultStyle,
    tabSize: request.tabSize,
  });
  const renderedProtocolDiagnostics: CharDeskTextDiagnostic[] =
    rendered.diagnostics.flatMap((diagnostic) =>
      isProtocolDiagnostic(diagnostic)
        ? [{
            code: diagnostic.code,
            message: diagnostic.message,
            offset: diagnostic.offset,
            length: diagnostic.length,
          }]
        : []
    );
  const protocolDiagnostics = [
    ...renderedProtocolDiagnostics,
    ...document.diagnostics,
  ];
  return {
    source: request.source,
    sourceKind: request.format === "auto" || request.format === "markdown" ? "chargraph" : request.format,
    renderer: rendered.renderer,
    pipeline: rendered.pipeline,
    fragments: rendered.fragments.map((fragment) => ({ ...fragment })),
    headings: "headings" in rendered ? rendered.headings ?? [] : [],
    rows: document.rows,
    plainText: document.plainText,
    width: document.width,
    height: document.height,
    diagnostics: [
      ...rendered.diagnostics.map((diagnostic) => ({ ...diagnostic })),
      ...document.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    ],
    protocolDiagnostics,
    hasAnsi: "hasAnsi" in rendered
      ? rendered.hasAnsi
      : rendered.pipeline.includes("ansi"),
    ansiEvidence: "ansiEvidence" in rendered
      ? rendered.ansiEvidence
      : rendered.pipeline.includes("ansi") ? "explicit" : "none",
  };
};

/** Synchronous adapter for existing Protocol-only viewers; shares row compilation. */
export const compileCharDeskProtocolText = (
  source: string,
  options: Pick<CompileCharDeskTextOptions, "defaultStyle" | "pipelineDefaultStyles" | "tabSize" | "protocolSyntax"> & {
    format: "plain" | "ansi" | "chardesk";
  },
): CompiledCharDeskText => {
  const request = normalizeCharDeskTextRequest(source, options);
  return compileRenderedText(compileProtocolSource(source, options.format, options.protocolSyntax), request);
};

export const materializeCompiledCharDeskText = (
  compiled: CompiledCharDeskText,
): ParsedCharDeskText => ({
  version: 1,
  source: compiled.source,
  plainText: compiled.plainText,
  width: compiled.width,
  height: compiled.height,
  cells: materializeCharDeskTextRows(compiled.rows),
  hasAnsi: compiled.hasAnsi,
  ansiEvidence: compiled.ansiEvidence,
  diagnostics: compiled.protocolDiagnostics.map((diagnostic) => ({ ...diagnostic })),
});
