import type { WidgetId } from "./types.js";

export type CellDebugReference = Readonly<{
  ref: string;
  intent: string;
  canonicalId: WidgetId;
}>;

const hashReference = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(-7);
};

/** Maps a canonical widget id to a stable, intent-preserving agent ref. */
export const cellDebugReference = (canonicalId: WidgetId): CellDebugReference => {
  const path = canonicalId.split("/");
  const root = path.shift() || canonicalId;
  const structuralPath = /^root(?:\[|$)/.test(root);
  const ccMatch = root.match(/^cc:([^:]+):(.+)$/);
  const suffixedMatch = root.match(/^(.+)-([A-Za-z0-9]{4,})$/);
  const intent = (ccMatch?.[1]
    ?? suffixedMatch?.[1]
    ?? root.replace(/\[\d+\]$/, "")) || "cell";
  // Keep an already-short stable suffix (for example abc123), and hash only
  // opaque or long entity ids. This gives agents a readable intent while
  // keeping refs deterministic across frames.
  const rawEntity = ccMatch?.[2] ?? suffixedMatch?.[2];
  const entity = structuralPath
    ? hashReference(canonicalId)
    : rawEntity && /^[A-Za-z0-9]+$/.test(rawEntity) && rawEntity.length <= 12
    ? rawEntity
    : hashReference(root);
  const childPath = structuralPath ? "" : path.join("/");
  return {
    ref: `${intent}/${entity}${childPath ? `/${childPath}` : ""}`,
    intent,
    canonicalId,
  };
};

export const cellDebugRefFor = (canonicalId: WidgetId | null): string | null =>
  canonicalId ? cellDebugReference(canonicalId).ref : null;
