import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { componentDocuments, sourceLinksForComponent } from "./component-catalog";

describe("Gallery component source links", () => {
  it("points every documented component to its real source files", () => {
    for (const document of componentDocuments) {
      const links = sourceLinksForComponent(document.slug);
      expect(links[0]?.label).toBe("react.tsx");
      for (const { label, href } of links) {
        expect(href).toBe(`https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/${label}`);
        expect(existsSync(path.resolve(import.meta.dirname, "../../../packages/cell-ui/src", label))).toBe(true);
      }
    }
  });
});
