import { useEffect, useState } from "react";
import { TOOLTIP_HOVER_DELAY_MS } from "./tooltip.js";

export const useCellTooltipTarget = (
  hoveredId: string | null,
  focusedId: string | null,
  focusVisible: boolean,
  pressActiveId: string | null,
) => {
  const [hoverReadyId, setHoverReadyId] = useState<string | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const focusTargetId = focusVisible ? focusedId : null;

  useEffect(() => {
    if (dismissedId && hoveredId !== dismissedId && focusTargetId !== dismissedId) {
      setDismissedId(null);
    }
  }, [dismissedId, focusTargetId, hoveredId]);

  useEffect(() => {
    setHoverReadyId(null);
    if (!hoveredId || pressActiveId || dismissedId === hoveredId) return;
    const timer = window.setTimeout(() => setHoverReadyId(hoveredId), TOOLTIP_HOVER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [dismissedId, hoveredId, pressActiveId]);

  const candidateId = focusTargetId ?? (pressActiveId ? null : hoverReadyId);
  const targetId = candidateId === dismissedId ? null : candidateId;
  return {
    targetId,
    dismissedId,
    dismiss: () => {
      setDismissedId(targetId ?? hoveredId ?? focusTargetId);
      setHoverReadyId(null);
    },
  };
};
