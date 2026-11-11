import type { BundledLanguage, ThemeRegistrationAny, BundledTheme, SpecialTheme } from "shiki";
import { createCharGraphFragment } from "./fragments.js";
import type { CharGraphFragment } from "./model.js";

/** Syntax colors annotate source characters without changing their positions. */
export async function highlightCode(
  source: string,
  language: string,
  theme: BundledTheme | SpecialTheme | ThemeRegistrationAny = "github-light",
  sourceOffset = 0
): Promise<CharGraphFragment[]> {
  const { codeToTokens } = await import("shiki");
  const highlighted = await codeToTokens(source, { lang: language as BundledLanguage, theme });
  const output: CharGraphFragment[] = [];
  let offset = sourceOffset;
  highlighted.tokens.forEach((line, lineIndex) => {
    for (const part of line) {
      const flags = Math.max(0, part.fontStyle ?? 0);
      output.push(createCharGraphFragment(part.content, {
        color: part.color ?? highlighted.fg,
        ...(flags ? { attrs: {
          ...(flags & 1 ? { italic: true } : {}),
          ...(flags & 2 ? { bold: true } : {}),
          ...(flags & 4 ? { underline: true } : {}),
        } } : {}),
      }, { from: offset, to: offset + part.content.length }));
      offset += part.content.length;
    }
    if (lineIndex < highlighted.tokens.length - 1) {
      output.push(createCharGraphFragment("\n", {}, { from: offset, to: offset + 1 }));
      offset++;
    }
  });
  return output;
}
