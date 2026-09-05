import { useCallback, useState } from "react";
import type { CellRangeCommand, CellRangeSnapshot } from "./range.js";

export type CellRangeState = Readonly<{
  snapshot: CellRangeSnapshot | null;
  dispatch: (command: CellRangeCommand) => void;
}>;

export const useCellRangeState = (): CellRangeState => {
  const [snapshot, setSnapshot] = useState<CellRangeSnapshot | null>(null);
  const dispatch = useCallback((command: CellRangeCommand) => {
    setSnapshot(command.type === "set" ? command.snapshot : null);
  }, []);
  return { snapshot, dispatch };
};
