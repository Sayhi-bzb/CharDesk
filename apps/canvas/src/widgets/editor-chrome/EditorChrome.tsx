import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@chardesk/ui";
import {
  EditorChromeContext,
  useEditorChromeLayout,
  type EditorChromeContextValue,
} from "./useEditorChromeLayout";
import {
  EMPTY_VIEWPORT_FRAME,
  resolveEditorFormFactor,
  resolveEditorViewportFrame,
  resolveSidebarPresentation,
  type EditorChromeEdge,
  type EditorChromeSlot,
  type EditorFormFactor,
  type EditorViewportFrame,
} from "./types";

type RegisteredRegion = {
  edge: EditorChromeEdge;
  node: HTMLElement;
};

const sameViewportFrame = (
  left: EditorViewportFrame,
  right: EditorViewportFrame
) =>
  left.width === right.width &&
  left.height === right.height &&
  left.insets.top === right.insets.top &&
  left.insets.right === right.insets.right &&
  left.insets.bottom === right.insets.bottom &&
  left.insets.left === right.insets.left;

export function EditorChromeProvider({ children }: { children: ReactNode }) {
  const shellNodeRef = useRef<HTMLDivElement | null>(null);
  const viewportNodeRef = useRef<HTMLDivElement | null>(null);
  const regionsRef = useRef(new Map<string, RegisteredRegion>());
  const observerRef = useRef<ResizeObserver | null>(null);
  const [formFactor, setFormFactor] = useState<EditorFormFactor>("desktop");
  const [viewportFrame, setViewportFrame] = useState<EditorViewportFrame>(
    EMPTY_VIEWPORT_FRAME
  );

  const measure = useCallback(() => {
    const shellNode = shellNodeRef.current;
    const viewportNode = viewportNodeRef.current;
    if (!shellNode || !viewportNode) return;

    const shellRect = shellNode.getBoundingClientRect();
    const viewportRect = viewportNode.getBoundingClientRect();
    setFormFactor(resolveEditorFormFactor(shellRect.width));

    const nextFrame = resolveEditorViewportFrame(
      viewportRect,
      [...regionsRef.current.values()].map(({ edge, node }) => ({
        edge,
        rect: node.getBoundingClientRect(),
      }))
    );
    setViewportFrame((current) =>
      sameViewportFrame(current, nextFrame) ? current : nextFrame
    );
  }, []);

  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      measure();
      return;
    }
    const observer = new ResizeObserver(measure);
    observerRef.current = observer;
    if (shellNodeRef.current) observer.observe(shellNodeRef.current);
    if (viewportNodeRef.current) observer.observe(viewportNodeRef.current);
    for (const { node } of regionsRef.current.values()) observer.observe(node);
    measure();
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [measure]);

  const setShellNode = useCallback(
    (node: HTMLDivElement | null) => {
      const previous = shellNodeRef.current;
      if (previous) observerRef.current?.unobserve(previous);
      shellNodeRef.current = node;
      if (node) observerRef.current?.observe(node);
      measure();
    },
    [measure]
  );

  const setViewportNode = useCallback(
    (node: HTMLDivElement | null) => {
      const previous = viewportNodeRef.current;
      if (previous) observerRef.current?.unobserve(previous);
      viewportNodeRef.current = node;
      if (node) observerRef.current?.observe(node);
      measure();
    },
    [measure]
  );

  const registerRegion = useCallback(
    (id: string, edge: EditorChromeEdge, node: HTMLElement | null) => {
      const previous = regionsRef.current.get(id);
      if (previous) observerRef.current?.unobserve(previous.node);
      if (node) {
        regionsRef.current.set(id, { edge, node });
        observerRef.current?.observe(node);
      } else {
        regionsRef.current.delete(id);
      }
      measure();
    },
    [measure]
  );

  const value = useMemo<EditorChromeContextValue>(
    () => ({
      formFactor,
      sidebarPresentation: resolveSidebarPresentation(formFactor),
      viewportFrame,
      setShellNode,
      setViewportNode,
      registerRegion,
    }),
    [formFactor, registerRegion, setShellNode, setViewportNode, viewportFrame]
  );

  return (
    <EditorChromeContext.Provider value={value}>
      {children}
    </EditorChromeContext.Provider>
  );
}

