import {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect,
  useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type CellOverlayDismissReason = "escape" | "outside";
export type CellOverlayPlacement = "bottom-start" | "top-start" | "right-start" | "center" | "right";

type OverlayEntry = Readonly<{
  id: string;
  element: HTMLElement;
  anchor: Element | null;
  modal: boolean;
  closeOnOutsideClick: boolean;
  onDismiss: (reason: CellOverlayDismissReason) => void;
}>;
type OverlayHost = Readonly<{
  layer: HTMLElement | null;
  register: (entry: OverlayEntry) => () => void;
}>;

const OverlayHostContext = createContext<OverlayHost | null>(null);

export function useCellOverlayLayer(): HTMLElement | null {
  const host = useContext(OverlayHostContext);
  if (!host) throw new Error("Cell overlay content requires CellOverlayHost.");
  return host.layer;
}

/** Coordinates portals, outside input, and focus across separate CellSurfaces. */
export function CellOverlayHost({ children }: Readonly<{ children: ReactNode }>) {
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const entries = useRef<OverlayEntry[]>([]);
  const inerted = useRef(new Map<HTMLElement, boolean>());
  const syncInert = useCallback(() => {
    if (entries.current.some((entry) => entry.modal)) {
      for (const child of document.body.children) {
        if (!(child instanceof HTMLElement) || child === layer || inerted.current.has(child)) continue;
        inerted.current.set(child, child.inert);
        child.inert = true;
      }
    } else {
      for (const [child, previous] of inerted.current) child.inert = previous;
      inerted.current.clear();
    }
  }, [layer]);
  useEffect(() => {
    const element = document.createElement("div");
    element.dataset.cellOverlayHost = "";
    Object.assign(element.style, {
      position: "fixed", inset: "0", pointerEvents: "none",
      zIndex: "var(--cell-overlay-layer, 1000)",
    });
    document.body.append(element);
    setLayer(element);
    return () => element.remove();
  }, []);
  const register = useCallback((entry: OverlayEntry) => {
    entries.current.push(entry);
    entries.current.forEach((item, index) => { item.element.style.zIndex = String(index + 1); });
    syncInert();
    return () => {
      entries.current = entries.current.filter((item) => item.id !== entry.id);
      entries.current.forEach((item, index) => { item.element.style.zIndex = String(index + 1); });
      syncInert();
    };
  }, [syncInert]);
  useEffect(() => {
    const observer = new MutationObserver(syncInert);
    observer.observe(document.body, { childList: true });
    return () => { observer.disconnect(); entries.current = []; syncInert(); };
  }, [syncInert]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const top = entries.current.at(-1);
      if (!top) return;
      event.preventDefault();
      event.stopPropagation();
      top.onDismiss("escape");
    };
    const pointerdown = (event: PointerEvent) => {
      const top = entries.current.at(-1);
      if (!top) return;
      const target = event.target;
      if (target instanceof Node && (top.element.contains(target) || top.anchor?.contains(target))) return;
      if (top.modal) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (top.closeOnOutsideClick) top.onDismiss("outside");
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("pointerdown", pointerdown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("pointerdown", pointerdown, true);
    };
  }, []);
  const value = useMemo(() => ({ layer, register }), [layer, register]);
  return <OverlayHostContext.Provider value={value}>{children}</OverlayHostContext.Provider>;
}

const clamp = (value: number, maximum: number) => Math.max(0, Math.min(value, maximum));

export const positionCellOverlay = (
  anchor: DOMRect | null,
  size: Readonly<{ width: number; height: number }>,
  viewport: Readonly<{ width: number; height: number }>,
  placement: CellOverlayPlacement,
): Readonly<{ left: number; top: number }> => {
  const gap = 4;
  const maxX = Math.max(0, viewport.width - size.width);
  const maxY = Math.max(0, viewport.height - size.height);
  if (placement === "center" || !anchor && placement !== "right") {
    return { left: clamp((viewport.width - size.width) / 2, maxX),
      top: clamp((viewport.height - size.height) / 2, maxY) };
  }
  if (placement === "right") return { left: maxX, top: 0 };
  if (!anchor) return { left: 0, top: 0 };
  if (placement === "right-start") {
    const left = anchor.right + gap + size.width <= viewport.width
      ? anchor.right + gap : anchor.left - size.width - gap;
    return { left: clamp(left, maxX), top: clamp(anchor.top, maxY) };
  }
  const below = anchor.bottom + gap;
  const above = anchor.top - size.height - gap;
  const top = placement === "top-start"
    ? above >= 0 ? above : below
    : below + size.height <= viewport.height ? below : above;
  return { left: clamp(anchor.left, maxX), top: clamp(top, maxY) };
};

