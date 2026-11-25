import {
  getGraphemeCellWidth,
  splitGraphemes,
} from "@chardesk/protocol";

const PRIVATE_USE_START = 0xe001;
const PRIVATE_USE_END = 0xf8ff;
const CONTINUATION = "\ue000";
const ASCII_END = 0x7f;

interface CellTextCodec {
  encode(value: string): string;
  decode(value: string): string;
}

export const createCellTextCodec = (): CellTextCodec => {
  const graphemeToToken = new Map<string, string>();
  const tokenToGrapheme = new Map<string, string>();
  let nextToken = PRIVATE_USE_START;

  const tokenFor = (grapheme: string) => {
    const existing = graphemeToToken.get(grapheme);
    if (existing) return existing;
    if (nextToken > PRIVATE_USE_END) {
      throw new Error("Mermaid source contains too many distinct Unicode graphemes.");
    }
    const token = String.fromCharCode(nextToken);
    nextToken += 1;
    graphemeToToken.set(grapheme, token);
    tokenToGrapheme.set(token, grapheme);
    return token;
  };

  return {
    encode(value) {
      return splitGraphemes(value)
        .map((grapheme) => {
          const codePoint = grapheme.codePointAt(0) ?? 0;
          if (grapheme.length === 1 && codePoint <= ASCII_END) return grapheme;
          const token = tokenFor(grapheme);
          return getGraphemeCellWidth(grapheme) === 2
            ? `${token}${CONTINUATION}`
            : token;
        })
        .join("");
    },
    decode(value) {
      let decoded = "";
      for (const codeUnit of value) {
        if (codeUnit === CONTINUATION) continue;
        decoded += tokenToGrapheme.get(codeUnit) ?? codeUnit;
      }
      return decoded;
    },
  };
};