const slotPosition: Record<EditorChromeSlot, string> = {
  "top-start": "editor-chrome-top-start",
  "top-center": "editor-chrome-top-center -translate-x-1/2",
  "top-end": "editor-chrome-top-end",
  "side-end": "editor-chrome-side-end",
  "bottom-start": "editor-chrome-bottom-start",
  "bottom-center": "editor-chrome-bottom-center -translate-x-1/2",
  "bottom-end": "editor-chrome-bottom-end",
};

function EditorChromeRegion({
  id,
  slot,
  reserve,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  id: string;
  slot: EditorChromeSlot;
  reserve?: boolean;
  children: ReactNode;
}) {
  const { registerRegion } = useEditorChromeLayout();
  const edge: EditorChromeEdge = slot === "side-end"
    ? "right"
    : slot.startsWith("top")
      ? "top"
      : "bottom";
  const setNode = useCallback(
    (node: HTMLDivElement | null) => {
      registerRegion(id, edge, reserve === false ? null : node);
    },
    [edge, id, registerRegion, reserve]
  );

  return (
    <div
      ref={setNode}
      data-editor-chrome-region={slot}
      data-editor-chrome-reserved={reserve === false ? "false" : "true"}
      className={cn(
        "pointer-events-auto absolute z-(--layer-chrome)",
        slotPosition[slot],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type EditorChromeLayoutProps = {
  canvas: ReactNode;
  sidebar?: ReactNode;
  sidebarOpen: boolean;
  topStart?: ReactNode;
  topCenter?: ReactNode;
  topEnd?: ReactNode;
  bottomStart?: ReactNode;
  bottomCenter?: ReactNode;
  bottomEnd?: ReactNode;
};

export function EditorChromeLayout({
  canvas,
  sidebar,
  sidebarOpen,
  topStart,
  topCenter,
  topEnd,
  bottomStart,
  bottomCenter,
  bottomEnd,
}: EditorChromeLayoutProps) {
  const {
    formFactor,
    sidebarPresentation,
    setShellNode,
    setViewportNode,
  } = useEditorChromeLayout();
  const persistentSidebar = sidebarPresentation !== "sheet" && sidebar;

  return (
    <div
      ref={setShellNode}
      data-editor-form-factor={formFactor}
      className="chardesk-editor relative size-full min-h-0 min-w-0 overflow-hidden bg-background"
    >
      <main
        ref={setViewportNode}
        data-testid="editor-viewport"
        className="relative size-full min-h-0 min-w-0 overflow-hidden"
      >
        {canvas}
        <div className="pointer-events-none absolute inset-0 z-(--layer-chrome)">
          {topStart && (
            <EditorChromeRegion id="top-start" slot="top-start">
              {topStart}
            </EditorChromeRegion>
          )}
          {topCenter && (
            <EditorChromeRegion id="top-center" slot="top-center">
              {topCenter}
            </EditorChromeRegion>
          )}
          {topEnd && (
            <EditorChromeRegion id="top-end" slot="top-end">
              {topEnd}
            </EditorChromeRegion>
          )}
          {bottomStart && (
            <EditorChromeRegion id="bottom-start" slot="bottom-start">
              {bottomStart}
            </EditorChromeRegion>
          )}
          {bottomCenter && (
            <EditorChromeRegion id="bottom-center" slot="bottom-center">
              {bottomCenter}
            </EditorChromeRegion>
          )}
          {persistentSidebar && (
            <EditorChromeRegion
              id="side-end"
              slot="side-end"
              reserve={sidebarOpen}
              className={cn(
                "pointer-events-none transition-[width] duration-[var(--motion-standard)] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                sidebarOpen
                  ? "w-[var(--sidebar-width,16rem)]"
                  : "w-[var(--sidebar-width-icon,2.5rem)]"
              )}
            >
              {sidebar}
            </EditorChromeRegion>
          )}
          {bottomEnd && (
            <EditorChromeRegion id="bottom-end" slot="bottom-end">
              {bottomEnd}
            </EditorChromeRegion>
          )}
        </div>
      </main>
      {sidebarPresentation === "sheet" && sidebar}
    </div>
  );
}
