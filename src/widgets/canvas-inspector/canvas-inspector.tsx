"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useShallow } from "zustand/react/shallow";

import { EDITOR_COMMAND_META } from "@/domains/actions/public";
import { useCanvasRuntime, useCanvasState } from "@/domains/canvas/public";
import { useEditor } from "@/domains/editor/public";
import { useUiI18n } from "@/shared/i18n";
import { HOST_ICONOLOGY } from "@/shared/icons/iconology";
import { COLOR_PRIMARY_TEXT } from "@/shared/lib/constants";
import {
  SHORTCUT_PRIORITY,
  useShortcutLayer,
} from "@/shared/shortcuts/dispatcher";
import {
  Button,
  ContentScrollArea,
  ColorSwatch,
  FloatingSurface,
  SurfaceContent,
  Surface,
  Tooltip,
  TooltipCreateHandle,
  TooltipPopup,
  TooltipTrigger,
} from "@chardesk/ui";





import { ColorPickerPanel } from "@/widgets/color-picker";
import type { EditorFormFactor } from "@/widgets/editor-chrome/public";
import { deriveCanvasInspectorModel } from "./model";
import {
  textAttributeNames,
  type TextAttributeName,
} from "./text-format-model";

type CanvasInspectorControlProps = {
  available?: boolean;
  formFactor: EditorFormFactor;
  readOnly?: boolean;
};

const textAttributeMeta = {
  bold: {
    icon: HOST_ICONOLOGY.selectionAction.bold,
    label: "selection.bold",
    toggleLabel: "selection.toggleBold",
  },
  italic: {
    icon: HOST_ICONOLOGY.selectionAction.italic,
    label: "selection.italic",
    toggleLabel: "selection.toggleItalic",
  },
  underline: {
    icon: HOST_ICONOLOGY.selectionAction.underline,
    label: "selection.underline",
    toggleLabel: "selection.toggleUnderline",
  },
  strike: {
    icon: HOST_ICONOLOGY.selectionAction.strike,
    label: "selection.strike",
    toggleLabel: "selection.toggleStrike",
  },
  inverse: {
    icon: HOST_ICONOLOGY.selectionAction.inverse,
    label: "selection.inverse",
    toggleLabel: "selection.toggleInverse",
  },
} as const;

const actionIds = [
  "structured-send-to-back",
  "structured-send-backward",
  "structured-bring-forward",
  "structured-bring-to-front",
] as const;

const formatActionIds = {
  bold: "format-bold",
  italic: "format-italic",
  underline: "format-underline",
  strike: "format-strike",
  inverse: "format-inverse",
} as const;

