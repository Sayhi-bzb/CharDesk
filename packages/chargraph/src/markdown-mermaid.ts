import { createCharGraphFragment } from "./fragments.js";
import {
  type MarkdownSyntaxExtension,
} from "./markdown-extension.js";
import { renderMermaid } from "./mermaid.js";
import { MERMAID_STYLE_ROLES } from "./mermaid-style.js";

export const MARKDOWN_MERMAID_STYLE_ROLES = MERMAID_STYLE_ROLES.map(
  (role) => `mermaid.${role}` as const
);
type MarkdownMermaidStyleRole =
  typeof MARKDOWN_MERMAID_STYLE_ROLES[number];

const MAX_SOURCE_LENGTH = 20_000;
const MAX_SOURCE_LINES = 400;

const fallback = (
  rawSource: string,
  rawOrigin: { from: number; to: number },
  message: string
) => {
  const text = rawSource.replace(/\n$/, "");
  return {
    fragments: [createCharGraphFragment(text, {}, {
      from: rawOrigin.from,
      to: rawOrigin.from + text.length,
    })],
    recognized: true,
    diagnostics: [{
      code: "markdown-mermaid-render-failed",
      message,
      offset: rawOrigin.from,
      length: rawOrigin.to - rawOrigin.from,
    }],
  };
};

export const markdownMermaidExtension: MarkdownSyntaxExtension<
  MarkdownMermaidStyleRole
> = {
  id: "mermaid",
  fencedLanguages: ["mermaid"],
  async render(request, context) {
    if (request.kind !== "fenced-code") return null;
    if (!context.enabled("mermaid")) {
      return {
        fragments: [createCharGraphFragment(
          request.source,
          {},
          request.sourceOrigin
        )],
        recognized: true,
        diagnostics: [],
      };
    }
    const lineCount = request.source === ""
      ? 0
      : request.source.split("\n").length;
    if (
      request.source.length > MAX_SOURCE_LENGTH ||
      lineCount > MAX_SOURCE_LINES
    ) {
      return fallback(
        request.rawSource,
        request.rawOrigin,
        "Mermaid source preserved: diagram exceeds the 20000-character or 400-line limit."
      );
    }
    const diagram = await renderMermaid(request.source, {
      styles: Object.fromEntries(MERMAID_STYLE_ROLES.flatMap((role) => {
        const style = context.style(`mermaid.${role}`);
        return style ? [[role, style]] : [];
      })),
    });
    if (diagram.diagnostics[0]) {
      return fallback(
        request.rawSource,
        request.rawOrigin,
        diagram.diagnostics[0].message
      );
    }
    return {
      fragments: diagram.fragments.map((fragment) => ({
        ...fragment,
        origin: request.sourceOrigin,
      })),
      recognized: true,
      diagnostics: [],
      preferredInlineAlignment: "center",
    };
  },
};
