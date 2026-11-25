import type {
  CharGraphDiagnostic,
  CharGraphRenderResult,
  CharGraphSourceRange,
} from "./model.js";

export type NormalizedCharGraphSource = {
  text: string;
  offsets: number[];
  originalLength: number;
};

export const normalizeCharGraphSource = (
  source: string
): NormalizedCharGraphSource => {
  let text = "";
  const offsets = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\r") {
      const next = source[index + 1] === "\n" ? index + 2 : index + 1;
      text += "\n";
      offsets.push(next);
      if (next === index + 2) index += 1;
      continue;
    }
    text += source[index];
    offsets.push(index + 1);
  }
  return { text, offsets, originalLength: source.length };
};

export const locateCharGraphSourceRange = (
  source: string,
  raw: string,
  scope: CharGraphSourceRange,
  cursor: number
): CharGraphSourceRange => {
  if (!raw) return { from: cursor, to: cursor };
  const searchFrom = Math.min(Math.max(scope.from, cursor), scope.to);
  const fromCursor = source.indexOf(raw, searchFrom);
  if (fromCursor >= scope.from && fromCursor + raw.length <= scope.to) {
    return { from: fromCursor, to: fromCursor + raw.length };
  }
  return {
    from: searchFrom,
    to: Math.min(searchFrom + raw.length, scope.to),
  };
};

const restoreRange = (
  normalized: NormalizedCharGraphSource,
  range: CharGraphSourceRange
) => ({
  from: normalized.offsets[range.from] ?? normalized.originalLength,
  to: normalized.offsets[range.to] ?? normalized.originalLength,
});

const restoreDiagnostic = (
  normalized: NormalizedCharGraphSource,
  diagnostic: CharGraphDiagnostic
) => {
  if (diagnostic.offset === undefined) return diagnostic;
  const from = normalized.offsets[diagnostic.offset] ?? normalized.originalLength;
  const to = diagnostic.length === undefined
    ? undefined
    : normalized.offsets[diagnostic.offset + diagnostic.length]
      ?? normalized.originalLength;
  return {
    ...diagnostic,
    offset: from,
    ...(to === undefined ? {} : { length: to - from }),
  };
};

export const restoreCharGraphSourceRanges = (
  normalized: NormalizedCharGraphSource,
  result: CharGraphRenderResult
): CharGraphRenderResult => ({
  ...result,
  fragments: result.fragments.map((fragment) => ({
    ...fragment,
    ...(fragment.origin
      ? { origin: restoreRange(normalized, fragment.origin) }
      : {}),
  })),
  diagnostics: result.diagnostics.map((diagnostic) =>
    restoreDiagnostic(normalized, diagnostic)
  ),
});
