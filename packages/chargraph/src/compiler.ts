import {
  decodeCharDeskTextRuns,
  layoutCharDeskTextRunsToRows,
  materializeCharDeskTextRows,
  type CharDeskTextRow,
  type CharDeskAnsiEvidence,
  type CharDeskTextDiagnostic,
  type CharDeskTextStyle,
  type ParsedCharDeskText,
} from "@chardesk/protocol";
import { createCharGraphFragment } from "./fragments.js";
import type { CharGraphDiagnostic, CharGraphFragment } from "./model.js";
import {
  renderCharGraphText,
  type CharGraphTextRenderOptions,
  type CharGraphTextRendererId,
} from "./text.js";

export type CharDeskSourceKind = "chargraph" | "chardesk" | "ansi" | "plain";

export type CharDeskTextCompilerId =
  | CharGraphTextRendererId
  | "chardesk"
  | "plain";

export type CompileCharDeskTextOptions = Omit<
  CharGraphTextRenderOptions,
  "mode"
> & {
  sourceKind: CharDeskSourceKind;
  chargraphMode?: CharGraphTextRenderOptions["mode"];
  defaultStyle?: CharDeskTextStyle;
  pipelineDefaultStyles?: Partial<
    Record<CharDeskTextCompilerId, CharDeskTextStyle>
  >;
  tabSize?: number;
};

export type CompiledCharDeskText = {
  sourceKind: CharDeskSourceKind;
  renderer: CharDeskTextCompilerId;
  pipeline: readonly CharDeskTextCompilerId[];
  fragments: CharGraphFragment[];
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
  sourceKind: Exclude<CharDeskSourceKind, "chargraph">,
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
  const decoded = decodeCharDeskTextRuns(source, { syntax: "ansi" });
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
  options: CompileCharDeskTextOptions,
): Promise<CompiledCharDeskText> => {
  const rendered = options.sourceKind === "chargraph"
    ? await renderCharGraphText(source, {
        mode: options.chargraphMode,
        markdown: options.markdown,
        layout: options.layout,
      })
    : compileProtocolSource(source, options.sourceKind);
  const pipelineDefaultStyle = [...rendered.pipeline]
    .reverse()
    .map((renderer) => options.pipelineDefaultStyles?.[renderer])
    .find((style) => style !== undefined);
  const document = layoutCharDeskTextRunsToRows(rendered.fragments, {
    defaultStyle: pipelineDefaultStyle ?? options.defaultStyle,
    tabSize: options.tabSize,
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
    sourceKind: options.sourceKind,
    renderer: rendered.renderer,
    pipeline: rendered.pipeline,
    fragments: rendered.fragments.map((fragment) => ({ ...fragment })),
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

export const materializeCompiledCharDeskText = (
  compiled: CompiledCharDeskText,
): ParsedCharDeskText => ({
  version: 1,
  source: compiled.fragments.map((fragment) => fragment.text).join(""),
  plainText: compiled.plainText,
  width: compiled.width,
  height: compiled.height,
  cells: materializeCharDeskTextRows(compiled.rows),
  hasAnsi: compiled.hasAnsi,
  ansiEvidence: compiled.ansiEvidence,
  diagnostics: compiled.protocolDiagnostics.map((diagnostic) => ({ ...diagnostic })),
});
