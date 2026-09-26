import { useRef } from "react";
import type { Point } from "@/shared/types";
import type { CanvasColorSourceChoice } from "./hooks/interaction/gestures/colorPickerInteraction";
import { getCellViewportRect as gridCellRect } from "@chardesk/rendering";
import { DEFAULT_CANVAS_CELL_METRICS } from "@/shared/fonts/canvas-profile";
import { HOST_ICONOLOGY } from "@/shared/icons/iconology";
import { useUiI18n } from "@/shared/i18n";
import { Button, ColorSwatch, Popover, PopoverAnchor, PopoverContent } from "@chardesk/ui";
import { EditorWidget } from "@/widgets/editor-chrome/public";

type CanvasColorSourceChooserProps = {
  choice: CanvasColorSourceChoice;
  offset: Point;
  zoom: number;
  onSelect: (source: "foreground" | "background") => void;
  onCancel: () => void;
};

export function CanvasColorSourceChooser({
  choice,
  offset,
  zoom,
  onSelect,
  onCancel,
}: CanvasColorSourceChooserProps) {
  const { t } = useUiI18n();
  const foregroundButtonRef = useRef<HTMLButtonElement>(null);
  const rect = gridCellRect(choice.point, { offset, zoom }, DEFAULT_CANVAS_CELL_METRICS);
  const ForegroundIcon = HOST_ICONOLOGY.toolbarAction.text;
  const BackgroundIcon = HOST_ICONOLOGY.toolbarAction.bg;

  return (
    <EditorWidget role="contextual">
      <Popover open modal onOpenChange={(open) => !open && onCancel()}>
        <PopoverAnchor asChild>
          <span
            data-canvas-ui="true"
            data-testid="canvas-color-source-anchor"
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          side="bottom"
          align="center"
          sideOffset={6}
          collisionPadding={8}
          role="toolbar"
          aria-label={t("color.chooseCellSource")}
          className="flex w-fit gap-0.5 p-1"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            foregroundButtonRef.current?.focus({ preventScroll: true });
          }}
        >
          <Button
            ref={foregroundButtonRef}
            type="button"
            tone="subtle"
            shape="square"
            size="sm"
            aria-label={t("color.useCellChar", { color: choice.foreground })}
            className="relative"
            onClick={() => onSelect("foreground")}
          >
            <ForegroundIcon data-icon="inline-start" />
            <ColorSwatch
              aria-hidden="true"
              color={choice.foreground}
              shape="circle"
              className="absolute bottom-0.5 right-0.5 size-2.5"
            />
          </Button>
          <Button
            type="button"
            tone="subtle"
            shape="square"
            size="sm"
            aria-label={t("color.useCellBg", { color: choice.background })}
            className="relative"
            onClick={() => onSelect("background")}
          >
            <BackgroundIcon data-icon="inline-start" />
            <ColorSwatch
              aria-hidden="true"
              color={choice.background}
              shape="circle"
              className="absolute bottom-0.5 right-0.5 size-2.5"
            />
          </Button>
        </PopoverContent>
      </Popover>
    </EditorWidget>
  );
}
