import { splitGraphemes } from "@chardesk/protocol";

export const getFirstGrapheme = (value: string) => {
  return splitGraphemes(value)[0] ?? "";
};

export const normalizeBrushChar = (value: string, fallback: string) => {
  const first = getFirstGrapheme(value);
  return first || fallback;
};
