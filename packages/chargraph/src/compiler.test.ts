import { describe, expect, it } from "vitest";
import {
  CharDeskTextCompileError,
  compileCharDeskText,
  materializeCompiledCharDeskText,
} from "./compiler.js";

describe("compileCharDeskText", () => {
  it("preserves retired layout delimiters for every source kind", async () => {
    const source = "A\n|||\nB";
    const chargraph = await compileCharDeskText(source, {
      sourceKind: "chargraph",
    });
    const chardesk = await compileCharDeskText(source, {
      sourceKind: "chardesk",
    });

    expect(chargraph.plainText).toBe(source);
    expect(chardesk.plainText).toBe(source);
  });

  it("preserves Markdown markers for compiled CharDesk input", async () => {
    const source = "# title\n---";
    const compiled = await compileCharDeskText(source, {
      sourceKind: "chardesk",
    });

    expect(compiled.renderer).toBe("chardesk");
    expect(compiled.plainText).toBe(source);
  });

  it("materializes wide graphemes from the shared Protocol layout", async () => {
    const compiled = await compileCharDeskText("A界", {
      sourceKind: "plain",
    });
    const document = materializeCompiledCharDeskText(compiled);

    expect(document.width).toBe(3);
    expect(document.cells.map(({ x, width, text }) => ({ x, width, text }))).toEqual([
      { x: 0, width: 1, text: "A" },
      { x: 1, width: 2, text: "界" },
    ]);
  });

  it("selects the last matching pipeline default without changing raw input", async () => {
    const options = {
      sourceKind: "chargraph" as const,
      defaultStyle: { color: "#111111" },
      pipelineDefaultStyles: { markdown: { color: "#eeeeee" } },
    };
    const markdown = materializeCompiledCharDeskText(
      await compileCharDeskText("**styled**", options)
    );
    const raw = materializeCompiledCharDeskText(
      await compileCharDeskText("plain", options)
    );

    expect(markdown.cells.every((cell) => cell.color === "#eeeeee")).toBe(true);
    expect(raw.cells.every((cell) => cell.color === "#111111")).toBe(true);
  });

  it("rejects terminal escapes in canonical CharDesk input", async () => {
    await expect(compileCharDeskText("\u001b[31mred", {
      sourceKind: "chardesk",
    })).rejects.toEqual(new CharDeskTextCompileError("terminal-escape"));
  });
});

describe("canonical format requests", () => {
  it.each(["auto", "plain", "ansi", "markdown", "chardesk"] as const)(
    "keeps retired delimiters literal in %s", async (format) => {
      const result = await compileCharDeskText("A\n|||\nB", { format });
      expect(result.plainText).toBe("A\n|||\nB");
    },
  );

  it("lets explicit format override the legacy input kind", async () => {
    const result = await compileCharDeskText("**A**", { format: "auto", sourceKind: "plain" });
    expect(result.plainText).toBe("A");
    expect(result.fragments.some((part) => part.attrs?.bold)).toBe(true);
  });

  it("keeps raw as the literal alias", async () => {
    const result = await compileCharDeskText("**A**\t界", { format: "raw", tabSize: 4 });
    expect(result.renderer).toBe("plain");
    expect(result.plainText).toBe("**A**   界");
  });
});
