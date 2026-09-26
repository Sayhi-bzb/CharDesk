import { useCallback, useState } from "react";
import type { WidgetCommand } from "./interaction.js";
import type { CellPoint, WidgetId } from "./types.js";

export type CellScrollState = Readonly<{
  offset: (id: WidgetId) => CellPoint;
  dispatch: (command: WidgetCommand) => void;
}>;

const ORIGIN: CellPoint = { x: 0, y: 0 };

export const useCellScrollState = (): CellScrollState => {
  const [offsets, setOffsets] = useState<Readonly<Record<WidgetId, CellPoint>>>({});
  const offset = useCallback((id: WidgetId): CellPoint => offsets[id] ?? ORIGIN, [offsets]);
  const dispatch = useCallback((command: WidgetCommand): void => {
    const changes = command.type === "scroll"
      ? [command]
      : command.type === "focus"
        ? command.reveals ?? (command.reveal ? [command.reveal] : [])
        : [];
    if (changes.length === 0) return;
    setOffsets((current) => {
      let next: Record<WidgetId, CellPoint> | null = null;
      for (const { targetId, scrollX, scrollY } of changes) {
        const previous = (next ?? current)[targetId];
        if (previous?.x === scrollX && previous.y === scrollY) continue;
        next ??= { ...current };
        next[targetId] = { x: scrollX, y: scrollY };
      }
      return next ?? current;
    });
  }, []);
  return { offset, dispatch };
};
