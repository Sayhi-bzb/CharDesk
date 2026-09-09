import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEXT_RENDER_PROFILE,
  TEXT_RENDER_PROFILE_STORAGE_KEY,
  TextRenderingRuntime,
} from "./runtime";
import { migrateLegacyFeatureSettings } from "./features";
import type { TextRenderProfile, TextRenderResult } from "./types";

const profileWithMarkdown = ({
  rules,
  colors,
  ...profile
}: Partial<TextRenderProfile> & {
  rules?: Record<string, boolean>;
  colors?: Record<string, string>;
} = {}): TextRenderProfile => ({
  ...DEFAULT_TEXT_RENDER_PROFILE,
  ...profile,
  features: migrateLegacyFeatureSettings(rules, colors),
});

const legacyStorage = (profile: unknown) => ({
  getItem: (key: string) =>
    key === "chardesk-text-render-profile-v1" ? JSON.stringify(profile) : null,
  setItem: () => undefined,
});

const textFrom = (result: TextRenderResult) =>
  result.kind === "plain"
    ? result.text
    : result.cells.map((cell) => cell.char).join("");

const rowText = (result: TextRenderResult, y: number) =>
  result.kind === "styled"
    ? result.cells
        .filter((cell) => cell.y === y)
        .sort((left, right) => left.x - right.x)
        .map((cell) => cell.char)
        .join("")
    : result.text.split("\n")[y] ?? "";

