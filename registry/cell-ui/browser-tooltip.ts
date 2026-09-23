import { useEffect, useState } from "react";
import { TOOLTIP_HOVER_DELAY_MS } from "./tooltip.js";

export const useCellTooltipTarget = (
  hoveredId: string | null,
  focusedId: string | null,
  focusVisible: boolean,
  pressActiveId: string | null,
) => {
  const [hover, setHover] = useState({
    hoveredId,
    pressActiveId,
    readyId: null as string | null,
  });
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const focusTargetId = focusVisible ? focusedId : null;

  if (dismissedId && hoveredId !== dismissedId && focusTargetId !== dismissedId) {
    setDismissedId(null);
  }
  if (hover.hoveredId !== hoveredId || hover.pressActiveId !== pressActiveId) {
    setHover({ hoveredId, pressActiveId, readyId: null });
  }

  useEffect(() => {
    if (!hoveredId || pressActiveId || dismissedId === hoveredId) return;
    const timer = window.setTimeout(() => setHover((current) => ({ ...current, readyId: hoveredId })), TOOLTIP_HOVER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [dismissedId, hoveredId, pressActiveId]);

  const candidateId = focusTargetId ?? (pressActiveId ? null : hover.readyId);
  const targetId = candidateId === dismissedId ? null : candidateId;
  return {
    targetId,
    dismissedId,
    dismiss: () => {
      setDismissedId(targetId ?? hoveredId ?? focusTargetId);
      setHover((current) => ({ ...current, readyId: null }));
    },
  };
};
