"use client";

import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import {
  isIncrementalCanvasSurfaceReader,
  useCanvasRuntime,
  useCanvasState,
} from "@/domains/canvas/public";
import {
  getSlideResizeCropCount,
  type SlideDescriptor,
  type SlideSize,
} from "@/domains/slides/public";
import { HOST_ICONOLOGY } from "@/shared/icons/iconology";
import { useUiI18n } from "@/shared/i18n";
import { DEFAULT_GRID_RENDER_METRICS } from "@/shared/metrics";
import {
  cn,
  Button,
  CollectionCard,
  SurfaceContent,
  IconButton,
  InlineRenameInput,
  SelectableItem,
  Tooltip,
  TooltipCreateHandle,
  TooltipPopup,
  TooltipTrigger,
  type TooltipHandle,
  ReorderableList,
  type ReorderAnnouncement,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chardesk/ui";









import { SlidePreviewCanvas } from "./slide-preview-canvas";
import { CustomSlideSizeDialog } from "@/widgets/dialogs/custom-slide-size-dialog";

const AddIcon = HOST_ICONOLOGY.sessionAction.create;
const DuplicateIcon = HOST_ICONOLOGY.editorAction["structured-duplicate"];
const DeleteIcon = HOST_ICONOLOGY.sessionAction.close;
const ConfigureIcon = HOST_ICONOLOGY.slideAction.configure;

const getSlideAspectRatio = (size: SlideSize) =>
  `${size.columns * DEFAULT_GRID_RENDER_METRICS.cellWidth} / ${
    size.rows * DEFAULT_GRID_RENDER_METRICS.cellHeight
  }`;

type PendingResize = {
  slideId: string;
  slideName: string;
  size: SlideSize;
  cropCount: number;
};

type SlideActionProps = ComponentProps<typeof IconButton> & {
  tooltip: string;
  tooltipHandle: TooltipHandle<string>;
};

function SlideAction({ tooltip, tooltipHandle, disabled, ...props }: SlideActionProps) {
  const button = <IconButton size="xs" disabled={disabled} {...props} />;

  return (
    <TooltipTrigger
      handle={tooltipHandle}
      payload={tooltip}
      render={disabled ? <span className="inline-flex">{button}</span> : button}
    />
  );
}

export function SlideAddButton() {
  const canvas = useCanvasRuntime();
  const { t } = useUiI18n();
  const addSlide = canvas.commands.slides.add;

  return (
    <Button tone="subtle" size="md" className="w-full justify-center gap-2" onClick={addSlide}>
      <AddIcon />
      {t("slide.add")}
    </Button>
  );
}

const SlideContentPreview = memo(function SlideContentPreview({
  sessionId,
  slide,
}: {
  sessionId: string;
  slide: SlideDescriptor;
}) {
  const canvas = useCanvasRuntime();
  const subscribe = useCallback(
    (listener: () => void) =>
      canvas.documents.subscribeMutations((mutation) => {
        if (
          mutation.documentId === sessionId &&
          "pageId" in mutation &&
          mutation.pageId === slide.id
        ) {
          listener();
        }
      }),
    [canvas.documents, sessionId, slide.id]
  );
  const getRevision = useCallback(() => {
    const reader = canvas.documents.getContentReader(sessionId, slide.id);
    return reader && isIncrementalCanvasSurfaceReader(reader)
      ? reader.getRevision()
      : -1;
  }, [canvas.documents, sessionId, slide.id]);
  const contentRevision = useSyncExternalStore(
    subscribe,
    getRevision,
    getRevision
  );
  const loadGrid = useCallback(() => {
    const reader = canvas.documents.getContentReader(sessionId, slide.id);
    return reader ? Array.from(reader.materialize()) : [];
  }, [canvas.documents, sessionId, slide.id]);

  return (
    <SlidePreviewCanvas
      slide={slide}
      contentRevision={contentRevision}
      loadGrid={loadGrid}
    />
  );
});

function ReadOnlySlideNavigator() {
  const canvas = useCanvasRuntime();
  const { t } = useUiI18n();
  const slideDeck = useCanvasState((state) => state.slideDeck);
  if (!slideDeck) return null;
  const sessionId = canvas.getState().activeCanvasId;

  return (
    <SurfaceContent data-testid="slide-navigator" data-read-only="true">
      <ol aria-label={t("slide.sidebar.title")} className="flex flex-col gap-3">
        {slideDeck.slides.map((slide, index) => {
          const active = slide.id === slideDeck.activeSlideId;
          return (
            <li key={slide.id}>
              <CollectionCard selected={active}>
                <SelectableItem
                  type="button"
                  orientation="vertical"
                  selected={active}
                  className="relative w-full overflow-hidden p-0 text-left"
                  style={{ aspectRatio: getSlideAspectRatio(slide.size) }}
                  aria-label={t(
                    active ? "slide.previewCurrent" : "slide.preview",
                    {
                      name: slide.name,
                      current: index + 1,
                      total: slideDeck.slides.length,
                    }
                  )}
                  aria-current={active ? "page" : undefined}
                  onClick={() => canvas.commands.slides.activate(slide.id)}
                >
                  <SlideContentPreview sessionId={sessionId} slide={slide} />
                </SelectableItem>
                <div className="min-w-0 truncate px-1 py-1.5 text-xs text-foreground">
                  {slide.name}
                </div>
              </CollectionCard>
            </li>
          );
        })}
      </ol>
    </SurfaceContent>
  );
}

function EditableSlideNavigator() {
  const canvas = useCanvasRuntime();
  const { t } = useUiI18n();
  const slideDeck = useCanvasState((state) => state.slideDeck);
  const duplicateSlide = canvas.commands.slides.duplicate;
  const removeSlide = canvas.commands.slides.remove;
  const renameSlide = canvas.commands.slides.rename;
  const moveSlide = canvas.commands.slides.move;
  const activateSlide = canvas.commands.slides.activate;
  const resizeSlide = canvas.commands.slides.resize;
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [configureSlideId, setConfigureSlideId] = useState<string | null>(null);
  const [pendingResize, setPendingResize] = useState<PendingResize | null>(null);
  const configureTriggerRef = useRef<HTMLButtonElement | null>(null);
  const actionTooltipHandle = useMemo(() => TooltipCreateHandle<string>(), []);
  if (!slideDeck) return null;
  const sessionId = canvas.getState().activeCanvasId;
  const pendingSlide = slideDeck.slides.find((slide) => slide.id === pendingDeleteId) ?? null;
  const configureSlideMetadata =
    slideDeck.slides.find((slide) => slide.id === configureSlideId) ?? null;
  const configureSlide = configureSlideMetadata
    ? {
        ...configureSlideMetadata,
        grid: (() => {
          const reader = canvas.documents.getContentReader(
            sessionId,
            configureSlideMetadata.id
          );
          return reader
            ? Array.from(reader.materialize())
            : [];
        })(),
      }
    : null;
  const getReorderAnnouncement = ({
    type,
    item,
    from,
    to,
    total,
  }: ReorderAnnouncement<SlideDescriptor>) => {
    const values = {
      name: item.name,
      from: from + 1,
      to: to + 1,
      total,
    };
    if (type === "grab") return t("slide.reorder.grabbed", values);
    if (type === "move") return t("slide.reorder.moved", values);
    if (type === "drop") return t("slide.reorder.dropped", values);
    return t("slide.reorder.cancelled", values);
  };

  return (
    <SurfaceContent data-testid="slide-navigator">
      <ReorderableList
        items={slideDeck.slides}
        getId={(slide) => slide.id}
        ariaLabel={t("slide.reorder.list")}
        className="flex flex-col gap-3"
        onMove={moveSlide}
        getItemLabel={(slide, index, total, grabbed) =>
          t(
            grabbed ? "slide.reorder.itemGrabbed" : "slide.reorder.item",
            { name: slide.name, current: index + 1, total }
          )
        }
        getAnnouncement={getReorderAnnouncement}
        renderItem={(slide, index, reorderState) => {
          const active = slide.id === slideDeck.activeSlideId;
          return (
            <CollectionCard
              selected={active}
              className={cn(reorderState.lifted && "shadow-dragged")}
            >
              <SelectableItem
                type="button"
                orientation="vertical"
                selected={active}
                className="relative w-full overflow-hidden p-0 text-left"
                style={{ aspectRatio: getSlideAspectRatio(slide.size) }}
                aria-label={t(
                  active ? "slide.previewCurrent" : "slide.preview",
                  {
                    name: slide.name,
                    current: index + 1,
                    total: slideDeck.slides.length,
                  }
                )}
                aria-current={active ? "page" : undefined}
                onClick={() => activateSlide(slide.id)}
              >
                <SlideContentPreview sessionId={sessionId} slide={slide} />
              </SelectableItem>
              <div
                role="group"
                aria-label={t("slide.actions", { name: slide.name })}
                className="flex items-center gap-0.5"
              >
                <InlineRenameInput
                  value={slide.name}
                  aria-label={t("slide.renameNamed", { name: slide.name })}
                  className="flex-1"
                  onCommit={(name) => renameSlide(slide.id, name)}
                />
                <SlideAction
                  type="button"
                  tooltip={t("slide.configure")}
                  tooltipHandle={actionTooltipHandle}
                  aria-label={t("slide.configureNamed", { name: slide.name })}
                  onClick={(event) => {
                    configureTriggerRef.current = event.currentTarget;
                    setConfigureSlideId(slide.id);
                  }}
                >
                  <ConfigureIcon />
                </SlideAction>
                <SlideAction
                  type="button"
                  tooltip={t("slide.duplicate")}
                  tooltipHandle={actionTooltipHandle}
                  aria-label={t("slide.duplicateNamed", { name: slide.name })}
                  onClick={() => duplicateSlide(slide.id)}
                >
                  <DuplicateIcon />
                </SlideAction>
                <SlideAction
                  type="button"
                  tooltip={t("slide.delete")}
                  tooltipHandle={actionTooltipHandle}
                  destructive
                  aria-label={t("slide.deleteNamed", { name: slide.name })}
                  disabled={slideDeck.slides.length === 1}
                  onClick={() => setPendingDeleteId(slide.id)}
                >
                  <DeleteIcon />
                </SlideAction>
              </div>
            </CollectionCard>
          );
        }}
      />
      <Tooltip handle={actionTooltipHandle}>
        {({ payload }) => <TooltipPopup side="left">{payload}</TooltipPopup>}
      </Tooltip>
      {configureSlide ? (
        <CustomSlideSizeDialog
          open
          mode="resize"
          initialSize={configureSlide.size}
          onOpenChange={(open) => {
            if (!open) setConfigureSlideId(null);
          }}
          onConfirm={(size) => {
            const cropCount = getSlideResizeCropCount(configureSlide, size);
            if (cropCount > 0) {
              setPendingResize({
                slideId: configureSlide.id,
                slideName: configureSlide.name,
                size,
                cropCount,
              });
              setConfigureSlideId(null);
              return;
            }
            resizeSlide(configureSlide.id, size);
            setConfigureSlideId(null);
          }}
          returnFocusRef={configureTriggerRef}
        />
      ) : null}
      <AlertDialog
        open={!!pendingResize}
        onOpenChange={(open) => {
          if (!open) setPendingResize(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("slide.resizeCrop.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingResize
                ? t("slide.resizeCrop.description", {
                    name: pendingResize.slideName,
                    columns: pendingResize.size.columns,
                    rows: pendingResize.size.rows,
                    count: pendingResize.cropCount,
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("dialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              tone="danger"
              onClick={() => {
                if (pendingResize) {
                  resizeSlide(pendingResize.slideId, pendingResize.size);
                }
                setPendingResize(null);
              }}
            >
              {t("slide.resizeCrop.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!pendingSlide} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("slide.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{pendingSlide ? t("slide.delete.description", { name: pendingSlide.name }) : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("dialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              tone="danger"
              onClick={() => {
                if (pendingSlide) removeSlide(pendingSlide.id);
                setPendingDeleteId(null);
              }}
            >
              {t("slide.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SurfaceContent>
  );
}

export function SlideNavigator({ readOnly = false }: { readOnly?: boolean } = {}) {
  return readOnly ? <ReadOnlySlideNavigator /> : <EditableSlideNavigator />;
}
