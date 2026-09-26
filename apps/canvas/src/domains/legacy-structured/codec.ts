// Read-only decoder retained for legacy documents and persistence.
import { normalizeSplitBoxRoot } from "./split-box-geometry";
import type {
  StructuredNode,
  StructuredNodeStyle,
  StructuredTextStyleRange,
} from "./types";
import type { TextAttributes } from "@/shared/types";

const isPoint = (value: unknown): value is { x: number; y: number } =>
  !!value &&
  typeof value === "object" &&
  typeof (value as { x?: unknown }).x === "number" &&
  Number.isFinite((value as { x: number }).x) &&
  typeof (value as { y?: unknown }).y === "number" &&
  Number.isFinite((value as { y: number }).y);

const decodeComponentMetadata = (
  value: unknown
): NonNullable<StructuredNode["component"]> | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.instanceId === "string" &&
    typeof candidate.templateId === "string" &&
    typeof candidate.role === "string"
    ? {
        instanceId: candidate.instanceId,
        templateId: candidate.templateId,
        role: candidate.role,
      }
    : undefined;
};

const withComponent = (value: unknown) => {
  const component = decodeComponentMetadata(value);
  return component ? { component } : {};
};

const decodeTextAttributes = (value: unknown): TextAttributes | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const attrs: TextAttributes = {};
  if (candidate.bold === true) attrs.bold = true;
  if (candidate.italic === true) attrs.italic = true;
  if (candidate.underline === true) attrs.underline = true;
  if (candidate.strike === true) attrs.strike = true;
  if (candidate.inverse === true) attrs.inverse = true;
  return Object.keys(attrs).length > 0 ? attrs : undefined;
};

const decodeStyle = (value: unknown): StructuredNodeStyle | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.color !== "string") return null;
  const attrs = decodeTextAttributes(candidate.attrs);
  return {
    color: candidate.color,
    ...(typeof candidate.bgColor === "string" ? { bgColor: candidate.bgColor } : {}),
    ...(attrs ? { attrs } : {}),
  };
};

const decodeStyleRanges = (value: unknown): StructuredTextStyleRange[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const ranges = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.start !== "number" ||
      !Number.isFinite(candidate.start) ||
      typeof candidate.end !== "number" ||
      !Number.isFinite(candidate.end) ||
      candidate.start >= candidate.end ||
      !candidate.style ||
      typeof candidate.style !== "object" ||
      Array.isArray(candidate.style)
    ) {
      return [];
    }
    const rawStyle = candidate.style as Record<string, unknown>;
    const attrs = decodeTextAttributes(rawStyle.attrs);
    return [{
      start: candidate.start,
      end: candidate.end,
      style: {
        ...(typeof rawStyle.color === "string" ? { color: rawStyle.color } : {}),
        ...(typeof rawStyle.bgColor === "string" ? { bgColor: rawStyle.bgColor } : {}),
        ...(attrs ? { attrs } : {}),
      },
    } satisfies StructuredTextStyleRange];
  });
  return ranges.length > 0 ? ranges : undefined;
};

export const decodeStructuredNode = (value: unknown): StructuredNode | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const style = decodeStyle(raw.style);
  if (
    typeof raw.id !== "string" ||
    typeof raw.order !== "number" ||
    !Number.isFinite(raw.order) ||
    !style
  ) {
    return null;
  }

  if (raw.type === "text") {
    if (!isPoint(raw.position) || typeof raw.text !== "string") return null;
    const styleRanges = decodeStyleRanges(raw.styleRanges);
    return {
      id: raw.id,
      type: "text",
      order: raw.order,
      position: { ...raw.position },
      text: raw.text,
      style,
      ...(styleRanges ? { styleRanges } : {}),
      ...withComponent(raw.component),
    };
  }
  if (
    raw.type !== "box" &&
    raw.type !== "line" &&
    raw.type !== "bg" &&
    raw.type !== "splitBox"
  ) {
    return null;
  }
  if (!isPoint(raw.start) || !isPoint(raw.end)) return null;
  if (raw.type === "box" && raw.name !== undefined && typeof raw.name !== "string") {
    return null;
  }
  if (
    raw.type === "line" &&
    ((raw.axis !== "horizontal" && raw.axis !== "vertical") ||
      (raw.endMarker !== undefined && raw.endMarker !== "arrow"))
  ) {
    return null;
  }
  if (raw.type !== "splitBox") {
    const base = {
      id: raw.id,
      order: raw.order,
      start: { ...raw.start },
      end: { ...raw.end },
      style,
      ...withComponent(raw.component),
    };
    if (raw.type === "box") {
      return { ...base, type: "box", ...(typeof raw.name === "string" ? { name: raw.name } : {}) };
    }
    if (raw.type === "line") {
      return {
        ...base,
        type: "line",
        axis: raw.axis === "vertical" ? "vertical" : "horizontal",
        ...(raw.endMarker === "arrow" ? { endMarker: "arrow" as const } : {}),
      };
    }
    return { ...base, type: "bg" };
  }

  const verticalSplitRatio =
    typeof raw.verticalSplitRatio === "number"
      ? raw.verticalSplitRatio
      : 0.36;
  const topSplitRatio =
    typeof raw.topSplitRatio === "number" ? raw.topSplitRatio : 0.25;
  const bottomSplitRatio =
    typeof raw.bottomSplitRatio === "number"
      ? raw.bottomSplitRatio
      : 0.75;
  return {
    id: raw.id,
    type: "splitBox",
    order: raw.order,
    start: { ...raw.start },
    end: { ...raw.end },
    style,
    ...withComponent(raw.component),
    verticalSplitRatio,
    topSplitRatio,
    bottomSplitRatio,
    root: normalizeSplitBoxRoot(raw.root, {
      verticalSplitRatio,
      topSplitRatio,
      bottomSplitRatio,
    }),
  };
};
