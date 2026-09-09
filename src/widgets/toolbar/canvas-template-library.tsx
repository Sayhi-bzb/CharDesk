"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  SidebarGroup,
  SidebarGroupContent,
  SelectableItem,
  Surface,
  useUiTheme,
} from "@chardesk/ui";
import {
  CANVAS_COMPONENT_TEMPLATES,
  CANVAS_TEMPLATE_MIME,
  getCanvasTemplateMaterialization,
  setActiveCanvasTemplateDragId,
  type CanvasTemplateDefinition,
  type CanvasTemplateId,
} from "@/domains/canvas-templates/public";
import { useResolvedContentTheme } from "@/domains/document/public";
import { CellFrameCanvas } from "@/shared/components/CellFrameCanvas";

const sortTemplatesByLabel = <
  T extends { id: CanvasTemplateId; label: string },
>(
  templates: readonly T[]
) =>
  [...templates].sort(
    (a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id)
  );

const FALLBACK_DRAG_PREVIEW_WIDTH = 160;
const FALLBACK_DRAG_PREVIEW_HEIGHT = 90;

type CanvasTemplateDragPreview = {
  templateId: CanvasTemplateId;
  width: number;
  height: number;
  hotspotX: number;
  hotspotY: number;
  clientX: number;
  clientY: number;
  overSidebar: boolean;
};

type PendingDragPreviewPosition = {
  clientX?: number;
  clientY?: number;
  overSidebar: boolean;
};

const clampDragPreviewOffset = (value: number, size: number) =>
  Math.min(Math.max(value, 0), size);

const resolveDragPreviewCoordinate = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

const handleTemplateDragStart = (
  event: ReactDragEvent<HTMLButtonElement>,
  template: { id: CanvasTemplateId },
  showDragPreview: (preview: CanvasTemplateDragPreview) => void,
  setNativeDragImage: (dataTransfer: DataTransfer) => void
) => {
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(CANVAS_TEMPLATE_MIME, template.id);
  setActiveCanvasTemplateDragId(template.id);

  const previewElement =
    event.currentTarget.querySelector<HTMLElement>(
      '[data-slot="canvas-template-preview"]'
    ) ?? event.currentTarget;
  const rect = previewElement.getBoundingClientRect();
  const width = rect.width > 0 ? rect.width : FALLBACK_DRAG_PREVIEW_WIDTH;
  const height = rect.height > 0 ? rect.height : FALLBACK_DRAG_PREVIEW_HEIGHT;
  const clientX = resolveDragPreviewCoordinate(
    event.clientX,
    rect.left + width / 2
  );
  const clientY = resolveDragPreviewCoordinate(
    event.clientY,
    rect.top + height / 2
  );

  showDragPreview({
    templateId: template.id,
    width,
    height,
    hotspotX: clampDragPreviewOffset(clientX - rect.left, width),
    hotspotY: clampDragPreviewOffset(clientY - rect.top, height),
    clientX,
    clientY,
    overSidebar: true,
  });
  setNativeDragImage(event.dataTransfer);
};

function CanvasTemplateDragOverlay({
  preview,
}: {
  preview: CanvasTemplateDragPreview | null;
}) {
  const { resolvedTheme } = useUiTheme();
  const contentTheme = useResolvedContentTheme(resolvedTheme);
  if (!preview || !preview.overSidebar || typeof document === "undefined") {
    return null;
  }
  const projection = getCanvasTemplateMaterialization(
    preview.templateId,
    contentTheme
  );

  return createPortal(
    <div
      data-slot="canvas-template-drag-overlay"
      data-testid="canvas-template-drag-overlay"
      className="pointer-events-none fixed left-0 top-0 z-(--layer-drag-preview) overflow-hidden will-change-transform"
      style={{
        width: `${preview.width}px`,
        height: `${preview.height}px`,
        transform: `translate3d(${preview.clientX - preview.hotspotX}px, ${preview.clientY - preview.hotspotY}px, 0)`,
      }}
      aria-hidden="true"
    >
      <CellFrameCanvas
        source={projection.source}
        viewport={projection.viewport}
        fit="contain"
      />
    </div>,
    document.body
  );
}

function VisibleCanvasTemplatePreview({
  templateId,
}: {
  templateId: CanvasTemplateId;
}) {
  const { resolvedTheme } = useUiTheme();
  const contentTheme = useResolvedContentTheme(resolvedTheme);
  const projection = getCanvasTemplateMaterialization(templateId, contentTheme);
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === "undefined"
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host || visible || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "160px 0px" }
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div
      ref={hostRef}
      data-testid="canvas-template-preview-lazy-host"
      className="size-full"
    >
      {visible ? (
        <CellFrameCanvas
          source={projection.source}
          viewport={projection.viewport}
          fit="contain"
        />
      ) : null}
    </div>
  );
}

type CanvasTemplateLibraryProps = {
  templates?: readonly CanvasTemplateDefinition[];
  query?: string;
  emptyLabel?: string;
};

