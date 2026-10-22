import type { MarkedExtension } from "marked";

const SPATIAL_GLYPHS = /[┌┐└┘├┤┬┴┼─│━┃╭╮╰╯╴╵╶╷╸╹╺╻▶►▼▲◀◁▷△▽]/u;
const ASCII_FRAME = /^\s*\+[+=-]+\+/u;
const ASCII_DRAWING_GLYPHS = /[-_=+|/\\()[\]{}<>.'`~^:*]/gu;

const isSpatialText = (source: string) => {
  // Fences and explicit Markdown tables/links retain their own grammar.
  if (/^\s*(?:`{3,}|~{3,})/mu.test(source)
    || /^ {0,3}\|?\s*:?-+:?\s*\|/mu.test(source)
    || /\[[^\]\n]*\]\([^\n)]*\)/u.test(source)) return false;
  const lines = source.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length < 3) return false;
  if (lines.filter((line) => SPATIAL_GLYPHS.test(line)).length >= 2
    || lines.filter((line) => ASCII_FRAME.test(line)).length >= 2) return true;
  const visible = lines.map((line) => line.replace(/\s/gu, "")).join("");
  const drawn = visible.match(ASCII_DRAWING_GLYPHS)?.length ?? 0;
  return drawn >= 8 && drawn / visible.length >= 0.8
    && lines.filter((line) => /[|/\\()[\]{}]/u.test(line)).length >= 2
    && lines.filter((line) => /^ +\S/u.test(line) || /\S {2,}\S/u.test(line)).length >= 2;
};

const candidate = (source: string) => source.split(/\n[ \t]*\n/u, 1)[0]!;

/** A block token protects coordinates before Markdown consumes drawing syntax. */
export const SPATIAL_TEXT_EXTENSION: MarkedExtension = {
  extensions: [{
    name: "chardesk-literal",
    level: "block",
    start(source) {
      for (const match of source.matchAll(/(?:^|\n[ \t]*\n)([\s\S]*?)(?=\n[ \t]*\n|$)/gu)) {
        if (isSpatialText(match[1]!)) return match.index + match[0].length - match[1]!.length;
      }
      return undefined;
    },
    tokenizer(source) {
      const raw = candidate(source);
      if (isSpatialText(raw)) return { type: "chardesk-literal", raw };
      return undefined;
    },
  }],
};
