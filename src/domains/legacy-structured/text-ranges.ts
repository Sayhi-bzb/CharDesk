import { cloneTextAttributes } from "@/shared/utils/ansi";
import type {
  StructuredNodeStyle,
  StructuredTextStyleRange,
} from "./types";

/** Resolves the historical per-grapheme styling needed while flattening a scene. */
export const mergeStructuredTextStyle = (
  baseStyle: StructuredNodeStyle,
  ranges: StructuredTextStyleRange[] | undefined,
  offset: number
): StructuredNodeStyle => {
  let style: StructuredNodeStyle = {
    color: baseStyle.color,
    ...(baseStyle.bgColor ? { bgColor: baseStyle.bgColor } : {}),
    ...(cloneTextAttributes(baseStyle.attrs)
      ? { attrs: cloneTextAttributes(baseStyle.attrs) }
      : {}),
  };
  ranges?.forEach((range) => {
    if (offset < range.start || offset >= range.end) return;
    const attrs = cloneTextAttributes({
      ...(style.attrs ?? {}),
      ...(range.style.attrs ?? {}),
    });
    style = {
      ...style,
      ...(range.style.color ? { color: range.style.color } : {}),
      ...(range.style.bgColor ? { bgColor: range.style.bgColor } : {}),
      ...(attrs ? { attrs } : {}),
    };
  });
  return style;
};