export function CanvasTemplateLibrary({
  templates: sourceTemplates = CANVAS_COMPONENT_TEMPLATES,
  query = "",
  emptyLabel = "No components found",
}: CanvasTemplateLibraryProps) {
  const [dragPreview, setDragPreview] =
    useState<CanvasTemplateDragPreview | null>(null);
  const pendingDragPositionRef = useRef<PendingDragPreviewPosition | null>(null);
  const dragPreviewFrameRef = useRef<number | null>(null);
  const nativeDragImageRef = useRef<HTMLCanvasElement | null>(null);
  const dragging = dragPreview !== null;
  const normalizedQuery = query.trim().toLowerCase();
  const templates = normalizedQuery
    ? sourceTemplates.filter((template) =>
        template.label.toLowerCase().includes(normalizedQuery)
      )
    : sourceTemplates;
  const sortedTemplates = sortTemplatesByLabel(templates);

  const cancelDragPreviewFrame = useCallback(() => {
    if (dragPreviewFrameRef.current === null) return;
    window.cancelAnimationFrame(dragPreviewFrameRef.current);
    dragPreviewFrameRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const context = nativeDragImageRef.current?.getContext("2d");
    if (!context) return;
    context.fillStyle = "rgba(0, 0, 0, 0.01)";
    context.fillRect(0, 0, 1, 1);
  }, []);

  const setNativeDragImage = useCallback((dataTransfer: DataTransfer) => {
    const dragImage = nativeDragImageRef.current;
    if (!dragImage) return;
    dataTransfer.setDragImage(dragImage, 0, 0);
  }, []);

  const clearDragPreview = useCallback(() => {
    cancelDragPreviewFrame();
    pendingDragPositionRef.current = null;
    setDragPreview(null);
  }, [cancelDragPreviewFrame]);

  const finishTemplateDrag = useCallback(() => {
    clearDragPreview();
    setActiveCanvasTemplateDragId(null);
  }, [clearDragPreview]);

  useEffect(() => {
    if (!dragging) return;

    const handleDocumentDragOver = (event: globalThis.DragEvent) => {
      const target = event.target;
      const overSidebar =
        target instanceof Element &&
        target.closest('[data-slot="sidebar"]') !== null;
      pendingDragPositionRef.current = {
        clientX: Number.isFinite(event.clientX) ? event.clientX : undefined,
        clientY: Number.isFinite(event.clientY) ? event.clientY : undefined,
        overSidebar,
      };
      setDragPreview((current) =>
        current && current.overSidebar !== overSidebar
          ? { ...current, overSidebar }
          : current
      );
      if (dragPreviewFrameRef.current !== null) return;
      dragPreviewFrameRef.current = window.requestAnimationFrame(() => {
        dragPreviewFrameRef.current = null;
        const pending = pendingDragPositionRef.current;
        if (!pending) return;
        setDragPreview((current) =>
          current
            ? {
                ...current,
                clientX: pending.clientX ?? current.clientX,
                clientY: pending.clientY ?? current.clientY,
                overSidebar: pending.overSidebar,
              }
            : null
        );
      });
    };

    const handleDocumentDrop = () => clearDragPreview();
    const handleWindowBlur = () => finishTemplateDrag();
    document.addEventListener("dragover", handleDocumentDragOver, true);
    document.addEventListener("drop", handleDocumentDrop, true);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      document.removeEventListener("dragover", handleDocumentDragOver, true);
      document.removeEventListener("drop", handleDocumentDrop, true);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [clearDragPreview, dragging, finishTemplateDrag]);

  useEffect(
    () => () => {
      cancelDragPreviewFrame();
      setActiveCanvasTemplateDragId(null);
    },
    [cancelDragPreviewFrame]
  );

  return (
    <>
      {typeof document === "undefined"
        ? null
        : createPortal(
            <canvas
              ref={nativeDragImageRef}
              data-slot="native-drag-image"
              width={1}
              height={1}
              className="pointer-events-none fixed left-0 top-0 size-px"
              aria-hidden="true"
            />,
            document.body
          )}
      <SidebarGroup className="p-0">
        <SidebarGroupContent>
          <div
            data-testid="canvas-template-grid"
            className="grid grid-cols-1 gap-1 p-1"
          >
            {sortedTemplates.length === 0 && (
              <div className="col-span-full px-2 py-4 text-xs text-muted-foreground">
                {emptyLabel}
              </div>
            )}
            {sortedTemplates.map((template) => (
              <SelectableItem
                key={template.id}
                data-onboarding-template-id={template.id}
                type="button"
                orientation="vertical"
                draggable
                onDragStart={(event) =>
                  handleTemplateDragStart(
                    event,
                    template,
                    setDragPreview,
                    setNativeDragImage
                  )
                }
                onDragEnd={finishTemplateDrag}
                className="group h-auto min-w-0 items-stretch gap-1 p-1.5 text-center"
              >
                <Surface kind="transparent" asChild>
                  <div
                    data-slot="canvas-template-preview"
                    data-testid="canvas-template-preview-viewport"
                    className="relative aspect-video w-full overflow-hidden"
                  >
                    <VisibleCanvasTemplatePreview templateId={template.id} />
                  </div>
                </Surface>
                <span className="truncate px-1 text-foreground">
                  {template.label}
                </span>
              </SelectableItem>
            ))}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
      <CanvasTemplateDragOverlay preview={dragPreview} />
    </>
  );
}
