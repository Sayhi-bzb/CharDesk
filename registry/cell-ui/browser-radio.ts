import { useState } from "react";
import type { WidgetCommand } from "./interaction.js";

export type CellRadioItem = Readonly<{ id: string; value: string; label: string; disabled?: boolean }>;
export type CellRadioOptions = Readonly<{
  value?: string | null;
  defaultValue?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
}>;

/** Business selection belongs here; focus/press/confirmation remain Surface-owned. */
export function useCellRadioState(items: readonly CellRadioItem[], options: CellRadioOptions = {}) {
  const [internalValue, setInternalValue] = useState<string | null>(options.defaultValue ?? null);
  const value = options.value !== undefined ? options.value : internalValue;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const enabled = items.filter((item) => !options.disabled && !item.disabled);
  const dispatch = (command: WidgetCommand) => {
    if (command.type !== "focus" && command.type !== "activate" && command.type !== "select-radio") return;
    const item = enabled.find((candidate) => candidate.id === command.targetId);
    if (!item) return;
    setFocusedId(item.id);
    if (command.type !== "focus" && item.value !== value) {
      if (options.value === undefined) setInternalValue(item.value);
      options.onValueChange?.(item.value);
    }
  };
  return {
    items, value, dispatch,
    focusedId: enabled.find((item) => item.id === focusedId)?.id
      ?? enabled.find((item) => item.value === value)?.id ?? enabled[0]?.id ?? null,
  };
}