export function CellOverlayPortal({ open, anchor, placement = "bottom-start", modal = false,
  closeOnOutsideClick = true, role, label, onDismiss, onKeyDown, children }: Readonly<{
  open: boolean;
  anchor?: Element | DOMRect | null;
  placement?: CellOverlayPlacement;
  modal?: boolean;
  closeOnOutsideClick?: boolean;
  role?: "dialog" | "alertdialog";
  label?: string;
  onDismiss: (reason: CellOverlayDismissReason) => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
}>) {
  const host = useContext(OverlayHostContext);
  if (!host) throw new Error("CellOverlayPortal requires CellOverlayHost.");
  const id = useId();
  const elementRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const previousFocus = useRef<HTMLElement | null>(null);
  const dismissReason = useRef<CellOverlayDismissReason | null>(null);
  const dismiss = useCallback((reason: CellOverlayDismissReason) => {
    dismissReason.current = reason;
    dismissRef.current(reason);
  }, []);
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!open || !element || !host.layer) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dismissReason.current = null;
    const anchorElement = anchor instanceof Element ? anchor : null;
    const update = () => {
      const size = element.getBoundingClientRect();
      const anchorBounds = anchorElement?.getBoundingClientRect()
        ?? (anchor && "left" in anchor ? anchor : null);
      const position = positionCellOverlay(anchorBounds, size,
        { width: window.innerWidth, height: window.innerHeight }, placement);
      element.style.left = `${position.left}px`;
      element.style.top = `${position.top}px`;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (anchorElement) observer.observe(anchorElement);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const unregister = host.register({ id, element, anchor: anchorElement, modal,
      closeOnOutsideClick, onDismiss: dismiss });
    const trapFocus = (event: KeyboardEvent) => {
      if (!modal || event.key !== "Tab" || event.defaultPrevented) return;
      const focusable = [...element.querySelectorAll<HTMLElement>(
        'button:not([disabled]),[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )].filter((target) => !target.inert && target.getClientRects().length > 0);
      if (focusable.length === 0) { event.preventDefault(); element.focus(); return; }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      const current = focusable.indexOf(document.activeElement as HTMLElement);
      if (current < 0) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    element.addEventListener("keydown", trapFocus);
    const focus = requestAnimationFrame(() => {
      element.querySelector<HTMLElement>('[data-focused="true"],[role="menuitem"],button,[tabindex="0"]')
        ?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(focus);
      unregister();
      element.removeEventListener("keydown", trapFocus);
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      if (dismissReason.current !== "outside") {
        const target = anchorElement instanceof HTMLElement && anchorElement.isConnected
          && (anchorElement.hasAttribute("tabindex") || anchorElement.matches("button,[href],input,select,textarea"))
          ? anchorElement : previousFocus.current;
        if (target?.isConnected) target.focus({ preventScroll: true });
      }
    };
  }, [anchor, closeOnOutsideClick, dismiss, host, id, modal, open, placement]);
  return open && host.layer ? createPortal(
    <div ref={elementRef} data-cell-overlay-portal="" tabIndex={-1} onKeyDown={onKeyDown}
      role={role} aria-label={label} aria-modal={modal && role ? true : undefined}
      style={{ position: "fixed", pointerEvents: "auto" }}>{children}</div>, host.layer,
  ) : null;
}

export function CellPopover(props: Omit<Parameters<typeof CellOverlayPortal>[0], "modal">) {
  return <CellOverlayPortal {...props} />;
}

export function CellContextMenu(props: Omit<Parameters<typeof CellOverlayPortal>[0], "anchor" | "modal" | "placement"> &
  Readonly<{ anchor: DOMRect | null }>) {
  return <CellOverlayPortal {...props} placement="bottom-start" />;
}

export function CellSheet(props: Omit<Parameters<typeof CellOverlayPortal>[0], "anchor" | "modal" | "placement" | "role"> &
  Readonly<{ label: string }>) {
  return <CellOverlayPortal {...props} role="dialog" modal placement="right" />;
}

export function CellAlertDialog(props: Omit<Parameters<typeof CellOverlayPortal>[0],
  "anchor" | "modal" | "placement" | "closeOnOutsideClick" | "role"> & Readonly<{ label: string }>) {
  return <CellOverlayPortal {...props} role="alertdialog" modal placement="center" closeOnOutsideClick={false} />;
}
