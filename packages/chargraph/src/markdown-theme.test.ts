import { describe, expect, it } from "vitest";
import {
  CHARDESK_DARK_RENDER_THEME,
  CHARDESK_LIGHT_RENDER_THEME,
  CHARDESK_MARKDOWN_COLOR_DEFAULTS,
  createCharDeskMarkdownRenderOptions,
  createCharDeskMarkdownStyles,
} from "./markdown-theme.js";
import {
  CHARDESK_MARKDOWN_EXTENSIONS,
  CHARDESK_MARKDOWN_FEATURES,
  CHARDESK_MARKDOWN_MODULES,
} from "./markdown-modules.js";
import { renderMarkdown } from "./markdown-default.js";
import { compileCharDeskText } from "./compiler.js";
import {
  createCharDeskMermaidStyles,
  MERMAID_STYLE_ROLES,
} from "./mermaid-style.js";

describe("CharDesk Markdown theme", () => {
  it("derives extensions, features, and rule options from the module registry", () => {
    expect(CHARDESK_MARKDOWN_FEATURES).toEqual(
      CHARDESK_MARKDOWN_MODULES.flatMap((module) => module.features)
    );
    expect(CHARDESK_MARKDOWN_EXTENSIONS).toEqual(
      CHARDESK_MARKDOWN_MODULES.flatMap((module) =>
        "extensions" in module ? module.extensions : []
      )
    );

    const options = createCharDeskMarkdownRenderOptions({
      features: {
        strong: { enabled: false, colors: {} },
        "inline-math": { enabled: false, colors: {} },
      },
    });
    expect(options.rules?.strong).toBe(false);
    expect(options.extensionRules?.["inline-math"]).toBe(false);
  });

  it("maps the shared light theme to core and extension roles", () => {
    const result = createCharDeskMarkdownStyles();

    expect(result.styles.link).toEqual({
      color: CHARDESK_LIGHT_RENDER_THEME.link,
      attrs: { underline: true },
    });
    expect(result.styles["inline-code"]?.bgColor)
      .toBe(CHARDESK_LIGHT_RENDER_THEME.surface);
    expect(result.extensionStyles["json-tree-key"]?.color)
      .toBe(CHARDESK_LIGHT_RENDER_THEME.accent);
    expect(result.extensionStyles["json-tree-string"]?.color)
      .toBe(CHARDESK_LIGHT_RENDER_THEME.success);
    expect(result.extensionStyles["yaml-tree-reference"]?.color)
      .toBe(CHARDESK_LIGHT_RENDER_THEME.info);
    expect(result.extensionStyles["math-content"]?.color).toBeUndefined();
    expect(result.extensionStyles["math-operator"]?.color)
      .toBe(CHARDESK_LIGHT_RENDER_THEME.accent);
    expect(result.extensionStyles["math-structure"]?.color)
      .toBe(CHARDESK_LIGHT_RENDER_THEME["muted-foreground"]);
    expect(result.extensionStyles["math-error"]?.color)
      .toBe(CHARDESK_LIGHT_RENDER_THEME.danger);
  });

  it.each([
    ["light", CHARDESK_LIGHT_RENDER_THEME],
    ["dark", CHARDESK_DARK_RENDER_THEME],
  ] as const)("colors Auto bold text with the %s theme accent", async (_mode, theme) => {
    const result = await compileCharDeskText("正文 **重点** 后文", {
      format: "auto",
      markdown: createCharDeskMarkdownRenderOptions({ theme }),
    });

    expect(result.plainText).toBe("正文 重点 后文");
    expect(result.fragments.find((part) => part.text === "重点"))
      .toMatchObject({ color: theme.accent, attrs: { bold: true } });
    expect(result.fragments.find((part) => part.text.includes("正文"))?.color)
      .toBeUndefined();
  });

  it.each(["auto", "markdown"] as const)(
    "keeps the unconfigured %s entry point consistent with the shared semantic styles",
    async (format) => {
      const result = await compileCharDeskText("正文 **重点** [文档](https://example.com) `code`", { format });

      expect(result.fragments.find((part) => part.text === "重点"))
        .toMatchObject({
          color: CHARDESK_LIGHT_RENDER_THEME.accent,
          attrs: { bold: true },
        });
      expect(result.fragments.find(part => part.text === "文档"))
        .toMatchObject({ color: CHARDESK_LIGHT_RENDER_THEME.link, attrs: { underline: true } });
      expect(result.fragments.find(part => part.text === "code"))
        .toMatchObject({ color: CHARDESK_LIGHT_RENDER_THEME.code, bgColor: CHARDESK_LIGHT_RENDER_THEME.surface });
    }
  );

  it.each([
    ["light", CHARDESK_LIGHT_RENDER_THEME],
    ["dark", CHARDESK_DARK_RENDER_THEME],
  ] as const)("distinguishes emphasis, navigation, code, and structure in the %s theme", async (_mode, theme) => {
    const result = await compileCharDeskText([
      "# Overview", "", "**Important** [Open docs](https://example.com)", "",
      "Use `call()` here.", "", "| Column |", "| --- |", "| Value |", "", "1. Step",
    ].join("\n"), {
      format: "markdown",
      markdown: createCharDeskMarkdownRenderOptions({ theme }),
    });
    const strong = result.fragments.find(part => part.text === "Important");
    const link = result.fragments.find(part => part.text === "Open docs");
    const code = result.fragments.find(part => part.text === "call()");
    const heading = result.fragments.find(part => part.text === "Overview");
    const header = result.fragments.find(part => part.text.includes("Column"));

    expect(strong).toMatchObject({ color: theme.accent, attrs: { bold: true } });
    expect(link).toMatchObject({ color: theme.link, href: "https://example.com", attrs: { underline: true } });
    expect(code).toMatchObject({ color: theme.code, bgColor: theme.surface });
    expect(new Set([strong?.color, link?.color, code?.color]).size).toBe(3);
    expect(heading?.attrs?.bold).toBe(true);
    expect(heading?.color).toBeUndefined();
    expect(header).toMatchObject({ color: theme.foreground, bgColor: theme.surface, attrs: { bold: true } });
    expect(result.fragments.find(part => part.text === "# ")?.color).toBe(theme["muted-foreground"]);
    expect(result.fragments.find(part => part.text.includes("1."))?.color).toBe(theme["muted-foreground"]);
  });

  it("applies feature slot overrides without changing fixed attributes", () => {
    const result = createCharDeskMarkdownStyles({
      colors: {
        strong: { foreground: "#123456" },
        "json-tree": { key: "#654321" },
        "math-style": { operator: "#abcdef" },
      },
    });

    expect(result.styles.strong).toEqual({
      color: "#123456",
      attrs: { bold: true },
    });
    expect(result.extensionStyles["json-tree-key"]?.color).toBe("#654321");
    expect(result.extensionStyles["math-operator"]?.color).toBe("#abcdef");
  });

  it("owns every color default used by the shared style factory", () => {
    expect(CHARDESK_MARKDOWN_COLOR_DEFAULTS["json-tree"].connector)
      .toEqual({ kind: "token", token: "border-subtle" });
    expect(CHARDESK_MARKDOWN_COLOR_DEFAULTS.list.marker)
      .toEqual({ kind: "token", token: "muted-foreground" });
  });

  it("adapts the shared Mermaid styles into Markdown extension roles", () => {
    const markdown = createCharDeskMarkdownStyles();
    const mermaid = createCharDeskMermaidStyles();

    for (const role of MERMAID_STYLE_ROLES) {
      expect(markdown.extensionStyles[`mermaid.${role}`])
        .toEqual(mermaid[role]);
    }
  });

  it("maps MathML semantics to the shared Math palette", async () => {
    const rendered = await renderMarkdown(
      String.raw`$x+1$`,
      createCharDeskMarkdownStyles()
    );
    const identifier = rendered.fragments.find((fragment) =>
      fragment.text.includes("x")
    );
    const operator = rendered.fragments.find((fragment) =>
      fragment.text.includes("+")
    );

    expect(identifier?.attrs?.italic).toBe(true);
    expect(operator?.color).toBe(CHARDESK_LIGHT_RENDER_THEME.accent);
  });

  it("keeps the previous per-layout Math foreground as a content fallback", async () => {
    const rendered = await renderMarkdown("$x$", {
      extensionStyles: { "inline-math": { color: "#123456" } },
    });

    expect(rendered.fragments.find((fragment) => fragment.text === "x"))
      .toMatchObject({ color: "#123456", attrs: { italic: true } });
  });

  it("uses the danger role for invalid math source", async () => {
    const rendered = await renderMarkdown(
      "$$\n\\frac{a\n$$",
      createCharDeskMarkdownStyles()
    );

    expect(rendered.fragments.every((fragment) =>
      fragment.color === CHARDESK_LIGHT_RENDER_THEME.danger
    )).toBe(true);
    expect(rendered.diagnostics[0]?.code).toBe("markdown-math-render-failed");
  });

  it("uses the renderer theme for fenced-code syntax colors", async () => {
    const theme = {
      ...CHARDESK_LIGHT_RENDER_THEME,
      foreground: "#111111",
      accent: "#aa0000",
      info: "#0000aa",
      success: "#00aa00",
      "muted-foreground": "#777777",
    };
    const themed = await renderMarkdown(
      "```ts\nconst answer = \"yes\" // note\n```",
      createCharDeskMarkdownStyles({ theme })
    );

    expect(themed.fragments.find((part) => part.text === "const")?.color?.toLowerCase())
      .toBe(theme.accent);
    expect(themed.fragments.find((part) => part.text === "answer")?.color?.toLowerCase())
      .toBe(theme.info);
    expect(themed.fragments.find((part) => part.text === "\"yes\"")?.color?.toLowerCase())
      .toBe(theme.success);
    expect(themed.fragments.find((part) => part.text === "// note")?.color?.toLowerCase())
      .toBe(theme["muted-foreground"]);
    expect(themed.fragments.some((part) => part.color?.startsWith("var(")))
      .toBe(false);

    const secondTheme = { ...theme, accent: "#bb0000" };
    const rethemed = await renderMarkdown(
      "```ts\nconst answer = 1\n```",
      createCharDeskMarkdownStyles({ theme: secondTheme })
    );
    expect(rethemed.fragments.find((part) => part.text === "const")?.color?.toLowerCase())
      .toBe(secondTheme.accent);

    const fallback = await renderMarkdown("```ts\nconst answer = 1\n```");
    expect(fallback.fragments.find((part) => part.text === "const")?.color?.toLowerCase())
      .not.toBe(theme.accent);
  });
});
