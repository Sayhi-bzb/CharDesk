import { getGraphemeCellWidth, iterateGraphemes } from "@chardesk/protocol";
import type { CellTextStyle } from "./types.js";

export type MarkdownInlineTone = "accent" | "link" | "quote" | "muted"
  | "codeKey" | "codeValue" | "codeCommand" | "codeComment";
export type MarkdownInlineRun = Readonly<{
  text: string;
  style: CellTextStyle;
  tone?: MarkdownInlineTone;
  code?: boolean;
  linkIndex?: number;
}>;
export type MarkdownInlineGlyph = Readonly<{
  text: string;
  x: number;
  y: number;
  width: number;
  runIndex: number;
  linkIndex?: number;
}>;
export type MarkdownInlineLayout = Readonly<{
  width: number;
  height: number;
  glyphs: readonly MarkdownInlineGlyph[];
}>;

type Glyph = Readonly<{ text: string; width: number; runIndex: number; linkIndex?: number }>;
type Unit = Readonly<{ glyphs: readonly Glyph[]; width: number; whitespace: boolean }>;
const layoutCache = new WeakMap<readonly MarkdownInlineRun[], Map<number, MarkdownInlineLayout>>();

const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const word = /[\p{L}\p{N}_]/u;
const whitespace = /^\s+$/u;
const closingPunctuation = /^[,.;:!?，。；：！？、）】》」』]/u;

const unitsFor = (runs: readonly MarkdownInlineRun[]): Unit[] => {
  const glyphs = runs.flatMap((run, runIndex) => [...iterateGraphemes(run.text)].map(({ segment }): Glyph => ({
    text: segment, width: getGraphemeCellWidth(segment), runIndex,
    ...(run.linkIndex === undefined ? {} : { linkIndex: run.linkIndex }),
  })));
  const units: Unit[] = [];
  for (let index = 0; index < glyphs.length;) {
    const first = glyphs[index]!;
    const group: Glyph[] = [first];
    index++;
    if (whitespace.test(first.text)) {
      while (index < glyphs.length && whitespace.test(glyphs[index]!.text)) group.push(glyphs[index++]!);
    } else if (word.test(first.text) && !cjk.test(first.text)) {
      while (index < glyphs.length && word.test(glyphs[index]!.text) && !cjk.test(glyphs[index]!.text)) {
        group.push(glyphs[index++]!);
      }
    }
    if (!whitespace.test(first.text)) {
      while (index < glyphs.length && closingPunctuation.test(glyphs[index]!.text)) group.push(glyphs[index++]!);
    }
    units.push({ glyphs: group, width: group.reduce((sum, glyph) => sum + glyph.width, 0),
      whitespace: whitespace.test(first.text) });
  }
  return units;
};

/** One line map is shared by measuring, painting, and Markdown link hit regions. */
export const layoutMarkdownInlineFlow = (runs: readonly MarkdownInlineRun[], widthLimit: number): MarkdownInlineLayout => {
  const limit = Math.max(1, Math.floor(widthLimit));
  let widths = layoutCache.get(runs);
  const cached = widths?.get(limit);
  if (cached) return cached;
  const glyphs: MarkdownInlineGlyph[] = [];
  let x = 0;
  let y = 0;
  let widest = 0;
  for (const unit of unitsFor(runs)) {
    if (unit.whitespace && x === 0) continue;
    if (x > 0 && x + unit.width > limit) {
      widest = Math.max(widest, x);
      x = 0;
      y++;
      if (unit.whitespace) continue;
    }
    for (const glyph of unit.glyphs) {
      if (x > 0 && x + glyph.width > limit) {
        widest = Math.max(widest, x);
        x = 0;
        y++;
      }
      glyphs.push({ ...glyph, x, y });
      x += glyph.width;
    }
  }
  const result = { width: Math.max(widest, x), height: y + 1, glyphs };
  if (!widths) {
    widths = new Map();
    layoutCache.set(runs, widths);
  }
  if (widths.size >= 16) widths.delete(widths.keys().next().value!);
  widths.set(limit, result);
  return result;
};
