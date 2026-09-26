import { useCallback } from "react";
import { resolveFillHotkeyChar } from "@/domains/actions/public";
import { useEditor, useEditorShortcutLayer } from "@/domains/editor/public";
import {
  canUseCanvasEditorShortcutTarget,
  type CanvasEditorCapabilities,
} from "@/widgets/canvas-editor/canvasEditorCapabilities";
import {
  SHORTCUT_PRIORITY,
  useShortcutLayer,
} from "@/shared/shortcuts/dispatcher";

export const useGlobalShortcutCommands = ({
  capabilities,
}: {
  capabilities: CanvasEditorCapabilities;
}) => {
  const editor = useEditor();
  const canExecuteEntry = useCallback(
    (entry: { target: { type: "command" | "tool"; id: string } }) =>
      canUseCanvasEditorShortcutTarget(capabilities, entry.target),
    [capabilities],
  );
  useEditorShortcutLayer({
    enabled:
      capabilities.navigate ||
      capabilities.select ||
      capabilities.copy ||
      capabilities.mutateContent,
    canExecuteEntry,
  });
  useShortcutLayer({
    id: "global-printable-selection-fill",
    priority: SHORTCUT_PRIORITY.globalAction,
    enabled: capabilities.mutateContent,
    onKeyDown: (input, context) => {
      if (
        context.targetKind === "editable" ||
        context.targetKind === "managed-canvas" ||
        context.targetKind === "overlay"
      ) {
        return;
      }

      const fillChar = resolveFillHotkeyChar(input);
      if (!fillChar) return;
      const result = editor.commands.execute("fill-selection-char", {
        source: "global-hotkey",
        fillChar,
      }, "global-hotkey");
      return result.status === "succeeded"
        ? { claimed: true, preventDefault: true }
        : undefined;
    },
  });
};