describe("TextRenderingRuntime", () => {
  it("renders large raw input as compact row spans", async () => {
    const runtime = new TextRenderingRuntime();
    runtime.setProfile({ ...DEFAULT_TEXT_RENDER_PROFILE, mode: "raw" });
    const result = await runtime.renderCompact(
      Array.from({ length: 1_000 }, () => "a".repeat(100)).join("\n"),
      "#fff"
    );

    expect(result.kind).toBe("spans");
    expect(result.kind === "spans" && result.rows).toHaveLength(1_000);
    expect(
      result.kind === "spans" &&
        result.rows.every((row) => row.spans.length === 1)
    ).toBe(true);
  });

  it("composes ANSI before Markdown in auto mode", async () => {
    const runtime = new TextRenderingRuntime();
    const result = await runtime.render("[1m**bold**[0m", "#fff");

    expect(result.renderer).toBe("markdown");
    expect(result.pipeline).toEqual(["ansi", "markdown"]);
    expect(textFrom(result)).toBe("bold");
    expect(result.kind === "styled" && result.cells[0]?.attrs?.bold).toBe(true);
  });

  it("does not let ambiguous ESC-less reset syntax steal Markdown links", async () => {
    const result = await new TextRenderingRuntime().render(
      "- [markdown.ts](/src/markdown.ts)",
      "#fff"
    );

    expect(result.renderer).toBe("markdown");
    expect(result.pipeline).toEqual(["markdown"]);
    expect(rowText(result, 0)).toBe("- markdown.ts");
    expect(
      result.kind === "styled" &&
        result.cells.find((cell) => cell.char === "m")?.href
    ).toBe("/src/markdown.ts");
  });

  it("composes explicit ANSI styles with Markdown structure", async () => {
    const result = await new TextRenderingRuntime().render(
      "[31m**red `code`**[0m",
      "#fff"
    );

    expect(result.pipeline).toEqual(["ansi", "markdown"]);
    expect(textFrom(result)).toBe("red code");
    if (result.kind !== "styled") throw new Error("Expected composed cells");
    expect(result.cells.every((cell) => cell.color === "#800000")).toBe(true);
    expect(result.cells.every((cell) => cell.attrs?.bold)).toBe(true);
  });

  it("maps explicit ANSI to the matching repeated Markdown source range", async () => {
    const result = await new TextRenderingRuntime().render(
      "foo **[31mfoo[0m** foo",
      "#111111"
    );

    expect(textFrom(result)).toBe("foo foo foo");
    if (result.kind !== "styled") throw new Error("Expected composed cells");
    expect(result.cells.filter((cell) => cell.x >= 4 && cell.x <= 6).every(
      (cell) => cell.color === "#800000"
    )).toBe(true);
    expect(result.cells.filter((cell) => cell.x < 4 || cell.x > 6).every(
      (cell) => cell.color === "#1f2328"
    )).toBe(true);
  });

  it("renders Markdown hard breaks as grid newlines without HTML leakage", async () => {
    const result = await new TextRenderingRuntime().render(
      "*First*  \n_Second_",
      "#111111"
    );

    expect(rowText(result, 0)).toBe("First");
    expect(rowText(result, 1)).toBe("Second");
    expect(textFrom(result)).not.toContain("<br>");
  });

  it("keeps explicit OSC 8 links over Markdown link destinations", async () => {
    const result = await new TextRenderingRuntime().render(
      "]8;;https://ansi.example\\[label](https://markdown.example)]8;;\\",
      "#fff"
    );

    expect(result.pipeline).toEqual(["ansi", "markdown"]);
    expect(textFrom(result)).toBe("label");
    expect(
      result.kind === "styled" && result.cells.every(
        (cell) => cell.href === "https://ansi.example"
      )
    ).toBe(true);
  });

  it("keeps ambiguous [m literal in Auto and consumes it in forced ANSI", async () => {
    const runtime = new TextRenderingRuntime();
    expect(await runtime.render("[mplain", "#fff")).toMatchObject({
      renderer: "raw",
      text: "[mplain",
    });

    runtime.setProfile({ ...DEFAULT_TEXT_RENDER_PROFILE, mode: "ansi" });
    expect(textFrom(await runtime.render("[mplain", "#fff"))).toBe("plain");
  });

  it("uses marked GFM to render supported inline Markdown", async () => {
    const runtime = new TextRenderingRuntime();
    const result = await runtime.render("**粗体** [link](https://example.com) ~~gone~~", "#fff");

    expect(result.renderer).toBe("markdown");
    expect(textFrom(result)).toBe("粗体 link gone");
    if (result.kind !== "styled") throw new Error("Expected styled Markdown cells");
    expect(result.cells.find((cell) => cell.char === "粗")?.attrs?.bold).toBe(true);
    expect(result.cells.find((cell) => cell.char === "l")?.href).toBe("https://example.com");
    expect(result.cells.find((cell) => cell.char === "g")?.attrs?.strike).toBe(true);
    expect(result.cells.find((cell) => cell.char === "体")?.x).toBe(2);
  });

  it("renders headings with Codex hierarchy", async () => {
    const runtime = new TextRenderingRuntime();
    const result = await runtime.render(
      "# H1\n## H2\n### H3\n#### H4",
      "#fff"
    );

    expect([0, 2, 4, 6].map((y) => rowText(result, y))).toEqual([
      "# H1",
      "## H2",
      "### H3",
      "#### H4",
    ]);
    if (result.kind !== "styled") throw new Error("Expected styled headings");
    expect(result.cells.find((cell) => cell.y === 0 && cell.char === "#")?.color).toBe(
      "#0969da"
    );
    expect(result.cells.find((cell) => cell.y === 0 && cell.char === "H")?.attrs).toEqual({
      bold: true,
      underline: true,
    });
    expect(result.cells.find((cell) => cell.y === 2 && cell.char === "H")?.attrs).toEqual({ bold: true });
    expect(result.cells.find((cell) => cell.y === 4 && cell.char === "H")?.attrs).toEqual({
      bold: true,
      italic: true,
    });
    expect(result.cells.find((cell) => cell.y === 6 && cell.char === "H")?.attrs).toEqual({ italic: true });
  });

  it("renders Codex inline code, compact links, quotes, lists, and rules", async () => {
    const runtime = new TextRenderingRuntime();
    const result = await runtime.render(
      "`code` [docs](https://example.com)\n\n> quote\n\n1. one\n2. two\n\n***",
      "#111111"
    );

    expect(rowText(result, 0)).toBe("code docs");
    expect(rowText(result, 2)).toBe("│ quote");
    expect(rowText(result, 4)).toBe("1. one");
    expect(rowText(result, 5)).toBe("2. two");
    expect(rowText(result, 7)).toBe("———");
    if (result.kind !== "styled") throw new Error("Expected styled Markdown");
    expect(result.cells.find((cell) => cell.char === "c")).toMatchObject({
      color: "#0969da",
      bgColor: "#f6f8fa",
    });
    expect(result.cells.find((cell) => cell.href === "https://example.com")).toMatchObject({
      color: "#0969da",
      href: "https://example.com",
      attrs: { underline: true },
    });
    expect(result.cells.find((cell) => cell.y === 2 && cell.char === "│")).toMatchObject({
      color: "#1a7f37",
    });
    expect(result.cells.find((cell) => cell.y === 2 && cell.char === "q")?.color).toBe(
      "#1f2328"
    );
    expect(result.cells.find((cell) => cell.y === 4 && cell.char === "1")).toMatchObject({
      color: "#0969da",
    });
  });

  it("applies independent colors to inline Markdown rules", async () => {
    const runtime = new TextRenderingRuntime();
    runtime.setProfile(profileWithMarkdown({
      colors: {
        "strong.foreground": "#ff0000",
        "emphasis.foreground": "#00ff00",
        "strikethrough.foreground": "#0000ff",
        "link.foreground": "#ffff00",
        "inline-code.foreground": "#ff00ff",
      },
    }));
    const result = await runtime.render(
      "**B** *I* ~~S~~ [L](https://example.com) `C`",
      "#111111"
    );

    if (result.kind !== "styled") throw new Error("Expected styled Markdown");
    const colorOf = (char: string) => result.cells.find((cell) => cell.char === char)?.color;
    expect(colorOf("B")).toBe("#ff0000");
    expect(colorOf("I")).toBe("#00ff00");
    expect(colorOf("S")).toBe("#0000ff");
    expect(colorOf("L")).toBe("#ffff00");
    expect(colorOf("C")).toBe("#ff00ff");
  });

  it("resolves theme tokens before rule overrides", async () => {
    const runtime = new TextRenderingRuntime();
    runtime.setProfile(profileWithMarkdown({
      renderThemes: {
        light: {
          accent: "#112233",
          info: "#223344",
          success: "#334455",
          surface: "#445566",
        },
        dark: {},
      },
      colors: { "heading.marker": "#abcdef" },
    }));
    const result = await runtime.render(
      "# Head\n\n> Quote\n\n`code` [link](https://example.com)",
      "#111111"
    );

    if (result.kind !== "styled") throw new Error("Expected styled Markdown");
    expect(result.cells.find((cell) => cell.y === 0 && cell.char === "#")?.color).toBe("#abcdef");
    expect(result.cells.find((cell) => cell.y === 2 && cell.char === "│")?.color).toBe("#334455");
    expect(result.cells.find((cell) => cell.y === 4 && cell.char === "c")).toMatchObject({
      color: "#223344",
      bgColor: "#445566",
    });
    expect(result.cells.find((cell) => cell.y === 4 && cell.char === "l")?.color).toBe("#223344");
  });

  it("keeps layout stable while materializing light and dark Markdown colors", async () => {
    const runtime = new TextRenderingRuntime();
    const source = "**Body** `code`";
    const light = await runtime.render(source, "#ff00ff", { themeMode: "light" });
    const dark = await runtime.render(source, "#ff00ff", { themeMode: "dark" });

    expect(textFrom(light)).toBe(textFrom(dark));
    if (light.kind !== "styled" || dark.kind !== "styled") {
      throw new Error("Expected styled Markdown");
    }
    expect(light.cells.find((cell) => cell.char === "B")?.color).toBe("#1f2328");
    expect(dark.cells.find((cell) => cell.char === "B")?.color).toBe("#f0f6fc");
    expect(light.cells.find((cell) => cell.char === "c")).toMatchObject({
      color: "#0969da",
      bgColor: "#f6f8fa",
    });
    expect(dark.cells.find((cell) => cell.char === "c")).toMatchObject({
      color: "#58a6ff",
      bgColor: "#161b22",
    });
  });

  it("shares stable resolved theme objects until the profile changes", () => {
    const runtime = new TextRenderingRuntime();
    const light = runtime.getResolvedTheme("light");

    expect(runtime.getResolvedTheme("light")).toBe(light);
    expect(runtime.getResolvedTheme("dark")).not.toBe(light);

    runtime.setProfile(profileWithMarkdown({
      renderThemes: {
        light: { accent: "#123456" },
        dark: {},
      },
    }));

    expect(runtime.getResolvedTheme("light")).not.toBe(light);
    expect(runtime.getResolvedTheme("light").accent).toBe("#123456");
  });

  it("keeps light and dark feature overrides independent", async () => {
    const runtime = new TextRenderingRuntime();
    const profile = profileWithMarkdown();
    profile.features["markdown.link"]!.colors.dark.foreground = "#abcdef";
    runtime.setProfile(profile);

    const source = "[link](https://example.com)";
    const light = await runtime.render(source, "#111111", { themeMode: "light" });
    const dark = await runtime.render(source, "#111111", { themeMode: "dark" });
    if (light.kind !== "styled" || dark.kind !== "styled") {
      throw new Error("Expected styled Markdown");
    }
    expect(light.cells[0]?.color).toBe("#0969da");
    expect(dark.cells[0]?.color).toBe("#abcdef");
  });

  it("keeps ANSI-only default text on the brush color in dark mode", async () => {
    const result = await new TextRenderingRuntime().render(
      "[31mred[0m plain",
      "#123456",
      { themeMode: "dark" }
    );

    expect(result.renderer).toBe("ansi");
    if (result.kind !== "styled") throw new Error("Expected styled ANSI");
    expect(result.cells.find((cell) => cell.char === "p")?.color).toBe("#123456");
  });

  it("colors block decorations without recoloring their content", async () => {
    const runtime = new TextRenderingRuntime();
    runtime.setProfile(profileWithMarkdown({
      colors: {
        "heading.marker": "#aa0000",
        "blockquote.marker": "#00aa00",
        "list.marker": "#0000aa",
        "thematic-break.foreground": "#aaaa00",
      },
    }));
    const result = await runtime.render(
      "# Head\n\n> Quote\n\n- Item\n\n***",
      "#111111"
    );

    if (result.kind !== "styled") throw new Error("Expected styled Markdown");
    expect(result.cells.find((cell) => cell.y === 0 && cell.char === "#")?.color).toBe("#aa0000");
    expect(result.cells.find((cell) => cell.y === 0 && cell.char === "H")?.color).toBe("#1f2328");
    expect(result.cells.find((cell) => cell.y === 2 && cell.char === "│")?.color).toBe("#00aa00");
    expect(result.cells.find((cell) => cell.y === 2 && cell.char === "Q")?.color).toBe("#1f2328");
    expect(result.cells.find((cell) => cell.y === 4 && cell.char === "-")?.color).toBe("#0000aa");
    expect(result.cells.find((cell) => cell.y === 4 && cell.char === "I")?.color).toBe("#1f2328");
    expect(result.cells.find((cell) => cell.y === 6)?.color).toBe("#aaaa00");
  });

  it("styles table headers as a band and keeps separators and body independent", async () => {
    const runtime = new TextRenderingRuntime();
    runtime.setProfile(profileWithMarkdown({
      colors: {
        "table.header.foreground": "#ffffff",
        "table.header.background": "#123456",
        "table.separator": "#654321",
      },
    }));
    const result = await runtime.render(
      "| Left | Right |\n| --- | --- |\n| Body | Value |",
      "#111111"
    );

    if (result.kind !== "styled") throw new Error("Expected styled table");
    const header = result.cells.filter((cell) => cell.y === 0);
    expect(rowText(result, 0)).toBe(" Left    Right ");
    expect(header.filter((cell) => cell.x < 6 || cell.x >= 8).every((cell) =>
      cell.color === "#ffffff" && cell.bgColor === "#123456" && cell.attrs?.bold
    )).toBe(true);
    expect(header.filter((cell) => cell.x === 6 || cell.x === 7).every((cell) =>
      cell.char === " " && cell.bgColor === undefined
    )).toBe(true);
    expect(rowText(result, 1)).toBe("━━━━━━  ━━━━━━━");
    expect(result.cells.find((cell) => cell.y === 1)?.color).toBe("#654321");
    expect(result.cells.find((cell) => cell.y === 2 && cell.char === "B")?.color).toBe("#1f2328");
  });

  it("keeps nested quote and list prefixes deterministic", async () => {
    const result = await new TextRenderingRuntime().render(
      "> outer\n> > inner\n\n- parent\n  - child",
      "#111111"
    );

    expect(rowText(result, 0)).toBe("│ outer");
    expect(rowText(result, 1)).toBe("│ │ inner");
    expect(rowText(result, 3)).toBe("- parent");
    expect(rowText(result, 4)).toBe("    - child");
  });

  it("renders task list states as compact status markers", async () => {
    const result = await new TextRenderingRuntime().render(
      "- [ ] Todo\n- [x] Done\n- Plain",
      "#111111"
    );

    expect([0, 1, 2].map((y) => rowText(result, y))).toEqual([
      "○ Todo",
      "● Done",
      "- Plain",
    ]);
    if (result.kind !== "styled") throw new Error("Expected styled task list");
    expect(result.cells.find((cell) => cell.char === "○")).toMatchObject({
      x: 0,
      color: "#59636e",
    });
    expect(result.cells.find((cell) => cell.char === "●")).toMatchObject({
      x: 0,
      color: "#1a7f37",
    });
    expect(result.cells.find((cell) => cell.char === "T")?.color).toBe("#1f2328");
    expect(result.cells.find((cell) => cell.char === "D")?.color).toBe("#1f2328");
  });

  it("keeps list and task-list rules independently switchable", async () => {
    const runtime = new TextRenderingRuntime();
    runtime.setProfile(profileWithMarkdown({
      rules: {
        "task-list": false,
      },
    }));
    expect(rowText(await runtime.render("- [ ] Todo", "#fff"), 0)).toBe("- [ ] Todo");

    runtime.setProfile(profileWithMarkdown({
      rules: {
        list: false,
      },
    }));
    expect(rowText(await runtime.render("- [ ] **Todo**", "#fff"), 0)).toBe(
      "- [ ] **Todo**"
    );
  });

  it("applies task colors independently and replaces ordered and nested prefixes", async () => {
    const runtime = new TextRenderingRuntime();
    runtime.setProfile(profileWithMarkdown({
      colors: {
        "task-list.unchecked": "#aa0000",
        "task-list.checked": "#00aa00",
      },
    }));
    const result = await runtime.render(
      "1. [ ] Parent\n   - [x] Child",
      "#111111"
    );

    expect(rowText(result, 0)).toBe("○ Parent");
    expect(rowText(result, 1)).toBe("    ● Child");
    if (result.kind !== "styled") throw new Error("Expected styled task list");
    expect(result.cells.find((cell) => cell.char === "○")?.color).toBe("#aa0000");
    expect(result.cells.find((cell) => cell.char === "●")?.color).toBe("#00aa00");
  });

  it("lays out GFM tables by natural cell width including CJK", async () => {
    const result = await new TextRenderingRuntime().render(
      "| 名 | Value |\n| :- | ----: |\n| 你 | 2 |",
      "#111111"
    );

    expect(rowText(result, 0)).toBe(" 名    Value ");
    expect(rowText(result, 1)).toBe("━━━━  ━━━━━━━");
    expect(rowText(result, 2)).toBe(" 你        2 ");
    if (result.kind !== "styled") throw new Error("Expected styled table");
    expect(result.cells.find((cell) => cell.char === "你")?.x).toBe(1);
    expect(result.cells.find((cell) => cell.char === "2")?.x).toBe(11);
  });

  it("uses Shiki for known code languages and falls back for unknown ones", async () => {
    const runtime = new TextRenderingRuntime();
    const highlighted = await runtime.render("```js\nconst value = 1\n```", "#111111");
    const fallback = await runtime.render("```not-a-language\nvalue\n```", "#111111");

    expect(rowText(highlighted, 0)).toBe("const value = 1");
    expect(
      highlighted.kind === "styled" &&
        highlighted.cells.some((cell) => cell.color !== "#111111")
    ).toBe(true);
    expect(rowText(fallback, 0)).toBe("value");
    expect(fallback.diagnostics[0]?.code).toBe("markdown-highlight-failed");
  });

  it("renders fenced Mermaid as a Unicode grid and migrates its legacy color", async () => {
    const runtime = new TextRenderingRuntime();
    runtime.setProfile(profileWithMarkdown({
      colors: { "mermaid.foreground": "#123456" },
    }));
    const result = await runtime.render(
      "```mermaid\ngraph LR\n  A[开始] --> B[完成]\n```",
      "#111111"
    );

    expect(result.renderer).toBe("markdown");
    expect(textFrom(result)).not.toContain("```");
    expect(textFrom(result)).not.toContain("\u001b");
    expect(textFrom(result)).toContain("开始");
    expect(textFrom(result)).toContain("完成");
    expect(textFrom(result)).toContain("╭");
    if (result.kind !== "styled") throw new Error("Expected styled Mermaid");
    expect(result.cells.filter((cell) => cell.char !== " ").every(
      (cell) => cell.color === "#123456"
    )).toBe(true);
    const start = result.cells.find((cell) => cell.char === "开");
    expect(result.cells.find((cell) => cell.char === "始")?.x).toBe((start?.x ?? 0) + 2);
  });

  it("renders GitHub alerts with nested Markdown and semantic rail colors", async () => {
    const result = await new TextRenderingRuntime().render(
      "> [!WARNING]\n> Read **carefully** at [docs](https://example.com).",
      "#111111"
    );

    expect(rowText(result, 0)).toBe("│ WARNING");
    expect(rowText(result, 1)).toBe("│ Read carefully at docs.");
    if (result.kind !== "styled") throw new Error("Expected styled alert");
    expect(result.cells.find((cell) => cell.y === 0 && cell.char === "│")?.color)
      .toBe("#9a6700");
    expect(result.cells.find((cell) => cell.char === "c")?.attrs?.bold).toBe(true);
    expect(result.cells.find((cell) => cell.href)?.href).toBe("https://example.com");
  });

  it("renders unified diffs with semantic line colors and backgrounds", async () => {
    const result = await new TextRenderingRuntime().render(
      "```diff\n--- a/demo.ts\n+++ b/demo.ts\n@@ -1 +1 @@\n-old\n+new\n same\n```",
      "#111111"
    );

    expect([0, 1, 2, 3, 4, 5].map((y) => rowText(result, y))).toEqual([
      "--- a/demo.ts",
      "+++ b/demo.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      " same",
    ]);
    if (result.kind !== "styled") throw new Error("Expected styled diff");
    expect(result.cells.find((cell) => cell.y === 3)).toMatchObject({
      color: "#d1242f",
      bgColor: "#f9e5e6",
    });
    expect(result.cells.find((cell) => cell.y === 4)).toMatchObject({
      color: "#1a7f37",
      bgColor: "#e4f0e7",
    });
    expect(result.cells.find((cell) => cell.y === 0)?.color).toBe("#59636e");
    expect(result.cells.find((cell) => cell.y === 2)?.color).toBe("#0969da");
  });

  it("renders fenced JSON and YAML as independently styled data trees", async () => {
    const runtime = new TextRenderingRuntime();
    const json = await runtime.render(
      "```json\n{\"user\":{\"name\":\"Ada\"},\"items\":[1,null],\"active\":true,\"empty\":[]}\n```",
      "#111111"
    );
    expect([0, 1, 2, 3, 4, 5, 6].map((y) => rowText(json, y))).toEqual([
      "├─ user",
      "│  └─ name: \"Ada\"",
      "├─ items",
      "│  ├─ [0]: 1",
      "│  └─ [1]: null",
      "├─ active: true",
      "└─ empty: []",
    ]);
    if (json.kind !== "styled") throw new Error("Expected styled JSON tree");
    expect(json.cells.find((cell) => cell.char === "├")?.color).toBe("#818b98");
    expect(json.cells.find((cell) => cell.char === "u")?.color).toBe("#0969da");
    expect(json.cells.find((cell) => cell.char === "A")?.color).toBe("#1a7f37");
    expect(json.cells.find((cell) => cell.y === 3 && cell.char === "[")?.color)
      .toBe("#59636e");
    expect(json.cells.find((cell) => cell.y === 3 && cell.char === "1")?.color)
      .toBe("#0969da");
    expect(json.cells.find((cell) => cell.y === 4 && cell.char === "n")?.color)
      .toBe("#59636e");
    expect(json.cells.find((cell) => cell.y === 5 && cell.char === "r")?.color)
      .toBe("#9a6700");
    expect(json.cells.find((cell) => cell.y === 6 && cell.char === "[")?.color)
      .toBe("#59636e");

    const yamlReferences = await runtime.render(
      "```yaml\nbase: &base 1\ncopy: *base\n```",
      "#111111"
    );
    if (yamlReferences.kind !== "styled") throw new Error("Expected styled YAML tree");
    expect(yamlReferences.cells.find((cell) => cell.char === "&")?.color).toBe("#0969da");
    expect(yamlReferences.cells.find((cell) => cell.char === "*")?.color).toBe("#0969da");

    runtime.setProfile(profileWithMarkdown({ rules: { "yaml-tree": false } }));
    const yaml = await runtime.render("```yaml\nuser:\n  name: Ada\n```", "#111111");
    expect([0, 1].map((y) => rowText(yaml, y))).toEqual(["user:", "  name: Ada"]);
  });

  it("renders each two-dimensional layout field through the normal pipeline", async () => {
    const result = await new TextRenderingRuntime().render(
      "```json\n{\"a\":1}\n```\n|||\n**B**\n---\nC",
      "#111111"
    );

    expect(result.renderer).toBe("block-layout");
    expect(rowText(result, 0)).toContain("└─ a: 1");
    expect(rowText(result, 0)).toContain("B");
    expect(rowText(result, 2)).toBe("C");
    expect(
      result.kind === "styled" &&
        result.cells.find((cell) => cell.char === "B")?.attrs?.bold
    ).toBe(true);
  });

  it("keeps Mermaid independently switchable from fenced code rendering", async () => {
    const runtime = new TextRenderingRuntime();
    runtime.setProfile(profileWithMarkdown({
      rules: {
        mermaid: false,
      },
    }));
    const source = "```mermaid\ngraph LR\n  A --> B\n```";
    const disabledMermaid = await runtime.render(source, "#111111");

    expect([0, 1].map((y) => rowText(disabledMermaid, y))).toEqual([
      "graph LR",
      "  A --> B",
    ]);
    expect(disabledMermaid.diagnostics).toEqual([]);

    runtime.setProfile(profileWithMarkdown({
      rules: {
        "code-block": false,
      },
    }));
    const disabledCodeBlocks = await runtime.render(source, "#111111");
    expect([0, 1, 2, 3].map((y) => rowText(disabledCodeBlocks, y))).toEqual([
      "```mermaid",
      "graph LR",
      "  A --> B",
      "```",
    ]);
  });

  it("migrates math colors into a shared structure-aware palette", async () => {
    const runtime = new TextRenderingRuntime();
    runtime.setProfile(profileWithMarkdown({
      mode: "markdown",
      colors: {
        "inline-math.foreground": "#123456",
        "block-math.foreground": "#654321",
      },
    }));

    const inline = await runtime.render(String.raw`Euler: $x^2$.`, "#111111");
    const block = await runtime.render("$$\n\\frac{a+b}{c+d}\n$$", "#111111");

    expect(textFrom(inline)).toBe("Euler: x².");
    expect([0, 1, 2].map((y) => rowText(block, y))).toEqual([
      " a + b",
      "───────",
      " c + d",
    ]);
    if (inline.kind !== "styled" || block.kind !== "styled") {
      throw new Error("Expected styled math output");
    }
    expect(inline.cells.filter((cell) => cell.char === "x" || cell.char === "²")
      .every((cell) => cell.color === "#123456")).toBe(true);
    expect(inline.cells.find((cell) => cell.char === "x")?.attrs?.italic).toBe(true);
    expect(inline.cells.find((cell) => cell.char === "²")?.attrs?.italic).toBeUndefined();
    expect(block.cells.filter((cell) => /[abcd]/.test(cell.char)).every(
      (cell) => cell.color === "#123456" && cell.attrs?.italic
    )).toBe(true);
    expect(block.cells.filter((cell) => cell.char === "+").every(
      (cell) => cell.color === "#0969da"
    )).toBe(true);
    expect(block.cells.filter((cell) => cell.char === "─").every(
      (cell) => cell.color === "#59636e"
    )).toBe(true);
  });

  it("keeps explicit ANSI color over Math semantic styles", async () => {
    const result = await new TextRenderingRuntime().render(
      "[31m$x+1$[0m",
      "#111111"
    );

    expect(result.pipeline).toEqual(["ansi", "markdown"]);
    if (result.kind !== "styled") throw new Error("Expected styled math");
    expect(result.cells.every((cell) => cell.color === "#800000")).toBe(true);
    expect(result.cells.find((cell) => cell.char === "x")?.attrs?.italic).toBe(true);
  });

  it("applies one custom Math palette to inline and block layouts", async () => {
    const runtime = new TextRenderingRuntime();
    const profile = profileWithMarkdown({ mode: "markdown" });
    profile.features["markdown.math-style"] = {
      enabled: true,
      colors: {
        light: {
          content: "#111122",
          operator: "#223344",
          structure: "#334455",
        },
        dark: {},
      },
    };
    runtime.setProfile(profile);

    const inline = await runtime.render("$x+1$", "#000000");
    const block = await runtime.render("$$\n\\frac{x+1}{2}\n$$", "#000000");
    if (inline.kind !== "styled" || block.kind !== "styled") {
      throw new Error("Expected styled math");
    }
    expect(inline.cells.find((cell) => cell.char === "x")?.color).toBe("#111122");
    expect(inline.cells.find((cell) => cell.char === "+")?.color).toBe("#223344");
    expect(block.cells.find((cell) => cell.char === "─")?.color).toBe("#334455");
  });

  it("preserves the fenced source when Mermaid rendering fails", async () => {
    const result = await new TextRenderingRuntime().render(
      "```mermaid\npie\n  title Unsupported\n```",
      "#111111"
    );

    expect([0, 1, 2, 3].map((y) => rowText(result, y))).toEqual([
      "```mermaid",
      "pie",
      "  title Unsupported",
      "```",
    ]);
    expect(result.diagnostics[0]?.code).toBe("markdown-mermaid-render-failed");
  });

  it("preserves disabled block rules as raw Markdown source", async () => {
    const runtime = new TextRenderingRuntime();
    runtime.setProfile(profileWithMarkdown({
      rules: {
        heading: false,
        table: false,
      },
    }));

    const heading = await runtime.render("# **raw heading**", "#fff");
    const table = await runtime.render("| A |\n| - |\n| B |", "#fff");
    expect(rowText(heading, 0)).toBe("# **raw heading**");
    expect([0, 1, 2].map((y) => rowText(table, y))).toEqual([
      "| A |",
      "| - |",
      "| B |",
    ]);
  });

  it("consumes disabled inline syntax without applying its style", async () => {
    const runtime = new TextRenderingRuntime();
    runtime.setProfile(profileWithMarkdown({
      rules: {
        strong: false,
      },
    }));
    const result = await runtime.render("**plain**", "#fff");

    expect(textFrom(result)).toBe("plain");
    expect(result.kind === "styled" && result.cells[0]?.attrs?.bold).toBeFalsy();
  });

  it("keeps source syntax literal in raw mode", async () => {
    const runtime = new TextRenderingRuntime();
    runtime.setProfile({ ...DEFAULT_TEXT_RENDER_PROFILE, mode: "raw" });

    expect(await runtime.render("**raw**", "#fff")).toMatchObject({
      kind: "plain",
      renderer: "raw",
      text: "**raw**",
    });
  });

  it("persists and restores a validated profile", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const runtime = new TextRenderingRuntime({ storage });
    runtime.setProfile(profileWithMarkdown({
      mode: "markdown",
      renderThemes: {
        light: {
          accent: "#AABBCC",
          info: "invalid",
        },
        dark: {},
      },
      colors: {
        "strong.foreground": "#AABBCC",
        "task-list.unchecked": "#123456",
        "task-list.checked": "#654321",
        "link.foreground": "invalid",
        ...({ "code-block": "#ff0000" } as Record<string, string>),
      },
    }));

    expect(new TextRenderingRuntime({ storage }).getProfile()).toMatchObject({
      mode: "markdown",
      renderThemes: { light: { accent: "#aabbcc" }, dark: {} },
      features: {
        "markdown.strong": {
          colors: { light: { foreground: "#aabbcc" }, dark: {} },
        },
        "markdown.task-list": {
          colors: {
            light: { unchecked: "#123456", checked: "#654321" },
            dark: {},
          },
        },
      },
    });
    expect(values.has(TEXT_RENDER_PROFILE_STORAGE_KEY)).toBe(true);
  });

  it("migrates the v2 theme and feature colors into the light scheme", () => {
    const values = new Map([["chardesk-text-render-profile-v2", JSON.stringify({
      mode: "markdown",
      renderTheme: {
        muted: "#778899",
        "grid-subtle": "#aabbcc",
      },
      features: {
        "markdown.strong": {
          enabled: true,
          colors: { foreground: "#abcdef" },
        },
      },
    })]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const runtime = new TextRenderingRuntime({ storage });

    expect(runtime.getProfile().renderThemes.light).toEqual({
      "muted-foreground": "#778899",
      "border-subtle": "#778899",
      "grid-subtle": "#aabbcc",
    });
    expect(runtime.getProfile().renderThemes.dark).toEqual({});
    expect(runtime.getProfile().features["markdown.strong"]?.colors).toEqual({
      light: { foreground: "#abcdef" },
      dark: {},
    });

    runtime.setProfile(runtime.getProfile());
    expect(JSON.parse(values.get(TEXT_RENDER_PROFILE_STORAGE_KEY) ?? "{}")
      .renderThemes.light).not.toHaveProperty("muted");
  });

  it("loads profiles saved before Markdown color overrides existed", () => {
    const storage = legacyStorage({ mode: "markdown", markdownRules: {} });

    expect(new TextRenderingRuntime({ storage }).getProfile()).toMatchObject({
      mode: "markdown",
      renderThemes: { light: {}, dark: {} },
      features: {
        "markdown.task-list": {
          enabled: true,
          colors: { light: {}, dark: {} },
        },
        "markdown.mermaid": {
          enabled: true,
          colors: { light: {}, dark: {} },
        },
      },
    });
  });

  it("enables new math rules when restoring an older profile", () => {
    const storage = legacyStorage({
      mode: "markdown",
      markdownRules: { strong: false },
    });

    expect(new TextRenderingRuntime({ storage }).getProfile().features).toMatchObject({
      "markdown.strong": { enabled: false },
      "markdown.inline-math": { enabled: true },
      "markdown.block-math": { enabled: true },
    });
  });

  it("migrates legacy Markdown rule colors to semantic slots", () => {
    const storage = legacyStorage({
      mode: "markdown",
      markdownColors: {
        heading: "#123456",
        blockquote: "#234567",
        table: "#345678",
      },
    });

    expect(new TextRenderingRuntime({ storage }).getProfile().features).toMatchObject({
      "markdown.heading": {
        colors: { light: { marker: "#123456" }, dark: {} },
      },
      "markdown.blockquote": {
        colors: { light: { marker: "#234567" }, dark: {} },
      },
      "markdown.table": {
        colors: {
          light: { "header.background": "#345678", separator: "#345678" },
          dark: {},
        },
      },
    });
  });

});
