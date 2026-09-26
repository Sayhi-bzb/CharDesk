import { createCssVariablesTheme, createHighlighterCoreSync } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import tsx from "@shikijs/langs/tsx";
import json from "@shikijs/langs/json";
import bash from "@shikijs/langs/bash";

export type MarkdownCodeRole = "codeKey" | "codeValue" | "codeCommand" | "codeComment";
export type MarkdownSyntaxToken = Readonly<{ content: string; role?: MarkdownCodeRole }>;

const languageName = (value: string | undefined): "tsx" | "json" | "bash" | null => {
  const name = value?.trim().split(/\s+/u)[0]?.toLowerCase();
  if (name === "json") return name;
  if (name === "tsx" || name === "ts" || name === "typescript"
    || name === "jsx" || name === "js" || name === "javascript") return "tsx";
  if (name === "bash" || name === "sh" || name === "shell" || name === "shellscript") return "bash";
  return null;
};

const roleForColor = (color: string | undefined): MarkdownCodeRole | undefined => {
  if (color === "var(--cell-code-token-keyword)") return "codeKey";
  if (color === "var(--cell-code-token-constant)" || color === "var(--cell-code-token-function)") return "codeCommand";
  if (color === "var(--cell-code-token-string)" || color === "var(--cell-code-token-string-expression)") return "codeValue";
  if (color === "var(--cell-code-token-comment)") return "codeComment";
  return undefined;
};

const cache = new Map<string, readonly (readonly MarkdownSyntaxToken[])[]>();
const CACHE_LIMIT = 64;
let highlighter: ReturnType<typeof createHighlighterCoreSync> | undefined;

export const highlightMarkdownCode = (
  code: string,
  language: string | undefined,
): readonly (readonly MarkdownSyntaxToken[])[] | undefined => {
  const lang = languageName(language);
  if (!lang) return undefined;
  const key = `${lang}\0${code}`;
  const cached = cache.get(key);
  if (cached) return cached;
  // Shiki variables classify tokens; CellUiTheme resolves their colors at paint time.
  highlighter ??= createHighlighterCoreSync({
    themes: [createCssVariablesTheme({ name: "cell-code", variablePrefix: "--cell-code-" })],
    langs: [...tsx, ...json, ...bash],
    engine: createJavaScriptRegexEngine(),
  });
  const lines = code.split("\n");
  const tokens = highlighter.codeToTokens(code, { lang, theme: "cell-code" }).tokens;
  const result = lines.map((line, index): readonly MarkdownSyntaxToken[] => {
    const parts = (tokens[index] ?? [])
      .map(({ content, color }) => ({ content, role: roleForColor(color) }));
    return parts.map(({ content }) => content).join("") === line ? parts : [{ content: line }];
  });
  cache.set(key, result);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return result;
};
