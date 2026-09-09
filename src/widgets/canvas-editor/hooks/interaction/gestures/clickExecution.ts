import type { Point } from "@/shared/types";
import type { CanvasLinkHit } from "../core/linkHitTesting";
import type { CanvasInteractionState } from "@/domains/editor/public";
import { resolveCanvasClickDecision, type CanvasClickDecision } from "./clickInteraction";

type RefCell<T> = { current: T };

export type CanvasClickExecutor = {
  preventDefault: () => void;
  clearColorPickerClick: () => void;
  openLink: (href: string) => void;
  setHoveredLink: (hit: CanvasLinkHit) => void;
};

export const executeCanvasClickDecision = (
  decision: CanvasClickDecision,
  executor: CanvasClickExecutor
): boolean => {
  switch (decision.type) {
    case "consume-color-picker-click":
      executor.clearColorPickerClick();
      executor.preventDefault();
      return true;
    case "open-link":
      executor.preventDefault();
      executor.openLink(decision.hit.href);
      executor.setHoveredLink(decision.hit);
      return true;
    case "none":
      return false;
  }
};



export const createCanvasClickExecutor = ({
  colorPickerClick,
  preventDefault,
  openLink,
  setHoveredLink,
}: {
  colorPickerClick: RefCell<boolean>;
  preventDefault: () => void;
  openLink: (href: string) => void;
  setHoveredLink: (hit: CanvasLinkHit) => void;
}): CanvasClickExecutor => ({
  preventDefault,
  clearColorPickerClick: () => {
    colorPickerClick.current = false;
  },
  openLink,
  setHoveredLink,
});

type CanvasClickHandler = ({
  linkHit,
  shouldOpenLink,
  preventDefault,
}: {
  linkHit: CanvasLinkHit | null;
  shouldOpenLink: boolean;
  preventDefault: () => void;
}) => boolean;

export const createCanvasClickHandler = ({
  getColorPickerClickPending,
  getInteractionMode,
  executor,
}: {
  getColorPickerClickPending: () => boolean;
  getInteractionMode: () => CanvasInteractionState["type"];
  executor: CanvasClickExecutor;
}): CanvasClickHandler => ({
  linkHit,
  shouldOpenLink,
  preventDefault,
}) =>
  executeCanvasClickDecision(
    resolveCanvasClickDecision({
      colorPickerClickPending: getColorPickerClickPending(),
      interactionMode: getInteractionMode(),
      linkHit,
      shouldOpenLink,
    }),
    {
      ...executor,
      preventDefault,
    }
  );
export type CanvasClickRouteHandler = ({
  clientPoint,
  preventDefault,
  resolveGridPoint,
  resolveLinkHit,
  shouldOpenLink,
}: {
  clientPoint: Point;
  preventDefault: () => void;
  resolveGridPoint: (clientPoint: Point) => Point | null;
  resolveLinkHit: (clientPoint: Point) => CanvasLinkHit | null;
  shouldOpenLink: () => boolean;
}) => boolean;

export const createCanvasClickRouteHandler = ({
  handler,
}: {
  handler: CanvasClickHandler;
}): CanvasClickRouteHandler =>
  ({
    clientPoint,
    preventDefault,
    resolveGridPoint,
    resolveLinkHit,
    shouldOpenLink,
  }) => {
    resolveGridPoint(clientPoint);
    return handler({
      linkHit: resolveLinkHit(clientPoint),
      shouldOpenLink: shouldOpenLink(),
      preventDefault,
    });
  };
