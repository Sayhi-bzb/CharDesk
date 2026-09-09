import { useEffect, useRef, useState, type DragEvent, type RefObject } from "react";
import type { Point } from "@/shared/types";
import type { CanvasMode } from "@/domains/sessions/public";
import { GridManager } from "@/shared/utils/grid";
import { gridCellRect } from "@/shared/metrics";
import { getTextCellWidth } from "@/shared/metrics";
import {
  CANVAS_TEMPLATE_MIME,
  getActiveCanvasTemplateDragId,
  getCanvasTemplate,
  getCanvasTemplateProjection,
  isCanvasTemplateId,
  setActiveCanvasTemplateDragId,
  type CanvasTemplateId,
} from "@/domains/canvas-templates/public";
import type { CanvasEditorModel } from "./canvasModels";

type CanvasTemplatePreviewState = {
  templateId: CanvasTemplateId;
  position: Point;
};

type UseCanvasTemplateDropOptions = {
  canvasMode: CanvasMode;
  containerRef: RefObject<HTMLDivElement | null>;
  model: CanvasEditorModel;
  enabled?: boolean;
};

export const useCanvasTemplateDrop = ({
  canvasMode,
  containerRef,
  model,
  enabled = true,
}: UseCanvasTemplateDropOptions) => {
  const [preview, setPreviewState] =
    useState<CanvasTemplatePreviewState | null>(null);
  const previewRef = useRef<CanvasTemplatePreviewState | null>(null);
  const pendingPreviewRef = useRef<CanvasTemplatePreviewState | null>(null);
  const previewRafRef = useRef<number | null>(null);

  const cancelPreviewFrame = () => {
    if (previewRafRef.current === null) return;
    window.cancelAnimationFrame(previewRafRef.current);
    previewRafRef.current = null;
  };

  const commitPreview = (next: CanvasTemplatePreviewState | null) => {
    pendingPreviewRef.current = next;
    previewRef.current = next;
    setPreviewState((current) => {
      if (
        current?.templateId === next?.templateId &&
        current?.position.x === next?.position.x &&
        current?.position.y === next?.position.y
      ) {
        return current;
      }
      return next;
    });
  };

  const schedulePreview = (next: CanvasTemplatePreviewState) => {
    const pending = pendingPreviewRef.current;
    if (
      pending?.templateId === next.templateId &&
      pending.position.x === next.position.x &&
      pending.position.y === next.position.y
    ) {
      return;
    }

    pendingPreviewRef.current = next;
    if (previewRafRef.current !== null) return;
    previewRafRef.current = window.requestAnimationFrame(() => {
      previewRafRef.current = null;
      commitPreview(pendingPreviewRef.current);
    });
  };

  const clearPreview = () => {
    cancelPreviewFrame();
    commitPreview(null);
  };

  useEffect(() => () => cancelPreviewFrame(), []);

  const hasTemplateData = (dataTransfer: DataTransfer) =>
    Array.from(dataTransfer.types).includes(CANVAS_TEMPLATE_MIME);

  const getDragPoint = (event: DragEvent<HTMLDivElement>): Point | null => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return GridManager.screenToGrid(
      event.clientX - rect.left,
      event.clientY - rect.top,
      model.offset.x,
      model.offset.y,
      model.zoom
    );
  };

  const getTemplateId = (
    dataTransfer: DataTransfer
  ): CanvasTemplateId | null => {
    const templateId = dataTransfer.getData(CANVAS_TEMPLATE_MIME);
    if (isCanvasTemplateId(templateId)) return templateId;
    return hasTemplateData(dataTransfer)
      ? getActiveCanvasTemplateDragId()
      : null;
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!enabled) return;
    if (canvasMode !== "freeform" || !hasTemplateData(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const templateId = getTemplateId(event.dataTransfer);
    const position = getDragPoint(event);
    if (templateId && position) schedulePreview({ templateId, position });
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!enabled) return;
    if (canvasMode !== "freeform") return;
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    clearPreview();
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!enabled) return;
    if (canvasMode !== "freeform") return;
    const templateId = getTemplateId(event.dataTransfer);
    if (!templateId) {
      clearPreview();
      setActiveCanvasTemplateDragId(null);
      return;
    }

    event.preventDefault();
    const latest = pendingPreviewRef.current ?? previewRef.current;
    const point =
      latest?.templateId === templateId ? latest.position : getDragPoint(event);
    if (!point) {
      clearPreview();
      setActiveCanvasTemplateDragId(null);
      return;
    }

    clearPreview();
    setActiveCanvasTemplateDragId(null);
    const template = getCanvasTemplate(templateId);
    model.insertRows(
      template.rows.map((row) => ({
        y: row.y,
        spans: row.spans.map((span) => ({
          ...span,
          width: getTextCellWidth(span.text),
        })),
      })),
      point,
      { selectResult: true }
    );
  };

  const cellRect =
    preview
      ? gridCellRect(preview.position, { offset: model.offset, zoom: model.zoom })
      : null;
  const projection = preview
    ? getCanvasTemplateProjection(preview.templateId)
    : null;

  return {
    surfaceProps: { onDragOver, onDragLeave, onDrop },
    preview:
      preview && cellRect && projection ? { cellRect, projection } : null,
  };
};

export type CanvasTemplateDropResult = ReturnType<typeof useCanvasTemplateDrop>;
