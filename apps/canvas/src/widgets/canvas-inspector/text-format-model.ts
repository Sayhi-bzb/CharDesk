import type { TextAttributes } from "@/shared/types";

export const textAttributeNames = [
  "bold",
  "italic",
  "underline",
  "strike",
  "inverse",
] as const;

export type TextAttributeName = (typeof textAttributeNames)[number];
type TextAttributeState = "on" | "off" | "mixed";
export type TextFormattingModel = Record<TextAttributeName, TextAttributeState>;

type TextStyle = {
  attrs?: TextAttributes;
};

export const deriveTextFormattingModel = (
  styles: TextStyle[]
): TextFormattingModel | null => {
  if (styles.length === 0) return null;

  return Object.fromEntries(
    textAttributeNames.map((attribute) => {
      const enabledCount = styles.filter(
        (style) => style.attrs?.[attribute] === true
      ).length;
      const state: TextAttributeState =
        enabledCount === 0
          ? "off"
          : enabledCount === styles.length
            ? "on"
            : "mixed";
      return [attribute, state];
    })
  ) as TextFormattingModel;
};
