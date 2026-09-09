import type { WidgetCommand } from "./interaction.js";
import type { FrameSnapshot, WidgetId } from "./types.js";

type SelectEffect =
  | Readonly<{ type: "open"; value: boolean }>
  | Readonly<{ type: "select"; targetId: WidgetId }>
  | Readonly<{ type: "focus"; targetId: WidgetId; scrollY?: number }>
  | Readonly<{ type: "scroll"; value: number }>;

export const menuScopeId = (frame: FrameSnapshot, targetId: WidgetId): WidgetId | null => {
  let node = frame.tree.nodes.get(targetId);
  while (node && node.kind !== "menu") node = node.parentId ? frame.tree.nodes.get(node.parentId) : undefined;
  return node?.id ?? null;
};

/** React adapters own values; this function owns Select command interpretation. */
export const selectCommandEffect = (
  command: WidgetCommand,
  triggerId: WidgetId,
  contentId: WidgetId,
  enabledIds: readonly WidgetId[],
): SelectEffect | null => {
  if (command.type === "scroll" && command.targetId === contentId) return { type: "scroll", value: command.scrollY };
  if (command.type === "set-expanded" && command.targetId === triggerId) return { type: "open", value: command.expanded };
  if (command.type === "dismiss" && command.targetId === contentId) return { type: "open", value: false };
  if (command.type === "focus" && (command.targetId === triggerId || enabledIds.includes(command.targetId))) {
    return { type: "focus", targetId: command.targetId, scrollY: command.reveal?.targetId === contentId ? command.reveal.scrollY : undefined };
  }
  return command.type === "activate" && enabledIds.includes(command.targetId)
    ? { type: "select", targetId: command.targetId } : null;
};

/** Select defers dismissal; Menu defers the action itself. */
export const confirmationCompletion = (frame: FrameSnapshot, targetId: WidgetId): WidgetCommand | null => {
  let node = frame.tree.nodes.get(targetId);
  if (node?.kind === "menu-item") return { type: "activate", targetId };
  if (node?.kind !== "select-item") return null;
  while (node.parentId) {
    node = frame.tree.nodes.get(node.parentId);
    if (!node) return null;
    if (node.kind === "select-content") return { type: "dismiss", targetId: node.id };
  }
  return null;
};
