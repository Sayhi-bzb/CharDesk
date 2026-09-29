import { getGraphemeCellWidth, iterateGraphemes } from "@chardesk/protocol";
import { splitCharGraphLines } from "./fragments.js";
import type { CharGraphFragment } from "./model.js";

type Glyph = {
  text: string;
  width: number;
  fragment: CharGraphFragment;
  origin?: { from: number; to: number };
};
type Unit = { glyphs: Glyph[]; width: number; whitespace: boolean };

const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const word = /[\p{L}\p{N}_]/u;
const whitespace = /^\s+$/u;
const closing = /^[,.;:!?，。；：！？、）】》」』]/u;
const opening = /^[（【《「『]/u;

const glyphsFor = (line: readonly CharGraphFragment[]): Glyph[] =>
  line.flatMap((fragment) => {
    const exact = fragment.origin &&
      fragment.origin.to - fragment.origin.from === fragment.text.length;
    return [...iterateGraphemes(fragment.text)].map(({ segment, index }) => ({
      text: segment,
      width: getGraphemeCellWidth(segment),
      fragment,
      ...(fragment.origin ? {
        origin: exact
          ? { from: fragment.origin.from + index, to: fragment.origin.from + index + segment.length }
          : fragment.origin,
      } : {}),
    }));
  });

const unitsFor = (glyphs: readonly Glyph[]): Unit[] => {
  const units: Unit[] = [];
  for (let index = 0; index < glyphs.length;) {
    const first = glyphs[index++]!;
    const group = [first];
    if (whitespace.test(first.text)) {
      while (index < glyphs.length && whitespace.test(glyphs[index]!.text)) {
        group.push(glyphs[index++]!);
      }
    } else if (word.test(first.text) && !cjk.test(first.text)) {
      while (index < glyphs.length &&
        word.test(glyphs[index]!.text) && !cjk.test(glyphs[index]!.text)) {
        group.push(glyphs[index++]!);
      }
    } else if (opening.test(first.text) && index < glyphs.length &&
      !whitespace.test(glyphs[index]!.text)) {
      group.push(glyphs[index++]!);
    }
    if (!whitespace.test(first.text)) {
      while (index < glyphs.length && closing.test(glyphs[index]!.text)) {
        group.push(glyphs[index++]!);
      }
    }
    units.push({
      glyphs: group,
      width: group.reduce((total, glyph) => total + glyph.width, 0),
      whitespace: whitespace.test(first.text),
    });
  }
  return units;
};

const sameStyle = (left: CharGraphFragment, right: CharGraphFragment) =>
  left.color === right.color &&
  left.bgColor === right.bgColor &&
  left.href === right.href &&
  left.attrs?.bold === right.attrs?.bold &&
  left.attrs?.italic === right.attrs?.italic &&
  left.attrs?.underline === right.attrs?.underline &&
  left.attrs?.strike === right.attrs?.strike &&
  left.attrs?.inverse === right.attrs?.inverse;

const emitGlyphs = (glyphs: readonly Glyph[], output: CharGraphFragment[]) => {
  let previousSource: CharGraphFragment | null = null;
  for (const glyph of glyphs) {
    const previous = output.at(-1);
    const canMerge = previous && sameStyle(previous, glyph.fragment) &&
      (previousSource === glyph.fragment ||
        (previous.origin?.to !== undefined && previous.origin.to === glyph.origin?.from));
    if (canMerge) {
      previous.text += glyph.text;
      if (previous.origin && glyph.origin) previous.origin.to = glyph.origin.to;
    } else {
      output.push({
        ...glyph.fragment,
        text: glyph.text,
        ...(glyph.origin ? { origin: { ...glyph.origin } } : {}),
      });
    }
    previousSource = glyph.fragment;
  }
};

/** Wrap rendered prose without discarding inline styles, links, or source ranges. */
export const wrapMarkdownProse = (
  fragments: readonly CharGraphFragment[],
  widthLimit: number
): CharGraphFragment[] => {
  const limit = Math.max(1, Math.floor(widthLimit));
  const output: CharGraphFragment[] = [];
  const sourceLines = splitCharGraphLines(fragments);
  sourceLines.forEach((sourceLine, lineIndex) => {
    if (lineIndex > 0) output.push({ text: "\n" });
    let line: Glyph[] = [];
    let lineWidth = 0;
    let spaces: Glyph[] = [];
    const flush = () => {
      emitGlyphs(line, output);
      output.push({ text: "\n" });
      line = [];
      lineWidth = 0;
    };
    const append = (glyph: Glyph) => {
      if (lineWidth > 0 && lineWidth + glyph.width > limit) flush();
      line.push(glyph);
      lineWidth += glyph.width;
    };
    for (const unit of unitsFor(glyphsFor(sourceLine))) {
      if (unit.whitespace) {
        spaces.push(...unit.glyphs);
        continue;
      }
      const spaceWidth = spaces.reduce((total, glyph) => total + glyph.width, 0);
      if (lineWidth > 0 && lineWidth + spaceWidth + unit.width > limit) {
        flush();
      } else if (lineWidth > 0) {
        spaces.forEach(append);
      }
      spaces = [];
      unit.glyphs.forEach(append);
    }
    if (lineWidth > 0 && lineWidth +
      spaces.reduce((total, glyph) => total + glyph.width, 0) <= limit) {
      spaces.forEach(append);
    }
    emitGlyphs(line, output);
  });
  return output;
};
