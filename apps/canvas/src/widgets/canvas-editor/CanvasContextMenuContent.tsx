import type { RefObject } from "react";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@chardesk/ui";
import {
  EDITOR_COMMAND_META,
  getEditorCommandShortcutLabel,
} from "@/domains/actions/public";
import type { ContextMenuEntry } from "@/domains/actions/public";
import { useEditor, useEditorKeymapSnapshot } from "@/domains/editor/public";
import { useUiI18n, type I18nKey } from "@/shared/i18n";
import { EditorWidget } from "@/widgets/editor-chrome/public";

const LABEL_KEY_BY_ID: Record<string, I18nKey> = {
  copy: "context.copyText",
  "copy-rich": "context.copyColor",
  "copy-ansi": "context.copyAnsi",
  cut: "context.cutZone",
  paste: "context.paste",
  "fill-selection-char": "context.fillSelection",
  "snapshot-png": "context.snapshotPng",
  "delete-selection": "context.delete",
};

type CanvasContextMenuContentProps = {
  entries: readonly ContextMenuEntry[];
  managedTextareaRef: RefObject<HTMLTextAreaElement | null>;
};

export const CanvasContextMenuContent = ({
  entries,
  managedTextareaRef,
}: CanvasContextMenuContentProps) => {
  const { t } = useUiI18n();
  const editor = useEditor();
  useEditorKeymapSnapshot();

  const renderEntry = (entry: ContextMenuEntry, index: number) => {
    if (entry.type === "separator") {
      return <ContextMenuSeparator key={`sep-${index}`} />;
    }

    if (entry.type === "submenu") {
      const Icon = entry.icon;
      const hasEnabledChild = entry.children.some(
        (child) =>
          child.type === "action" &&
          editor.commands.canExecute(child.id, undefined, "availability")
      );
      return (
        <ContextMenuSub key={`sub-${entry.label}-${index}`}>
          <ContextMenuSubTrigger disabled={!hasEnabledChild}>
            {Icon && <Icon />}
            <span>
              {entry.label === "Layer" ? t("context.layer") : entry.label}
            </span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {entry.children.map(renderEntry)}
          </ContextMenuSubContent>
        </ContextMenuSub>
      );
    }

    const meta = EDITOR_COMMAND_META[entry.id];
    const Icon = meta.icon;
    const labelKey = LABEL_KEY_BY_ID[entry.id];
    const shortcutLabel = getEditorCommandShortcutLabel(editor.keymap, entry.id);
    return (
      <ContextMenuItem
        key={entry.id}
        onClick={() =>
          editor.commands.execute(entry.id, {
            source: "context-menu",
            managedTextarea: managedTextareaRef.current,
          }, "context-menu")
        }
        variant={meta.destructive ? "destructive" : "default"}
        disabled={!editor.commands.canExecute(
          entry.id,
          undefined,
          "availability"
        )}
      >
        {Icon && <Icon />}
        <span>{labelKey ? t(labelKey) : meta.label}</span>
        {shortcutLabel && (
          <ContextMenuShortcut>{shortcutLabel}</ContextMenuShortcut>
        )}
      </ContextMenuItem>
    );
  };

  return (
    <EditorWidget role="contextual">
      <ContextMenuContent className="w-56">
        {entries.map(renderEntry)}
      </ContextMenuContent>
    </EditorWidget>
  );
};
