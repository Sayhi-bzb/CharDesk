import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { componentDocuments, sourceLinksForComponent } from "./component-catalog";

describe("Gallery component source links", () => {
  it("points every documented component to its real source files", () => {
    for (const document of componentDocuments) {
      const links = sourceLinksForComponent(document.slug);
      expect(links.length).toBeGreaterThan(0);
      for (const { label, href } of links) {
        expect(href).toBe(`https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/${label}`);
        expect(existsSync(path.resolve(import.meta.dirname, "../../../packages/cell-ui/src", label))).toBe(true);
      }
    }
  });

  it("keeps compound component trees in the agent-readable Markdown", () => {
    const compound = new Set(["accordion", "alert", "combobox", "dialog", "input", "menu", "radio", "select", "table", "tabs", "toast"]);
    for (const document of componentDocuments) {
      expect(Boolean(document.composition)).toBe(compound.has(document.slug));
      if (!document.composition) continue;
      const markdown = readFileSync(path.resolve(import.meta.dirname, "../public/components", `${document.slug}.md`), "utf8");
      expect(markdown).toContain(`\n\n## Composition\n\n\`\`\`text\n${document.composition}\n\`\`\`\n\n## View source`);
    }
  });
});
