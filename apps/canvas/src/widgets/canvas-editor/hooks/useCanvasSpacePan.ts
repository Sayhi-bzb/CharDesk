import type { KeyInput } from "@chardesk/keyboard";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  SHORTCUT_PRIORITY,
  useShortcutLayer,
} from "@/shared/shortcuts/dispatcher";

const isSpaceKey = (input: Pick<KeyInput, "code" | "key">) =>
  input.code === "Space" || input.key === " ";

export const useCanvasSpacePan = ({ enabled }: { enabled: boolean }) => {
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);

  const setTemporaryPan = useCallback((next: boolean) => {
    if (activeRef.current === next) return;
    activeRef.current = next;
    setActive(next);
  }, []);

  useShortcutLayer({
    id: "canvas-space-pan",
    priority: SHORTCUT_PRIORITY.canvasGesture,
    enabled,
    onKeyDown: (input, context) => {
      if (
        context.targetKind !== "managed-canvas" ||
        !isSpaceKey(input) ||
        input.modifiers.ctrl ||
        input.modifiers.meta ||
        input.modifiers.alt ||
        input.modifiers.shift
      ) {
        return;
      }
      if (!input.repeat) setTemporaryPan(true);
      return { claimed: true, preventDefault: true };
    },
    onKeyUp: (input) => {
      if (!isSpaceKey(input) || !activeRef.current) return;
      setTemporaryPan(false);
      return { claimed: true, preventDefault: true };
    },
  });

  useEffect(() => {
    if (enabled || !activeRef.current) return;
    queueMicrotask(() => setTemporaryPan(false));
  }, [enabled, setTemporaryPan]);

  useEffect(() => {
    const clearTemporaryPan = () => setTemporaryPan(false);
    const clearWhenHidden = () => {
      if (document.visibilityState !== "visible") clearTemporaryPan();
    };
    window.addEventListener("blur", clearTemporaryPan);
    document.addEventListener("visibilitychange", clearWhenHidden);
    return () => {
      window.removeEventListener("blur", clearTemporaryPan);
      document.removeEventListener("visibilitychange", clearWhenHidden);
      activeRef.current = false;
    };
  }, [setTemporaryPan]);

  return enabled && active;
};
