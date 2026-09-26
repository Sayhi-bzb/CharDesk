import type { TextAttributes } from "@/shared/types";

export interface RichTextCell {
  x: number;
  y: number;
  char: string;
  color: string;
  bgColor?: string;
  attrs?: TextAttributes;
  href?: string;
}

export interface RichTextSpan extends Omit<RichTextCell, "y" | "char"> {
  text: string;
  width: number;
}

export interface RichTextRow {
  y: number;
  spans: RichTextSpan[];
}

export type TextWriteOptions = Readonly<{
  preserveTargetBackground?: boolean;
  selectResult?: boolean;
}>;

export type TextPasteOptions = Readonly<{
  selectResult?: boolean;
}>;
