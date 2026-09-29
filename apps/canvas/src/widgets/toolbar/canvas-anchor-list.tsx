import { useMemo, useRef, useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  InlineRenameInput,
  SelectableItem,
  SurfaceContent,
  Tooltip,
  TooltipCreateHandle,
  TooltipPopup,
  TooltipTrigger,
} from "@chardesk/ui";
import {
  getCanvasAnchorBranchIds,
  useCanvasRuntime,
  type CanvasAnchor,
} from "@/domains/canvas/public";
import { DEFAULT_CANVAS_CELL_METRICS } from "@/shared/fonts/canvas-profile";
import { useUiI18n } from "@/shared/i18n";
import { useCanvasViewOptional } from "@/widgets/canvas-editor/engine/CanvasWorkspace";
import { CanvasAnchorTreeList } from "./canvas-anchor-tree-list";

export function CanvasAnchorList({
  anchors,
  readOnly,
}: {
  anchors: readonly CanvasAnchor[];
  readOnly: boolean;
}) {
  const { t } = useUiI18n();
  const runtime = useCanvasRuntime();
  const view = useCanvasViewOptional();
  const [renameId, setRenameId] = useState<string | null>(null);
  const renamePending = useRef<string | null>(null);
  const tooltipHandle = useMemo(() => TooltipCreateHandle<string>(), []);
  const finishRename = () => {
    renamePending.current = null;
    setRenameId(null);
  };

  const navigate = (anchor: CanvasAnchor) => {
    if (anchor.detached || !view?.containerSize) return;
    const { width, height } = view.containerSize;
    const zoom = view.runtime.camera.getTargetViewport().zoom;
    const center = {
      x: (anchor.point.x + 0.5) * DEFAULT_CANVAS_CELL_METRICS.cellWidth,
      y: (anchor.point.y + 0.5) * DEFAULT_CANVAS_CELL_METRICS.cellHeight,
    };
    view.runtime.camera.animateTo({
      zoom,
      offset: {
        x: width / 4 - center.x * zoom,
        y: height / 4 - center.y * zoom,
      },
    }, { duration: 180 });
    view.flashAnchor(anchor.id);
  };

  const move = (id: string, parentId: string | null, siblingIndex: number) => {
    runtime.commands.anchors.move(id, parentId, siblingIndex);
  };

  const item = (anchor: CanvasAnchor) => {
    const branchCount = getCanvasAnchorBranchIds(anchors, anchor.id).length;
    if (anchor.id === renameId) {
      return (
        <InlineRenameInput
          value={anchor.label}
          aria-label={t("anchors.renameLabel")}
          className="w-full"
          autoFocus
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onCommit={(name) => {
            runtime.commands.anchors.rename(anchor.id, name);
            finishRename();
          }}
          onCancel={finishRename}
        />
      );
    }
    const title = anchor.detached
      ? `${anchor.label} — ${t("anchors.invalid")}`
      : anchor.label;
    const button = (
      <TooltipTrigger
        handle={tooltipHandle}
        payload={title}
        render={
          <SelectableItem
            type="button"
            className="h-7 w-full px-1.5 py-0 text-left"
            muted={anchor.detached}
            aria-label={title}
            onClick={() => navigate(anchor)}
          />
        }
      >
        <span className="min-w-0 truncate">
          {anchor.label}
        </span>
      </TooltipTrigger>
    );
    if (readOnly) return button;
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
        <ContextMenuContent onCloseAutoFocus={(event) => {
          if (renamePending.current === anchor.id) event.preventDefault();
        }}>
          <ContextMenuItem
            onSelect={() => {
              renamePending.current = anchor.id;
              setRenameId(anchor.id);
            }}
          >
            {t("anchors.rename")}
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => runtime.commands.anchors.remove(anchor.id)}
          >
            {branchCount > 1
              ? t("anchors.removeBranch", { count: branchCount })
              : t("anchors.remove")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <SurfaceContent className="min-w-0 p-1" role="tabpanel" aria-label={t("anchors.title")}>
      {anchors.length === 0 ? (
        <p className="px-1.5 py-3 text-xs text-muted-foreground">{t("anchors.empty")}</p>
      ) : readOnly ? (
        <ol aria-label={t("anchors.title")} className="min-w-0">
          {anchors.map((anchor) => <li key={anchor.id}>{item(anchor)}</li>)}
        </ol>
      ) : (
        <CanvasAnchorTreeList
          anchors={anchors}
          ariaLabel={t("anchors.tree.list")}
          onMove={move}
          getItemLabel={(anchor, depth, index, total) => t("anchors.tree.item", {
            name: anchor.label, level: depth + 1, current: index + 1, total,
          })}
          getMoveAnnouncement={(anchor) => t("anchors.tree.moved", { name: anchor.label })}
          renderItem={item}
        />
      )}
      <Tooltip handle={tooltipHandle}>
        {({ payload }) => <TooltipPopup side="right">{payload}</TooltipPopup>}
      </Tooltip>
    </SurfaceContent>
  );
}
