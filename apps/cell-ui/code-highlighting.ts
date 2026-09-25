import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHighlighter } from "shiki";
import { createCssVariablesTheme } from "shiki/core";
import type { Plugin } from "vite";

type CodeToken = Readonly<{ content: string; color?: string; bold?: boolean }>;
export type InstallationCodeRole = "key" | "value" | "command";
export type InstallationCodeToken = Readonly<{ content: string; role?: InstallationCodeRole }>;
type InstallationCode = Readonly<{ id: string; code: string; language: "json" | "bash" }>;

const virtualId = "virtual:gallery-code-tokens";
const resolvedId = `\0${virtualId}`;
const installationVirtualId = "virtual:gallery-installation-code-tokens";
const installationResolvedId = `\0${installationVirtualId}`;
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

const installationRole = (color: string | undefined): InstallationCodeRole | undefined => {
  if (color === "var(--installation-code-token-keyword)") return "key";
  if (color === "var(--installation-code-token-function)") return "command";
  if (color === "var(--installation-code-token-string)"
    || color === "var(--installation-code-token-string-expression)") return "value";
  return undefined;
};

export async function tokenizeInstallationCode(codes: readonly InstallationCode[]): Promise<
  Record<string, readonly (readonly InstallationCodeToken[])[]>
> {
  const syntaxTheme = createCssVariablesTheme({ name: "installation-code", variablePrefix: "--installation-code-" });
  const highlighter = await createHighlighter({ langs: ["json", "bash"], themes: [syntaxTheme] });
  return Object.fromEntries(codes.map(({ id, code, language }) => {
    const { tokens } = highlighter.codeToTokens(code, { lang: language, theme: "installation-code" });
    const lines = code.split("\n");
    return [id, lines.map((line, index) => {
      const parts = (tokens[index] ?? []).map(({ content, color }) => {
        const role = installationRole(color);
        return { content, ...(role ? { role } : {}) };
      });
      return parts.map(({ content }) => content).join("") === line ? parts : [{ content: line }];
    })];
  }));
}

export function galleryCodeHighlighting(): Plugin {
  return {
    name: "gallery-code-highlighting",
    resolveId(id) { return id === virtualId ? resolvedId : id === installationVirtualId ? installationResolvedId : undefined; },
    async load(id) {
      if (id !== resolvedId && id !== installationResolvedId) return undefined;
      const { componentContent, guideContent, publicUsage } = await import(
        `${pathToFileURL(contentPath).href}?revision=${Date.now()}`
      ) as typeof import("./src/docs-content.ts");
      if (id === installationResolvedId) {
        const installation = guideContent.find((guide) => guide.slug === "installation")!;
        const codes = installation.sections.filter((section) => section.code).map((section): InstallationCode => ({
          id: section.id, code: section.code!, language: section.id === "configure" ? "json" : "bash",
        }));
        return `export default ${JSON.stringify(await tokenizeInstallationCode(codes))};`;
      }
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
      const modules = [resolvedId, installationResolvedId]
        .map((id) => context.server.moduleGraph.getModuleById(id))
        .filter((module) => module !== undefined);
      for (const module of modules) context.server.moduleGraph.invalidateModule(module);
      return [...context.modules, ...modules];
    },
  };
}
