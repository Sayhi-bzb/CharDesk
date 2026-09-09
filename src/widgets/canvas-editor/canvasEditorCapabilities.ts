import type {
  ContextMenuEntry,
  EditorActionId,
} from "@/domains/actions/public";

export type CanvasEditorCapabilities = Readonly<{
  navigate: boolean;
  select: boolean;
  copy: boolean;
  mutateContent: boolean;
}>;

export const DEFAULT_CANVAS_EDITOR_CAPABILITIES: CanvasEditorCapabilities = {
  navigate: true,
  select: true,
  copy: true,
  mutateContent: true,
};

const COPY_ACTIONS = new Set<EditorActionId>([
  "copy",
  "copy-rich",
  "copy-ansi",
  "snapshot-png",
]);

export const canUseCanvasEditorAction = (
  capabilities: CanvasEditorCapabilities,
  actionId: string,
) =>
  COPY_ACTIONS.has(actionId as EditorActionId)
    ? capabilities.copy
    : capabilities.mutateContent;

export const canUseCanvasEditorShortcutTarget = (
  capabilities: CanvasEditorCapabilities,
  target: { type: "command" | "tool"; id: string },
) => {
  if (target.type === "command") {
    return canUseCanvasEditorAction(capabilities, target.id);
  }
  if (target.id === "pan") return capabilities.navigate;
  if (target.id === "select") return capabilities.select;
  return capabilities.mutateContent;
};

export const filterCanvasContextMenuEntries = (
  entries: readonly ContextMenuEntry[],
  capabilities: CanvasEditorCapabilities,
): ContextMenuEntry[] => {
  const filtered: ContextMenuEntry[] = [];
  let separatorPending = false;

  for (const entry of entries) {
    if (entry.type === "separator") {
      separatorPending = filtered.length > 0;
      continue;
    }

    const next = entry.type === "submenu"
      ? { ...entry, children: filterCanvasContextMenuEntries(entry.children, capabilities) }
      : canUseCanvasEditorAction(capabilities, entry.id)
        ? entry
        : null;
    if (!next || (next.type === "submenu" && next.children.length === 0)) continue;

    if (separatorPending) filtered.push({ type: "separator" });
    filtered.push(next);
    separatorPending = false;
  }

  return filtered;
};