export function CanvasInspectorControl({
  available = true,
  formFactor,
  readOnly = false,
}: CanvasInspectorControlProps) {
  const canvas = useCanvasRuntime();
  const editor = useEditor();
  const { t } = useUiI18n();
  const actionTooltipHandle = useMemo(
    () => TooltipCreateHandle<ReactNode>(),
    []
  );
  const state = useCanvasState(
    useShallow((value) => ({
      canvasMode: value.canvasMode,
      tool: value.tool,
      brushColor: value.brushColor,
      brushBackgroundColor: value.brushBackgroundColor,
      contentSurface: value.contentSurface,
      structuredScene: value.structuredScene,
      interaction: value.interaction,
    }))
  );
  const model = useMemo(
    () =>
      deriveCanvasInspectorModel({
        canvasMode: state.canvasMode,
        tool: state.tool,
        brushColor: state.brushColor,
        brushBackgroundColor: state.brushBackgroundColor,
        grid: state.contentSurface.reader,
        staticGridSelection: state.interaction.staticGridSelection,
        structuredScene: state.structuredScene,
        selectedStructuredNodeIds: state.interaction.selectedStructuredNodeIds,
        structuredTextSelection: state.interaction.structuredTextSelection,
      }),
    [
      state.brushBackgroundColor,
      state.brushColor,
      state.canvasMode,
      state.contentSurface,
      state.interaction.selectedStructuredNodeIds,
      state.structuredScene,
      state.interaction.structuredTextSelection,
      state.interaction.staticGridSelection,
      state.tool,
    ]
  );
  const [panelState, setPanelState] = useState({
    formFactor,
    open: formFactor !== "phone",
    userSet: false,
    tool: state.tool,
  });
  const open =
    panelState.formFactor === formFactor || panelState.userSet
      ? panelState.open
      : formFactor !== "phone";
  const panelOpen = open && state.tool !== "pan";
  const toggleInspectorRef = useRef<() => void>(() => undefined);

  if (panelState.tool !== state.tool) {
    setPanelState({
      ...panelState,
      open: state.tool === "pan" ? false : open,
      userSet: state.tool === "pan" ? true : panelState.userSet,
      tool: state.tool,
    });
  }

  const close = useCallback(() => {
    setPanelState({
      formFactor,
      open: false,
      userSet: true,
      tool: state.tool,
    });
    canvas.commands.interaction.setColorPickerTarget(null);
  }, [canvas, formFactor, state.tool]);

  const setOpenState = useCallback(
    (nextOpen: boolean) => {
      setPanelState({
        formFactor,
        open: nextOpen,
        userSet: true,
        tool: state.tool,
      });
      if (!nextOpen) {
        canvas.commands.interaction.setColorPickerTarget(null);
      }
    },
    [canvas, formFactor, state.tool]
  );
  toggleInspectorRef.current = () => setOpenState(!panelOpen);

  useEffect(() => {
    canvas.commands.interaction.setColorPickerTarget(null);
    return () => canvas.commands.interaction.setColorPickerTarget(null);
  }, [canvas, state.canvasMode, state.tool]);

  useEffect(() => {
    if (!available) return;

    const disposeCommand = editor.commands.register("canvas.inspector", {
      id: "ui.toggle-inspector",
      execute: () => {
        toggleInspectorRef.current();
        return { handled: true, status: "succeeded" };
      },
    });
    const disposeBinding = editor.keymap.register("canvas.inspector", {
      id: "command:toggle-inspector",
      label: "Toggle Inspector",
      category: "Canvas",
      scope: "canvas",
      shortcuts: ["mod+k p"],
      target: { type: "command", id: "ui.toggle-inspector" },
      when: ({ targetKind, tool }) =>
        tool?.id !== "pan" && targetKind !== "editable" && targetKind !== "overlay",
    });
    return () => {
      disposeBinding();
      disposeCommand();
    };
  }, [available, editor]);

  useShortcutLayer({
    id: "canvas-inspector",
    priority: SHORTCUT_PRIORITY.dynamicCanvasCommand,
    enabled: available && state.tool !== "pan",
    onKeyDown: (input, context) => {
      if (
        context.targetKind === "editable" ||
        context.targetKind === "overlay"
      ) {
        return;
      }
      if (input.key === "Escape" && (panelOpen || state.interaction.canvasColorPickerTarget)) {
        close();
        return { claimed: true, preventDefault: true };
      }
    },
  });

  if (!available) return null;

  const applyColor = (color: string) => {
    if (readOnly) return;
    if (model.mode === "grid") {
      if (model.canvasPickDestination === "background") {
        canvas.commands.preferences.setBrushBackgroundColor(color);
        if (model.hasSelection) {
          canvas.commands.selection.setBackgroundColor(color);
        }
      } else {
        canvas.commands.preferences.setBrushColor(color);
        if (model.hasSelection) {
          canvas.commands.selection.setForegroundColor(color);
        }
      }
      return;
    }

    canvas.commands.preferences.setBrushColor(color);
    if (model.structured.target === "text-range") {
      canvas.commands.structured.setTextColor(color);
    } else if (model.structured.target === "nodes") {
      canvas.commands.structured.setSelectionPrimaryColor(color);
    }
  };

  const execute = (id: (typeof actionIds)[number]) => {
    if (readOnly) return;
    editor.commands.execute(id, { source: "inspector" }, "inspector");
  };

  const textFormatting =
    model.mode === "grid" ? model.textFormatting : null;
  const textFormattingEnabled = textFormatting !== null;
  const layerActionsEnabled =
    model.mode === "structured" && model.structured.target === "nodes";

  const setTextAttribute = (attribute: TextAttributeName) => {
    if (readOnly || !textFormattingEnabled) return;
    editor.commands.execute(formatActionIds[attribute], { source: "inspector" }, "inspector");
  };

  const renderTextAttribute = (attribute: TextAttributeName) => {
    const meta = textAttributeMeta[attribute];
    const state = textFormatting?.[attribute] ?? "off";
    const Icon = meta.icon;
    return (
      <TooltipTrigger
        key={attribute}
        handle={actionTooltipHandle}
        payload={t(meta.label)}
        render={
          <Button
            type="button"
            tone="subtle"
            shape="square"
            size="xs"
            pressed={state === "on"}
            aria-pressed={state === "mixed" ? "mixed" : state === "on"}
            aria-label={t(meta.toggleLabel)}
            disabled={readOnly || !textFormattingEnabled}
            className="relative"
            onClick={() => setTextAttribute(attribute)}
          />
        }
      >
        <Icon data-icon="inline-start" />
        {state === "mixed" && (
          <span
            aria-hidden="true"
            className="absolute bottom-1 h-0.5 w-2 rounded-full bg-current"
          />
        )}
      </TooltipTrigger>
    );
  };

  const renderAction = (id: (typeof actionIds)[number]) => {
    const meta = EDITOR_COMMAND_META[id];
    const Icon = meta.icon;
    const enabled =
      layerActionsEnabled &&
      !readOnly &&
      editor.commands.canExecute(id, undefined, "availability");
    return (
      <TooltipTrigger
        key={id}
        handle={actionTooltipHandle}
        payload={meta.label}
        render={
          <Button
            type="button"
            tone={meta.destructive ? "danger" : "subtle"}
            shape="square"
            size="xs"
            aria-label={meta.label}
            disabled={!enabled}
            onClick={() => execute(id)}
          />
        }
      >
        {Icon && <Icon />}
      </TooltipTrigger>
    );
  };

  return (
    <div className="pointer-events-auto relative flex-none">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              tone="subtle"
              shape="square"
              size="md"
              open={panelOpen}
              aria-label={t("inspector.toggle")}
              aria-controls="canvas-inspector-panel"
              aria-keyshortcuts="Meta+K P Control+K P"
              disabled={state.tool === "pan"}
              onClick={() => setOpenState(!panelOpen)}
            />
          }
        >
          <ColorSwatch
            data-testid="canvas-inspector-swatch"
            aria-hidden="true"
            color={model.activeColor}
            className="size-5"
          />
        </TooltipTrigger>
        <TooltipPopup side="bottom">{t("inspector.title")}</TooltipPopup>
      </Tooltip>

      <Tooltip handle={actionTooltipHandle}>
        {({ payload }) => (
          <TooltipPopup side="bottom">{payload}</TooltipPopup>
        )}
      </Tooltip>

      {panelOpen && (
        <FloatingSurface variant="panel" asChild>
          <section
            id="canvas-inspector-panel"
            data-testid="canvas-inspector-panel"
            aria-label={t("inspector.title")}
            className="absolute left-[calc(100%+0.5rem)] top-0 w-[min(10rem,calc(100vw-2rem))]"
            onPointerDown={(event) => event.stopPropagation()}
          >
          <ContentScrollArea
            className="w-full overflow-hidden rounded-[inherit]"
            viewportClassName="max-h-[min(32rem,calc(100vh-5rem))]"
          >
            <SurfaceContent
              data-testid="canvas-inspector-content"
              inert={readOnly}
              aria-disabled={readOnly}
              className="flex flex-col gap-2"
            >
              <ColorPickerPanel
                value={model.activeColor}
                onPick={applyColor}
                density="compact"
                defaultColor={COLOR_PRIMARY_TEXT}
                canvasPickDestination={model.canvasPickDestination}
                className="w-full p-0"
              />

              <div
                data-testid="canvas-inspector-footer"
                className="flex items-center justify-between gap-0.5"
              >
                <Surface kind="embedded" asChild>
                  <div
                    role="toolbar"
                    aria-label={t(
                      model.mode === "grid"
                        ? "selection.textFormatting"
                        : "inspector.arrange"
                    )}
                    data-testid="canvas-inspector-footer-actions"
                    className="flex w-full items-center justify-between gap-0.5 p-px"
                  >
                    {model.mode === "grid"
                      ? textAttributeNames.map(renderTextAttribute)
                      : actionIds.map(renderAction)}
                  </div>
                </Surface>
              </div>
            </SurfaceContent>
          </ContentScrollArea>
          </section>
        </FloatingSurface>
      )}
    </div>
  );
}
