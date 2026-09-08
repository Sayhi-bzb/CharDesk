import {
  useMemo,
  type ComponentProps,
  type MouseEvent,
} from "react";
import { useShallow } from "zustand/react/shallow";

import { useCanvasRuntime, useCanvasState, useCanvasViewport } from "@/domains/canvas/public";
import {
  canSplitStructuredSplitBoxLeaf,
  getStructuredNodeBounds,
  getStructuredSplitBoxLeafAtPoint,
  isStructuredSplitBoxLineHandle,
} from "@/domains/structured-content/public";
import { HOST_ICONOLOGY } from "@/shared/icons/iconology";
import { useUiI18n } from "@/shared/i18n";
import {
  cn,
  Button,
  FloatingSurface,
  Tooltip,
  TooltipCreateHandle,
  TooltipPopup,
  TooltipTrigger,
  type TooltipHandle,
} from "@chardesk/ui";
import { gridCellRect } from "@/shared/metrics";
import type { NodeBounds } from "@/shared/types";



import type { EditorViewportFrame } from "@/widgets/editor-chrome/public";
import { useCanvasLiveViewportOptional } from "./engine/CanvasWorkspace";

const SplitHorizontalIcon = HOST_ICONOLOGY.selectionAction["split-horizontal"];
const SplitVerticalIcon = HOST_ICONOLOGY.selectionAction["split-vertical"];
const DeleteDividerIcon = HOST_ICONOLOGY.selectionAction["delete-divider"];

type StructuredSplitToolbarProps = {
  containerSize: { width: number; height: number } | undefined;
  viewportFrame?: EditorViewportFrame;
};

const TOOLBAR_WIDTH = 110;
const TOOLBAR_HEIGHT = 38;
const TOOLBAR_GAP = 8;

const toolbarClassName = cn(
  "backdrop-blur-none animate-in fade-in duration-[var(--motion-fast)] motion-reduce:animate-none"
);

const preserveCanvasFocus = (event: MouseEvent<HTMLElement>) => {
  event.preventDefault();
};

type ToolbarActionProps = Omit<
  ComponentProps<typeof Button>,
  "tone" | "shape" | "size"
> & {
  tooltip: string;
  tooltipHandle: TooltipHandle<string>;
};

function ToolbarAction({
  tooltip,
  tooltipHandle,
  disabled,
  onMouseDown,
  ...props
}: ToolbarActionProps) {
  const button = (
    <Button
      tone="subtle"
      shape="square"
      size="md"
      disabled={disabled}
      onMouseDown={(event) => {
        preserveCanvasFocus(event);
        onMouseDown?.(event);
      }}
      {...props}
    />
  );

  return (
    <TooltipTrigger
      handle={tooltipHandle}
      payload={tooltip}
      render={disabled ? <span className="inline-flex">{button}</span> : button}
    />
  );
}

const getBounds = (bounds: NodeBounds) => ({
  minX: bounds.x,
  minY: bounds.y,
  maxX: bounds.x + bounds.width - 1,
  maxY: bounds.y + bounds.height - 1,
});

