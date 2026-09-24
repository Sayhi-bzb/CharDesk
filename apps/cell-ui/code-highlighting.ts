import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHighlighter } from "shiki";
import { createCssVariablesTheme } from "shiki/core";
import type { Plugin } from "vite";

type CodeToken = Readonly<{ content: string; color?: string; bold?: boolean }>;

const virtualId = "virtual:gallery-code-tokens";
const resolvedId = `\0${virtualId}`;
const contentPath = path.join(import.meta.dirname, "src/docs-content.ts");
const boldFontStyle = 1 << 1; // TextMate FontStyle.Bold
const baseTheme = createCssVariablesTheme({ name: "gallery-code", variablePrefix: "--gallery-code-" });
const theme = {
  ...baseTheme,
  tokenColors: [
    ...(baseTheme.tokenColors ?? []),
    { scope: ["keyword.control", "storage.type", "storage.modifier", "entity.name.tag.tsx"], settings: { fontStyle: "bold" } },
  ],
};

export async function tokenizeCode(codes: readonly string[]): Promise<Record<string, readonly CodeToken[]>> {
  const highlighter = await createHighlighter({ langs: ["tsx"], themes: [theme] });
  return Object.fromEntries([...new Set(codes)].map((code) => {
    const { tokens } = highlighter.codeToTokens(code, { lang: "tsx", theme: "gallery-code" });
    const flattened = tokens.flatMap((line, index): CodeToken[] => [
      ...line.map(({ content, color, fontStyle }) => ({
        content,
        color,
        ...((fontStyle ?? 0) & boldFontStyle ? { bold: true } : {}),
      })),
      ...(index < tokens.length - 1 ? [{ content: "\n" }] : []),
    ]);
    return [code, flattened];
  }));
}

export function galleryCodeHighlighting(): Plugin {
  return {
    name: "gallery-code-highlighting",
    resolveId(id) { return id === virtualId ? resolvedId : undefined; },
    async load(id) {
      if (id !== resolvedId) return undefined;
      const { componentContent, guideContent, publicUsage } = await import(
        `${pathToFileURL(contentPath).href}?revision=${Date.now()}`
      ) as typeof import("./src/docs-content.ts");
      const codes = [
        ...componentContent.map(({ usage }) => publicUsage(usage)),
        ...guideContent.flatMap((guide) => guide.sections
          .filter((section) => section.code && !(guide.slug === "installation" && section.id === "command"))
          .map((section) => section.code!)),
      ];
      return `export default ${JSON.stringify(await tokenizeCode(codes))};`;
    },
    handleHotUpdate(context) {
      if (context.file !== contentPath) return;
      const module = context.server.moduleGraph.getModuleById(resolvedId);
      if (!module) return;
      context.server.moduleGraph.invalidateModule(module);
      return [...context.modules, module];
    },
  };
}
