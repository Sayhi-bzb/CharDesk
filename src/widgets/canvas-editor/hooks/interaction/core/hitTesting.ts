import type { CanvasLinkHit } from "./linkHitTesting";

export const isFromMinimap = (event: Event | undefined) => {
  const target = event?.target;
  return target instanceof Element && !!target.closest('[data-minimap-root="true"]');
};

export const isFromCanvasUi = (event: Event | undefined) => {
  const target = event?.target;
  if (target instanceof Element && target.closest('[data-canvas-ui="true"]')) return true;
  return (event?.composedPath?.() ?? []).some(
    (entry) =>
      entry instanceof Element &&
      entry.matches('[data-canvas-ui="true"], [data-canvas-ui="true"] *')
  );
};

export const shouldOpenCanvasLink = (
  event: Pick<MouseEvent, "ctrlKey" | "metaKey">
) => event.ctrlKey || event.metaKey;

export const shouldUseCanvasLinkPointer = (hit: CanvasLinkHit | null) => !!hit;
