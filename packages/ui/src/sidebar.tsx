/* eslint-disable react-refresh/only-export-components */
"use client";

import * as React from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { cn } from "./utils.js";
import { Button } from "./button.js";
import { ContentScrollArea } from "./content-scroll-area.js";
import { rx } from "./recipes.js";
import { Surface } from "./surface.js";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./sheet.js";
import { useUiMessages } from "./ui-messages.js";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "2.5rem";
const SIDEBAR_HEIGHT = "32rem";
const SIDEBAR_HEIGHT_COLLAPSED = "3rem";
const SIDEBAR_MOTION_SETTLE_FALLBACK = 250;

function SidebarToggleIcon({
  side,
  isOpen,
}: {
  side: "left" | "right";
  isOpen: boolean;
}) {
  if (side === "right") {
    return isOpen ? <PanelRightClose /> : <PanelRightOpen />;
  }
  return isOpen ? <PanelLeftClose /> : <PanelLeftOpen />;
}

type SidebarPresentation = "docked" | "overlay" | "sheet";
type SidebarMotionPhase =
  | "collapsed"
  | "expanding"
  | "expanded"
  | "collapsing";

type SidebarContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  presentation: SidebarPresentation;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  presentation = "docked",
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  presentation?: SidebarPresentation;
}) {
  const isMobile = presentation === "sheet";
  const [openMobile, setOpenMobile] = React.useState(false);
  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [setOpenProp, open]
  );

  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open);
  }, [isMobile, setOpen, setOpenMobile]);

  const state = open ? "expanded" : "collapsed";
  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      presentation,
    }),
    [
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      presentation,
    ]
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            "--sidebar-height": SIDEBAR_HEIGHT,
            "--sidebar-height-collapsed": SIDEBAR_HEIGHT_COLLAPSED,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-0 w-full",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  collapsedAppearance = "rail",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
  collapsedAppearance?: "rail" | "trigger";
}) {
  const { state, openMobile, setOpenMobile, presentation } = useSidebar();
  const mobileContentRef = React.useRef<HTMLDivElement>(null);
  const messages = useUiMessages();
  const callerOnTransitionEnd = props.onTransitionEnd;
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const isTriggerCollapsed =
    state === "collapsed" && collapsedAppearance === "trigger";
  const [motionPhase, setMotionPhase] = React.useState<SidebarMotionPhase>(() =>
    isTriggerCollapsed ? "collapsed" : "expanded"
  );

  React.useLayoutEffect(() => {
    const stablePhase = isTriggerCollapsed ? "collapsed" : "expanded";
    if (collapsedAppearance !== "trigger" || reducedMotion) {
      setMotionPhase(stablePhase);
      return;
    }

    setMotionPhase((currentPhase) => {
      if (isTriggerCollapsed) {
        return currentPhase === "collapsed" ? currentPhase : "collapsing";
      }
      return currentPhase === "expanded" ? currentPhase : "expanding";
    });
  }, [collapsedAppearance, isTriggerCollapsed, reducedMotion]);

  React.useEffect(() => {
    if (motionPhase === "collapsed" || motionPhase === "expanded") return;
    const timeoutId = window.setTimeout(() => {
      setMotionPhase(isTriggerCollapsed ? "collapsed" : "expanded");
    }, SIDEBAR_MOTION_SETTLE_FALLBACK);
    return () => window.clearTimeout(timeoutId);
  }, [isTriggerCollapsed, motionPhase]);

  const surfaceIsCollapsed =
    collapsedAppearance === "trigger" && motionPhase === "collapsed";

  const handleTransitionEnd: React.TransitionEventHandler<HTMLDivElement> =
    (event) => {
      callerOnTransitionEnd?.(event);
      if (
        collapsedAppearance !== "trigger" ||
        event.currentTarget !== event.target ||
        event.propertyName !== "--chardesk-sidebar-height"
      ) {
        return;
      }
      setMotionPhase(isTriggerCollapsed ? "collapsed" : "expanded");
    };

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  if (presentation === "sheet") {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          ref={mobileContentRef}
          tabIndex={-1}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            mobileContentRef.current?.focus({ preventScroll: true });
          }}
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="text-sidebar-foreground w-(--sidebar-width) p-0 [&>button]:hidden"
          style={
            { "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{messages.sidebarTitle}</SheetTitle>
            <SheetDescription>{messages.sidebarMobileDescription}</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="group peer size-full min-h-0 overflow-visible text-sidebar-foreground"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-collapsed-appearance={collapsedAppearance}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      <div
        data-slot="sidebar-gap"
        className={cn(
          "hidden",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
      />
      <Surface
        asChild
        kind={
          variant !== "floating"
            ? "transparent"
            : surfaceIsCollapsed
              ? "transparent"
              : "floating"
        }
        animated={
          variant === "floating" && collapsedAppearance !== "trigger"
        }
      >
        <div
          data-slot="sidebar-container"
          data-motion-phase={
            collapsedAppearance === "trigger" ? motionPhase : undefined
          }
          className={cn(
            "pointer-events-auto relative flex w-full min-h-0 min-w-0 overflow-hidden",
            collapsedAppearance === "trigger"
              ? cn(
                  "h-[var(--chardesk-sidebar-height)] transition-[--chardesk-sidebar-height,background-color,box-shadow] duration-[var(--motion-standard)] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                  isTriggerCollapsed
                    ? "[--chardesk-sidebar-height:var(--sidebar-height-collapsed)]"
                    : "[--chardesk-sidebar-height:100%]"
                )
              : "h-full",
            className
          )}
          {...props}
          onTransitionEnd={handleTransitionEnd}
        >
          <div
            data-sidebar="sidebar"
            data-slot="sidebar-inner"
            className={cn(
              "flex h-full w-full flex-col overflow-hidden",
              variant === "floating"
                ? "rounded-[inherit] bg-transparent"
                : "bg-sidebar"
            )}
          >
            {children}
          </div>
        </div>
      </Surface>
    </div>
  );
}

function SidebarTrigger({
  className,
  onClick,
  side = "left",
  ...props
}: React.ComponentProps<typeof Button> & { side?: "left" | "right" }) {
  const { toggleSidebar, state, isMobile, openMobile } = useSidebar();
  const messages = useUiMessages();
  const isOpen = isMobile ? openMobile : state === "expanded";
  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      tone="subtle"
      shape="square"
      size="md"
      className={cn("pointer-events-auto", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <SidebarToggleIcon side={side} isOpen={isOpen} />
      <span className="sr-only">{messages.sidebarToggle}</span>
    </Button>
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarContent({
  className,
  children,
  contentClassName,
  contentScroll = "shared",
  ...props
}: React.ComponentProps<typeof ContentScrollArea> & {
  contentClassName?: string;
  contentScroll?: "shared" | "none";
}) {
  if (contentScroll === "shared") {
    return (
      <ContentScrollArea
        data-slot="sidebar-content"
        data-sidebar="content"
        className={cn(
          "min-h-0 flex-1 group-data-[collapsible=icon]:[&_[data-slot=scroll-area-scrollbar]]:hidden group-data-[collapsible=icon]:[&_[data-slot=scroll-area-viewport]]:overflow-hidden!",
          className
        )}
        {...props}
      >
        <div
          data-slot="sidebar-scroll-content"
          className={cn(
            "flex min-h-full min-w-0 flex-col gap-2",
            contentClassName
          )}
        >
          {children}
        </div>
      </ContentScrollArea>
    );
  }

  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-hidden",
        className,
        contentClassName
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full", rx.panelText(), className)}
      {...props}
    />
  );
}

function SidebarStandard({
  children,
  collapsedContent,
  collapsedAppearance = "rail",
  header,
  icon,
  title,
  footer,
  contentScroll = "shared",
  contentClassName,
  className,
  side = "left",
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  collapsedContent?: React.ReactNode;
  collapsedAppearance?: "rail" | "trigger";
  header?: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
  footer?: React.ReactNode;
  contentScroll?: "shared" | "none";
  contentClassName?: string;
}) {
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;
  const hideContent =
    isCollapsed &&
    (collapsedAppearance === "trigger" || collapsedContent === undefined);
  const bodyClassName = cn(
    "gap-2 px-2 py-2",
    isCollapsed &&
      collapsedAppearance === "rail" &&
      collapsedContent &&
      "px-1 py-2",
    contentClassName
  );

  return (
    <Sidebar
      side={side}
      collapsible="icon"
      collapsedAppearance={collapsedAppearance}
      className={className}
      {...props}
    >
      {header ?? (
        <SidebarHeader
          className={cn(
            "flex py-4 transition-[padding,gap] duration-[var(--motion-standard)] motion-reduce:transition-none",
            isCollapsed
              ? "flex-col items-center justify-center gap-y-4"
              : "flex-row items-center justify-between px-4"
          )}
        >
          <div className="flex items-center gap-2">
            {icon && <div className="shrink-0">{icon}</div>}
            {!isCollapsed && title && (
              <span
                className={cn(
                  rx.panelHeading(),
                  "whitespace-nowrap animate-in fade-in duration-[var(--motion-standard)] motion-reduce:animate-none"
                )}
              >
                {title}
              </span>
            )}
          </div>
          <div
            className={cn(
              "flex items-center gap-2",
              isCollapsed ? "flex-col-reverse" : "flex-row"
            )}
          >
            <SidebarTrigger side={side} />
          </div>
        </SidebarHeader>
      )}

      <SidebarContent
        contentScroll={contentScroll}
        aria-hidden={hideContent || undefined}
        inert={hideContent || undefined}
        className={cn(
          "transition-[opacity,transform] duration-[var(--motion-standard)] ease-out motion-reduce:transition-none motion-reduce:transform-none",
          hideContent
            ? "pointer-events-none translate-x-2 opacity-0"
            : "translate-x-0 opacity-100",
          collapsedAppearance === "trigger" && !isCollapsed && "delay-[60ms]",
          contentScroll === "none" && bodyClassName
        )}
        contentClassName={contentScroll === "shared" ? bodyClassName : undefined}
      >
        {isCollapsed && collapsedAppearance === "rail" && collapsedContent
          ? collapsedContent
          : children}
      </SidebarContent>

      {footer && (
        <SidebarFooter
          className={cn(
            "p-2 transition-[padding] duration-[var(--motion-standard)] ease-linear motion-reduce:transition-none",
            isCollapsed && "flex-col items-center gap-y-2 px-0"
          )}
        >
          {footer}
        </SidebarFooter>
      )}
    </Sidebar>
  );
}

export {
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarTrigger,
  SidebarProvider,
  SidebarStandard,
  useSidebar,
};
