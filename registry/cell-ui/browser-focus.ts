import { useCallback, useLayoutEffect, useRef, useState, type FocusEvent, type RefObject } from "react";

/** Logical focus belongs to FocusManager; this hook owns only browser focus presence. */
export const useSurfaceFocus = (ref: RefObject<HTMLElement | null>) => {
  const [active, setActive] = useState(false);
  const current = useRef(false);
  const windowActive = useRef(true);
  const alive = useRef(false);
  const publish = useCallback((next: boolean) => {
    current.current = next;
    setActive(next);
  }, []);
  const refresh = useCallback(() => {
    const surface = ref.current;
    publish(!!surface && windowActive.current && surface.contains(surface.ownerDocument.activeElement));
  }, [ref, publish]);
  const ownsFocus = useCallback(() => current.current, []);
  useLayoutEffect(() => {
    alive.current = true;
    const view = ref.current?.ownerDocument.defaultView;
    if (!view) return;
    windowActive.current = view.document.hasFocus();
    queueMicrotask(() => { if (alive.current) refresh(); });
    const blur = () => { windowActive.current = false; publish(false); };
    const focus = () => { windowActive.current = true; refresh(); };
    view.addEventListener("blur", blur);
    view.addEventListener("focus", focus);
    return () => {
      alive.current = false;
      view.removeEventListener("blur", blur);
      view.removeEventListener("focus", focus);
    };
  }, [ref, refresh, publish]);
  return {
    active,
    ownsFocus,
    enter: () => {
      windowActive.current = true;
      publish(true);
    },
    leave: (event: FocusEvent<HTMLElement>) => {
      if (event.relatedTarget !== null) {
        publish(windowActive.current && event.currentTarget.contains(event.relatedTarget));
      } else {
        // Allow internal semantic-node replacement to restore focus before checking body/null.
        queueMicrotask(() => { if (alive.current) refresh(); });
      }
    },
  };
};
