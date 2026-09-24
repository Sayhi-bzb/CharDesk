import { describe, expect, it } from "vitest";
import { tokenizeCode } from "../code-highlighting.ts";
import { componentContent, guideContent, publicUsage } from "./docs-content";

describe("Gallery build-time code highlighting", () => {
  it("preserves every TSX example exactly", async () => {
    const examples = [
      ...componentContent.map(({ usage }) => publicUsage(usage)),
      ...guideContent.flatMap((guide) => guide.sections
        .filter((section) => section.code && guide.slug !== "installation")
        .map((section) => section.code!)),
      "const text = \"世界 👋\";\n\nexport { text };\n",
    ];
    const highlighted = await tokenizeCode(examples);
    for (const example of examples) {
      expect(highlighted[example]?.map(({ content }) => content).join("")).toBe(example);
    }
  });

  it("emphasizes structure without treating operators or attributes as keywords", async () => {
    const example = 'import { Button } from "cell-ui";\n// A comment\nconst view = <Button variant="outline" />;';
    const tokens = (await tokenizeCode([example]))[example]!;
    const token = (content: string) => tokens.find((candidate) => candidate.content === content);

    expect(token("import")).toMatchObject({ color: "var(--gallery-code-token-keyword)", bold: true });
    expect(token("const")).toMatchObject({ color: "var(--gallery-code-token-keyword)", bold: true });
    expect(token("Button")).toMatchObject({ bold: true });
    expect(token("variant")?.bold).toBeUndefined();
    expect(token("=")?.bold).toBeUndefined();
    expect(token('"outline"')?.color).toBe("var(--gallery-code-token-string-expression)");
    expect(token("// A comment")?.color).toBe("var(--gallery-code-token-comment)");
  });
});
