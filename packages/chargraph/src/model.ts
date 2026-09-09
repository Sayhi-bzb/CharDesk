import type { CharDeskTextRun } from "@chardesk/protocol";

export type CharGraphAwaitable<T> = T | Promise<T>;

export type CharGraphSourceRange = { from: number; to: number };

export type CharGraphInlineAlignment = "start" | "center" | "end";

export type CharGraphVisualGroup = {
  /** Inclusive output row containing the group's first mark. */
  fromRow: number;
  /** Exclusive output row after the group's last mark. */
  toRow: number;
  /** Placement requested by the group producer when embedded in a wider field. */
  inlineAlignment: CharGraphInlineAlignment;
};

export type CharGraphFragment = CharDeskTextRun & {
  origin?: CharGraphSourceRange;
};

export type CharGraphDiagnostic = {
  code: string;
  message: string;
  offset?: number;
  length?: number;
};

export type CharGraphRenderResult = {
  fragments: CharGraphFragment[];
  recognized: boolean;
  diagnostics: CharGraphDiagnostic[];
  /** Preferred placement when this complete result is embedded by another renderer. */
  preferredInlineAlignment?: CharGraphInlineAlignment;
  /** Top-level visual units with explicit placement intent. */
  visualGroups?: CharGraphVisualGroup[];
};

export interface CharGraphRenderer<TOptions = undefined> {
  readonly id: string;
  render(
    source: string,
    options?: TOptions
  ): CharGraphAwaitable<CharGraphRenderResult>;
}

export const defineCharGraphRenderer = <TOptions = undefined>(
  renderer: CharGraphRenderer<TOptions>
): CharGraphRenderer<TOptions> => renderer;

export const renderCharGraph = async <TOptions>(
  source: string,
  renderer: CharGraphRenderer<TOptions>,
  options?: TOptions
): Promise<CharGraphRenderResult> => {
  const rendered = await renderer.render(source, options);
  return {
    ...rendered,
    fragments: rendered.fragments.map((fragment) => ({
      ...fragment,
      text: fragment.text.replace(/\r\n?/g, "\n"),
    })),
  };
};