export function StructuredSplitToolbar({
  containerSize,
  viewportFrame,
}: StructuredSplitToolbarProps) {
  const canvas = useCanvasRuntime();
  const liveViewport = useCanvasLiveViewportOptional();
  const fallbackViewport = useCanvasViewport();
  const { t } = useUiI18n();
  const tooltipHandle = useMemo(() => TooltipCreateHandle<string>(), []);
  const {
    canvasMode,
    structuredScene,
    selectedStructuredNodeIds,
    selectedStructuredSplitHandle,
    hoveredGrid,
    structuredContextPoint,
  } = useCanvasState(
    useShallow((state) => ({
      canvasMode: state.canvasMode,
      structuredScene: state.structuredScene,
      selectedStructuredNodeIds: state.selectedStructuredNodeIds,
      selectedStructuredSplitHandle: state.selectedStructuredSplitHandle,
      hoveredGrid: state.hoveredGrid,
      structuredContextPoint: state.structuredContextPoint,
    }))
  );
  const offset = liveViewport?.offset ?? fallbackViewport.offset;
  const zoom = liveViewport?.zoom ?? fallbackViewport.zoom;

  const model = useMemo(() => {
    if (canvasMode !== "structured" || selectedStructuredNodeIds.length !== 1) {
      return null;
    }
    const node = structuredScene.find(
      (candidate) =>
        candidate.id === selectedStructuredNodeIds[0] &&
        candidate.type === "splitBox"
    );
    if (!node || node.type !== "splitBox") return null;

    const activePoint =
      [hoveredGrid, structuredContextPoint].find((point) =>
        point ? !!getStructuredSplitBoxLeafAtPoint(node, point) : false
      ) ?? null;
    const leaf = activePoint
      ? getStructuredSplitBoxLeafAtPoint(node, activePoint)
      : null;
    const dividerSelected =
      selectedStructuredSplitHandle?.nodeId === node.id &&
      isStructuredSplitBoxLineHandle(selectedStructuredSplitHandle.handle);

    return {
      node,
      activePoint,
      canSplitHorizontal:
        !dividerSelected &&
        !!leaf &&
        canSplitStructuredSplitBoxLeaf(leaf, "horizontal"),
      canSplitVertical:
        !dividerSelected &&
        !!leaf &&
        canSplitStructuredSplitBoxLeaf(leaf, "vertical"),
      canDeleteDivider: dividerSelected,
    };
  }, [
    canvasMode,
    hoveredGrid,
    selectedStructuredNodeIds,
    selectedStructuredSplitHandle,
    structuredContextPoint,
    structuredScene,
  ]);

  const style = useMemo(() => {
    if (!containerSize || !model) return null;
    const bounds = getBounds(getStructuredNodeBounds(model.node));
    const startRect = gridCellRect(
      { x: bounds.minX, y: bounds.minY },
      { offset, zoom }
    );
    const endRect = gridCellRect(
      { x: bounds.maxX, y: bounds.maxY },
      { offset, zoom }
    );
    const selectionCenter = (startRect.x + endRect.x + endRect.width) / 2;
    const selectionBottom = endRect.y + endRect.height;
    const usableRect = viewportFrame?.usableRect ?? {
      x: 0,
      y: 0,
      width: containerSize.width,
      height: containerSize.height,
    };
    const minLeft = usableRect.x + 8;
    const maxLeft = Math.max(
      minLeft,
      usableRect.x + usableRect.width - TOOLBAR_WIDTH - 8
    );
    const left = Math.max(
      minLeft,
      Math.min(maxLeft, selectionCenter - TOOLBAR_WIDTH / 2)
    );
    const topCandidate = startRect.y - TOOLBAR_HEIGHT - TOOLBAR_GAP;
    const minTop = usableRect.y + 8;
    const maxTop = Math.max(
      minTop,
      usableRect.y + usableRect.height - TOOLBAR_HEIGHT - 8
    );
    const top =
      topCandidate >= minTop
        ? topCandidate
        : Math.min(maxTop, selectionBottom + TOOLBAR_GAP);

    return { left, top: Math.max(minTop, Math.min(maxTop, top)) };
  }, [containerSize, model, offset, viewportFrame?.usableRect, zoom]);
  if (!model || !style) return null;

  const split = (direction: "horizontal" | "vertical") => {
    if (!model.activePoint) return;
    canvas.commands.structured.splitLeaf(
      model.node.id,
      model.activePoint,
      direction
    );
  };

  return (
    <div
      data-canvas-ui="true"
      className="absolute z-(--layer-contextual) pointer-events-auto"
      style={style}
    >
      <FloatingSurface variant="control-bar" asChild>
        <div
          role="toolbar"
          data-selection-toolbar="true"
          className={toolbarClassName}
          aria-label={t("selection.splitControls")}
        >
          <ToolbarAction
            aria-label={t("selection.splitHorizontal")}
            tooltip={t("selection.splitHorizontalTitle")}
            tooltipHandle={tooltipHandle}
            disabled={!model.canSplitHorizontal || !model.activePoint}
            onClick={() => split("horizontal")}
          >
            <SplitHorizontalIcon data-icon="inline-start" />
          </ToolbarAction>
          <ToolbarAction
            aria-label={t("selection.splitVertical")}
            tooltip={t("selection.splitVerticalTitle")}
            tooltipHandle={tooltipHandle}
            disabled={!model.canSplitVertical || !model.activePoint}
            onClick={() => split("vertical")}
          >
            <SplitVerticalIcon data-icon="inline-start" />
          </ToolbarAction>
          <ToolbarAction
            aria-label={t("selection.deleteDivider")}
            tooltip={t("selection.deleteDividerTitle")}
            tooltipHandle={tooltipHandle}
            disabled={!model.canDeleteDivider}
            destructive
            onClick={() => canvas.commands.selection.delete()}
          >
            <DeleteDividerIcon data-icon="inline-start" />
          </ToolbarAction>
          <Tooltip handle={tooltipHandle}>
            {({ payload }) => (
              <TooltipPopup side="top">{payload}</TooltipPopup>
            )}
          </Tooltip>
        </div>
      </FloatingSurface>
    </div>
  );
}
